import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { WARNING_CODES } from '../src';
import { extractSVGElements } from './helpers';

const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const TMP_DIR = join(__dirname, 'tmp');
/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());

function runCli(args: string[], input?: string): { stdout: string; stderr: string; status: number } {
  try {
    const result = spawnSync('npx', ['tsx', CLI_PATH, ...args], {
      input,
      encoding: 'utf-8',
      cwd: join(__dirname, '..'),
    });
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status ?? 1,
    };
  } catch (err) {
    return {
      stdout: '',
      stderr: (err as Error).message,
      status: 1,
    };
  }
}

/** A program that draws "A" from the font a directive loads, after `M 10 100`. */
function glyphProgram(fontDirective: string, family: string): string {
  return `${fontDirective}\nlet g = PathBlock.fromGlyph("A", #{ font-family: ${family}; font-size: 48; });\nM 10 100\ng[0].draw()\n`;
}

/** The path data of a run that drew its glyph: it succeeded, said nothing, and printed more than the move. */
function drawnGlyph(result: { status: number; stdout: string; stderr: string }): string {
  expect([result.status, result.stderr]).toEqual([0, '']);
  expect(result.stdout.startsWith('M 10 100 ')).toBe(true);
  return result.stdout;
}

describe('CLI', () => {
  beforeAll(() => {
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup tmp files
    const files = ['test-input.svgx', 'test-output.txt', 'test-output.svg', 'test-logs.json'];
    for (const file of files) {
      const path = join(TMP_DIR, file);
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  describe('help and version', () => {
    it('shows help with -h', () => {
      const result = runCli(['-h']);
      expect(result.stdout).toContain('pathogen-lang');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Options:');
    });

    it('shows help with --help', () => {
      const result = runCli(['--help']);
      expect(result.stdout).toContain('pathogen-lang');
    });

    it('shows version with -v', () => {
      const result = runCli(['-v']);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('shows version with --version', () => {
      const result = runCli(['--version']);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('inline code with -e', () => {
    it('compiles simple inline code', () => {
      const result = runCli(['-e', 'M 0 0 L 10 20']);
      expect(result.stdout.trim()).toBe('M 0 0 L 10 20');
    });

    it('compiles code with variables', () => {
      const result = runCli(['-e', 'let x = 10; M x 0']);
      expect(result.stdout.trim()).toBe('M 10 0');
    });

    it('compiles code with calc expressions', () => {
      const result = runCli(['-e', 'M calc(5 + 5) calc(10 * 2)']);
      expect(result.stdout.trim()).toBe('M 10 20');
    });

    it('compiles stdlib function calls', () => {
      const result = runCli(['-e', 'circle(100, 100, 50);']);
      expect(result.stdout.trim()).toBe('M 50 100 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0');
    });

    it('errors when -e has no argument', () => {
      const result = runCli(['-e']);
      expect(result.stderr).toContain('Error');
      expect(result.status).not.toBe(0);
    });
  });

  describe('file input', () => {
    const inputFile = join(TMP_DIR, 'test-input.svgx');

    it('compiles file with --src flag', () => {
      writeFileSync(inputFile, 'let r = 25; circle(50, 50, r);');
      const result = runCli([`--src=${inputFile}`]);
      expect(result.stdout.trim()).toBe('M 25 50 a 25 25 0 1 1 50 0 a 25 25 0 1 1 -50 0');
    });

    it('compiles file as positional argument', () => {
      writeFileSync(inputFile, 'M 0 0 L 100 100');
      const result = runCli([inputFile]);
      expect(result.stdout.trim()).toBe('M 0 0 L 100 100');
    });

    it('errors on non-existent file with --src', () => {
      const result = runCli(['--src=/nonexistent/file.svgx']);
      expect(result.stderr).toContain('Error');
      expect(result.status).not.toBe(0);
    });

    it('errors on non-existent file as positional', () => {
      const result = runCli(['/nonexistent/file.svgx']);
      expect(result.stderr).toContain('Error');
      expect(result.status).not.toBe(0);
    });
  });

  describe('output options', () => {
    const inputFile = join(TMP_DIR, 'test-input.svgx');
    const outputTxt = join(TMP_DIR, 'test-output.txt');
    const outputSvg = join(TMP_DIR, 'test-output.svg');

    beforeEach(() => {
      // Cleanup before each test
      if (existsSync(outputTxt)) unlinkSync(outputTxt);
      if (existsSync(outputSvg)) unlinkSync(outputSvg);
    });

    it('writes path to file with -o', () => {
      writeFileSync(inputFile, 'circle(100, 100, 50);');
      runCli([`--src=${inputFile}`, '-o', outputTxt]);
      expect(existsSync(outputTxt)).toBe(true);
      const content = readFileSync(outputTxt, 'utf-8');
      expect(content.trim()).toBe('M 50 100 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0');
    });

    it('writes path to file with --output', () => {
      writeFileSync(inputFile, 'M 10 20');
      runCli([`--src=${inputFile}`, '--output', outputTxt]);
      expect(existsSync(outputTxt)).toBe(true);
    });

    it("applies a text layer's transform to every <text> in the SVG file", () => {
      writeFileSync(
        inputFile,
        "let font = 'sans-serif';\nlet t = TextLayer('t') #{ font-family: font; rotate: -0.5pi; };\nt.apply { text(10, 20)`a`; text(30, 40, 30deg)`b`; }",
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      const svg = readFileSync(outputSvg, 'utf-8');
      expect(svg).toMatch(/<text data-layer-name="t" id="t" x="10" y="20" transform="rotate\(-90(\.0+)?\)"/);
      expect(svg).toMatch(/x="30" y="40" transform="rotate\(-90(\.0+)?\) rotate\((30|29\.9+\d*), 30, 40\)"/);
    });

    it('writes a marker-scope: subpath layer as a group of paths', () => {
      writeFileSync(
        inputFile,
        "let tip = @{ m 0 0 l 6 3 l -6 3 z };\nlet arrowMarker = Marker('arrow', 6, 6) {|m| m.append(tip, #{ fill: context-stroke; }); };\nlet d1 = PathLayer('dims') #{ stroke: #333; fill: none; marker-end: arrowMarker; marker-scope: subpath; };\nd1.apply {\n  M 10 20\n  L 90 20\n  M 10 40\n  L 90 40\n}",
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      const svg = readFileSync(outputSvg, 'utf-8');
      expect(svg).toMatch(
        /<g data-layer-name="dims" id="dims" fill="none" stroke="#333" stroke-width="2" marker-end="url\(#arrow\)">/,
      );
      expect(svg).toContain('<path d="M 10 20 L 90 20"/>');
      expect(svg).toContain('<path d="M 10 40 L 90 40"/>');
      expect(svg).not.toContain('marker-scope');
    });

    it('writes SVG file with --output-svg-file', () => {
      writeFileSync(inputFile, 'circle(100, 100, 50);');
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      expect(existsSync(outputSvg)).toBe(true);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(content).toContain('<path');
      expect(content).toContain('</svg>');
    });

    it('SVG output includes path data', () => {
      runCli(['-e', 'M 10 20 L 30 40', `--output-svg-file=${outputSvg}`]);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('d="M 10 20 L 30 40"');
    });
  });

  describe('SVG styling options', () => {
    const outputSvg = join(TMP_DIR, 'test-output.svg');

    beforeEach(() => {
      if (existsSync(outputSvg)) unlinkSync(outputSvg);
    });

    it('uses default styling', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`]);
      const content = readFileSync(outputSvg, 'utf-8');
      const [svg] = extractSVGElements(content, 'svg');
      expect(svg).toMatchObject({ viewBox: '0 0 200 200', width: '200', height: '200' });
      const [path] = extractSVGElements(content, 'path');
      expect(path).toMatchObject({ stroke: '#000', fill: 'none', 'stroke-width': '2' });
    });

    it('applies custom viewBox', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--viewBox=0 0 400 400']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('viewBox="0 0 400 400"');
    });

    it('applies custom width and height', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--width=300', '--height=150']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('width="300"');
      expect(content).toContain('height="150"');
    });

    it('applies custom stroke color', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--stroke=red']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('stroke="red"');
    });

    it('applies custom fill color', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--fill=blue']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('fill="blue"');
    });

    it('applies custom stroke width', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--stroke-width=5']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('stroke-width="5"');
    });

    it('applies multiple styling options', () => {
      runCli([
        '-e',
        'M 0 0',
        `--output-svg-file=${outputSvg}`,
        '--stroke=green',
        '--fill=yellow',
        '--stroke-width=3',
        '--viewBox=0 0 500 500',
      ]);
      const content = readFileSync(outputSvg, 'utf-8');
      const [svg] = extractSVGElements(content, 'svg');
      expect(svg).toMatchObject({ viewBox: '0 0 500 500' });
      const [path] = extractSVGElements(content, 'path');
      expect(path).toMatchObject({ stroke: 'green', fill: 'yellow', 'stroke-width': '3' });
    });

    it('source `define ViewBox` overrides --viewBox flag', () => {
      runCli([
        '-e',
        'define ViewBox(0, 0, 300, 300); M 0 0',
        `--output-svg-file=${outputSvg}`,
        '--viewBox=0 0 100 100',
        '--width=100',
        '--height=100',
      ]);
      const content = readFileSync(outputSvg, 'utf-8');
      const [svg] = extractSVGElements(content, 'svg');
      expect(svg).toMatchObject({ viewBox: '0 0 300 300', width: '300', height: '300' });
    });

    it('--viewBox flag is used when source has no `define ViewBox`', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--viewBox=0 0 100 100', '--width=100', '--height=100']);
      const content = readFileSync(outputSvg, 'utf-8');
      const [svg] = extractSVGElements(content, 'svg');
      expect(svg).toMatchObject({ viewBox: '0 0 100 100', width: '100', height: '100' });
    });
  });

  describe('error handling', () => {
    it('shows help when no arguments provided', () => {
      const result = runCli([]);
      expect(result.stdout).toContain('Usage:');
    });

    it('reports compilation errors', () => {
      const result = runCli(['-e', 'let x = @;']);
      expect(result.stderr).toContain('Error');
      expect(result.status).not.toBe(0);
    });

    it('reports undefined variable errors', () => {
      const result = runCli(['-e', 'M unknownVar 0']);
      expect(result.stderr).toContain('Error');
      expect(result.status).not.toBe(0);
    });
  });

  describe('complex examples', () => {
    it('compiles for loops', () => {
      // 0..3 is inclusive: 0, 1, 2, 3
      const result = runCli(['-e', 'for (i in 0..3) { M calc(i * 10) 0 }']);
      expect(result.stdout.trim()).toBe('M 0 0 M 10 0 M 20 0 M 30 0');
    });

    it('compiles if statements', () => {
      const result = runCli(['-e', 'let x = 5; if (x > 3) { M 100 100 }']);
      expect(result.stdout.trim()).toBe('M 100 100');
    });

    it('compiles user-defined functions', () => {
      const result = runCli(['-e', 'fn sq(x, y, s) { rect(x, y, s, s); } sq(10, 10, 20);']);
      expect(result.stdout.trim()).toBe('M 10 10 l 20 0 l 0 20 l -20 0 z');
    });

    it('compiles nested loops', () => {
      const result = runCli(['-e', 'for (i in 0..2) { for (j in 0..2) { M calc(i * 10) calc(j * 10) } }']);
      expect(result.stdout).toContain('M 0 0');
      expect(result.stdout).toContain('M 0 10');
      expect(result.stdout).toContain('M 10 0');
      expect(result.stdout).toContain('M 10 10');
    });
  });

  describe('--print-logs', () => {
    it('prints log output to stderr', () => {
      const result = runCli(['-e', 'let x = 42; log(x); M x 0', '--print-logs']);
      expect(result.stderr).toContain('x = 42');
      // Path data still goes to stdout
      expect(result.stdout.trim()).toBe('M 42 0');
    });

    it('prints multiple log entries', () => {
      const result = runCli(['-e', 'log("hello"); log("world"); M 0 0', '--print-logs']);
      expect(result.stderr).toContain('hello');
      expect(result.stderr).toContain('world');
    });

    it('includes line numbers in log output', () => {
      const result = runCli(['-e', 'log("test"); M 0 0', '--print-logs']);
      expect(result.stderr).toMatch(/\[line \d+\]/);
    });

    it('produces no stderr log output without --print-logs', () => {
      const result = runCli(['-e', 'log("secret"); M 0 0']);
      expect(result.stderr).not.toContain('secret');
    });
  });

  describe('--log-file', () => {
    const logFile = join(TMP_DIR, 'test-logs.json');

    beforeEach(() => {
      if (existsSync(logFile)) unlinkSync(logFile);
    });

    it('writes structured JSON log file', () => {
      runCli(['-e', 'let x = 42; log(x); M x 0', `--log-file=${logFile}`]);
      expect(existsSync(logFile)).toBe(true);
      const content = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBe(1);
      expect(content[0].parts[0].value).toBe('42');
      expect(content[0].parts[0].label).toBe('x');
      expect(content[0].parts[0].type).toBe('value');
    });

    it('writes empty array when no logs', () => {
      runCli(['-e', 'M 0 0', `--log-file=${logFile}`]);
      expect(existsSync(logFile)).toBe(true);
      const content = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(content).toEqual([]);
    });

    it('includes line numbers in JSON', () => {
      runCli(['-e', 'log("test"); M 0 0', `--log-file=${logFile}`]);
      const content = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(content[0].line).toBeTypeOf('number');
    });

    it('works combined with --print-logs', () => {
      const result = runCli(['-e', 'log("both"); M 0 0', '--print-logs', `--log-file=${logFile}`]);
      expect(result.stderr).toContain('both');
      expect(existsSync(logFile)).toBe(true);
      const content = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(content[0].parts[0].value).toBe('both');
    });
  });

  describe('--to-fixed option', () => {
    it('rounds decimals with --to-fixed=2', () => {
      const result = runCli(['-e', 'let x1 = calc(10 / 3); let x2 = calc(20 / 7); M x1 x2', '--to-fixed=2']);
      expect(result.stdout.trim()).toBe('M 3.33 2.86');
      expect(result.status).toBe(0);
    });

    it('rounds to 0 places with --to-fixed=0', () => {
      const result = runCli(['-e', 'let x1 = calc(10 / 3); let x2 = calc(20 / 7); M x1 x2', '--to-fixed=0']);
      expect(result.stdout.trim()).toBe('M 3 3');
      expect(result.status).toBe(0);
    });

    it('preserves integers', () => {
      const result = runCli(['-e', 'M 100 200', '--to-fixed=2']);
      expect(result.stdout.trim()).toBe('M 100 200');
      expect(result.status).toBe(0);
    });

    it('errors on invalid value', () => {
      const result = runCli(['-e', 'M 0 0', '--to-fixed=abc']);
      expect(result.stderr).toContain('--to-fixed must be an integer between 0 and 20');
      expect(result.status).toBe(1);
    });

    it('works with --output-svg-file', () => {
      const outputFile = join(TMP_DIR, 'to-fixed-output.svg');
      if (existsSync(outputFile)) unlinkSync(outputFile);

      const result = runCli(['-e', 'let x1 = calc(10 / 3); M x1 0', '--to-fixed=2', `--output-svg-file=${outputFile}`]);
      expect(result.status).toBe(0);
      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('d="M 3.33 0"');

      unlinkSync(outputFile);
    });
  });

  describe('text layer SVG output', () => {
    it('generates <text> elements in SVG output', () => {
      const inputFile = join(TMP_DIR, 'text-test.svgx');
      const outputFile = join(TMP_DIR, 'text-test.svg');
      writeFileSync(
        inputFile,
        "define TextLayer('labels') #{ font-size: 14; fill: #333; }\nlayer('labels').apply {\n  text(50, 45)`Hello`\n}",
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      const textEls = extractSVGElements(content, 'text');
      expect(textEls).toHaveLength(1);
      expect(textEls[0]).toMatchObject({
        id: 'labels',
        x: '50',
        y: '45',
        'font-size': '14',
        fill: '#333',
      });
      expect(content).toContain('>Hello</text>');

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });

    it('generates <text> with rotation', () => {
      const inputFile = join(TMP_DIR, 'text-rot.svgx');
      const outputFile = join(TMP_DIR, 'text-rot.svg');
      writeFileSync(inputFile, "define TextLayer('t') #{}\nlayer('t').apply {\n  text(10, 20, 45deg)`Rotated`\n}");
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      const [textEl] = extractSVGElements(content, 'text');
      expect(textEl).toMatchObject({ transform: 'rotate(45, 10, 20)' });

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });

    it('generates <tspan> elements', () => {
      const inputFile = join(TMP_DIR, 'text-tspan.svgx');
      const outputFile = join(TMP_DIR, 'text-tspan.svg');
      writeFileSync(
        inputFile,
        "define TextLayer('t') #{}\nlayer('t').apply {\n  text(10, 20) {\n    tspan()`first`\n    tspan(0, 16)`second`\n  }\n}",
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('<tspan>first</tspan>');
      expect(content).toContain('<tspan dx="0" dy="16">second</tspan>');

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });

    it('escapes XML special characters in text', () => {
      const inputFile = join(TMP_DIR, 'text-escape.svgx');
      const outputFile = join(TMP_DIR, 'text-escape.svg');
      writeFileSync(inputFile, "define TextLayer('t') #{}\nlayer('t').apply {\n  text(10, 20)`a < b & c > d`\n}");
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('a &lt; b &amp; c &gt; d');

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });
  });

  describe('@property style block in SVG output', () => {
    const outputSvg = join(TMP_DIR, 'css-property-test.svg');

    beforeEach(() => {
      if (existsSync(outputSvg)) unlinkSync(outputSvg);
    });

    it('includes <style> with @property for Color(CSSVar(...))', () => {
      const inputFile = join(TMP_DIR, 'css-prop-test.svgx');
      writeFileSync(
        inputFile,
        `
        let c = Color(CSSVar('--base-color', '#e63946'));
        define PathLayer('a') #{ fill: c; }
        layer('a').apply { M 0 0 L 100 100 }
      `,
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);

      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('<style>');
      expect(content).toContain('@property --base-color');
      expect(content).toContain('syntax: "<color>"');
      expect(content).toContain('inherits: true');
      expect(content).toContain('initial-value: #e63946');

      unlinkSync(inputFile);
    });

    it('includes multiple @property declarations', () => {
      const inputFile = join(TMP_DIR, 'css-prop-multi.svgx');
      writeFileSync(
        inputFile,
        `
        let c1 = Color(CSSVar('--base', '#e63946'));
        let c2 = Color(CSSVar('--accent', '#457b9d'));
        define PathLayer('a') #{ fill: c1; stroke: c2; }
        layer('a').apply { M 0 0 L 100 100 }
      `,
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);

      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('@property --base');
      expect(content).toContain('@property --accent');

      unlinkSync(inputFile);
    });

    it('omits <style> when no Color(CSSVar(...)) used', () => {
      const inputFile = join(TMP_DIR, 'css-prop-none.svgx');
      writeFileSync(
        inputFile,
        `
        let c = Color('#e63946');
        define PathLayer('a') #{ fill: c; }
        layer('a').apply { M 0 0 }
      `,
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);

      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).not.toContain('<style>');
      expect(content).not.toContain('@property');

      unlinkSync(inputFile);
    });
  });

  describe('SVG output escaping', () => {
    const outputSvg = join(TMP_DIR, 'escape-test.svg');

    beforeEach(() => {
      if (existsSync(outputSvg)) unlinkSync(outputSvg);
    });

    it('escapes double quotes in CLI stroke option', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--stroke=x"y']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('stroke="x&quot;y"');
      expect(content).not.toContain('stroke="x"y"');
    });

    it('escapes angle brackets in CLI fill option', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--fill=<script>']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('fill="&lt;script&gt;"');
      expect(content).not.toContain('fill="<script>"');
    });

    it('escapes ampersands in CLI viewBox option', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--viewBox=0 0 200&foo 200']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('viewBox="0 0 200&amp;foo 200"');
    });

    it('normal CSS color values pass through unchanged', () => {
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--stroke=oklch(0.7 0.15 180)', '--fill=#e63946']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('stroke="oklch(0.7 0.15 180)"');
      expect(content).toContain('fill="#e63946"');
    });
  });

  describe('--render-gpu and --scale options', () => {
    it('--render-gpu appears in help text', () => {
      const result = runCli(['-h']);
      expect(result.stdout).toContain('--render-gpu');
    });

    it('--scale appears in help text', () => {
      const result = runCli(['-h']);
      expect(result.stdout).toContain('--scale=');
    });

    it('rejects --scale=0', () => {
      const result = runCli(['-e', 'M 0 0', '--scale=0']);
      expect(result.stderr).toContain('--scale must be an integer between 1 and 4');
      expect(result.status).toBe(1);
    });

    it('rejects --scale=5', () => {
      const result = runCli(['-e', 'M 0 0', '--scale=5']);
      expect(result.stderr).toContain('--scale must be an integer between 1 and 4');
      expect(result.status).toBe(1);
    });

    it('rejects --scale=abc', () => {
      const result = runCli(['-e', 'M 0 0', '--scale=abc']);
      expect(result.stderr).toContain('--scale must be an integer between 1 and 4');
      expect(result.status).toBe(1);
    });

    it('places the conic pattern tile at the viewBox origin (ISSUE-027)', () => {
      const outputSvg = join(TMP_DIR, 'conic-origin.svg');
      if (existsSync(outputSvg)) unlinkSync(outputSvg);
      runCli([
        '-e',
        `
        define ViewBox(-100, -100, 200, 200);
        let g = ConicGradient('g', 0, 0) {|c|
          c.stop(0, Color('#e63946'));
          c.stop(1, Color('#264653'));
        };
        define default PathLayer('bg') #{ fill: g; stroke: none; };
        M -100 -100; h 200; v 200; h -200; z;
        `,
        `--output-svg-file=${outputSvg}`,
      ]);
      const svg = readFileSync(outputSvg, 'utf-8');
      expect(svg).toContain('viewBox="-100 -100 200 200"');
      expect(svg).toContain(
        '<pattern id="g" x="-100" y="-100" width="200" height="200" patternUnits="userSpaceOnUse">',
      );
      // Wedges are tile-local: the user-space centre (0, 0) is (100, 100) inside the tile.
      expect(svg).toContain('<path d="M 100 100 L ');
    });

    it('without --render-gpu, existing conic wedge-path output is unchanged', () => {
      const outputSvg = join(TMP_DIR, 'conic-no-gpu.svg');
      if (existsSync(outputSvg)) unlinkSync(outputSvg);

      const inputFile = join(TMP_DIR, 'conic-test.svgx');
      writeFileSync(
        inputFile,
        `
        let g = ConicGradient('cg', 100, 100);
        g.stop(0, Color('red'));
        g.stop(1, Color('blue'));
        define PathLayer('p') #{ fill: url(#cg); }
        layer('p').apply { rect(0, 0, 200, 200); }
      `,
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      expect(existsSync(outputSvg)).toBe(true);
      const content = readFileSync(outputSvg, 'utf-8');
      // Wedge-path output uses <pattern> with <path> children (not <image>)
      expect(content).toContain('<pattern');
      expect(content).toContain('patternUnits="userSpaceOnUse"');
      // Should NOT have data URL images (that's GPU mode)
      expect(content).not.toContain('data:image/png;base64');

      unlinkSync(inputFile);
      unlinkSync(outputSvg);
    });

    it('without --render-gpu, innerRadius and spread are honoured in the wedge output and nothing warns', () => {
      const outputSvg = join(TMP_DIR, 'conic-inner-no-gpu.svg');
      if (existsSync(outputSvg)) unlinkSync(outputSvg);

      const inputFile = join(TMP_DIR, 'conic-inner-test.svgx');
      writeFileSync(
        inputFile,
        `
        let g = ConicGradient('ring', 100, 100) {|g|
          g.stop(0, Color('red'));
          g.stop(1, Color('blue'));
        };
        g.from = 0rad;
        g.to = 0.5pi;
        g.spread = 'transparent';
        g.innerRadius = 30;
        define PathLayer('p') #{ fill: g; }
        layer('p').apply { rect(0, 0, 200, 200); }
      `,
      );
      const result = runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      expect(result.stderr).not.toContain('ignored');
      const content = readFileSync(outputSvg, 'utf-8');
      // 90 one-degree annular sectors: each wedge carries the 30-unit inner arc.
      expect((content.match(/ A 30 30 0 /g) ?? []).length).toBe(90);
      expect((content.match(/<path d="M /g) ?? []).length).toBe(90);

      unlinkSync(inputFile);
      unlinkSync(outputSvg);
    });

    it('linear-only source without --render-gpu produces native <linearGradient>', () => {
      const outputSvg = join(TMP_DIR, 'linear-test.svg');
      if (existsSync(outputSvg)) unlinkSync(outputSvg);

      const inputFile = join(TMP_DIR, 'linear-test.svgx');
      writeFileSync(
        inputFile,
        `
        let g = LinearGradient('lg', 0, 0, 200, 200);
        g.stop(0, Color('red'));
        g.stop(1, Color('blue'));
        define PathLayer('p') #{ fill: url(#lg); }
        layer('p').apply { rect(0, 0, 200, 200); }
      `,
      );
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);
      expect(existsSync(outputSvg)).toBe(true);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('<linearGradient');
      expect(content).toContain('stop-color="#ff0000"');
      expect(content).toContain('stop-color="#0000ff"');

      unlinkSync(inputFile);
      unlinkSync(outputSvg);
    });
  });

  describe('@font directive with identifier source', () => {
    it('loads a font file via a top-level let variable, exactly as the literal path does', () => {
      const viaVariable = join(TMP_DIR, 'font-var.pathogen');
      const viaLiteral = join(TMP_DIR, 'font-literal.pathogen');
      writeFileSync(
        viaVariable,
        glyphProgram('let fontPath = "../fixtures/fonts/Inter-Regular.ttf";\n@font fontPath;', 'Inter-Regular'),
      );
      writeFileSync(viaLiteral, glyphProgram('@font "../fixtures/fonts/Inter-Regular.ttf";', 'Inter-Regular'));
      try {
        expect(drawnGlyph(runCli([`--src=${viaVariable}`]))).toBe(drawnGlyph(runCli([viaLiteral])));
      } finally {
        unlinkSync(viaVariable);
        unlinkSync(viaLiteral);
      }
    });

    it('fails with a positioned error when the identifier is not a top-level string', () => {
      const result = runCli(['-e', '@font mystery;\nM 0 0']);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^<inline>:1:\d+: error: .*references 'mystery'/m);
      expect(result.stderr).toMatch(/not a top-level string variable/);
    });
  });

  describe('@font named-family resolution against a project fonts/ directory', () => {
    it('resolves a Google-style family name by walking up to the repo fonts/ dir', () => {
      // fonts/Baumans/Baumans-Regular.ttf, found by walking up from tests/tmp:
      // the same file a path names, so the same outline.
      const byFamily = join(TMP_DIR, 'font-named.pathogen');
      const byPath = join(TMP_DIR, 'font-named-path.pathogen');
      writeFileSync(byFamily, glyphProgram('@font "Baumans";', 'Baumans'));
      writeFileSync(byPath, glyphProgram('@font "../../fonts/Baumans/Baumans-Regular.ttf";', 'Baumans-Regular'));
      try {
        expect(drawnGlyph(runCli([`--src=${byFamily}`]))).toBe(drawnGlyph(runCli([byPath])));
      } finally {
        unlinkSync(byFamily);
        unlinkSync(byPath);
      }
    });

    it('maps weights to Google filename suffixes (700 → -Bold, 200 → -ExtraLight)', () => {
      // fonts/Playfair_Display/PlayfairDisplay-Bold.ttf and
      // fonts/Raleway/Raleway-ExtraLight.ttf — spaced family names, subdirs.
      const inputFile = join(TMP_DIR, 'font-weights.pathogen');
      writeFileSync(
        inputFile,
        `@font "Playfair Display" 700;
@font "Raleway" 200;
let po = PathBlock.fromGlyph("O", #{ font-family: "Playfair Display"; font-weight: 700; font-size: 48; });
let ro = PathBlock.fromGlyph("O", #{ font-family: "Raleway"; font-weight: 200; font-size: 48; });
M 10 100
po[0].draw()
M 80 100
ro[0].draw()
`,
      );
      const result = runCli([`--src=${inputFile}`]);
      expect(result.status).toBe(0);
      expect(result.stderr).not.toMatch(/warning:|error:/);
      expect(result.stdout).toMatch(/M 10 100/);
      expect(result.stdout).toMatch(/M 80 100/);

      unlinkSync(inputFile);
    });

    it('honors PATHOGEN_FONT_DIRS as an explicit search path', () => {
      // A family whose only file is in a folder named by PATHOGEN_FONT_DIRS:
      // the walked-up fonts/ folder and the system folders don't have it.
      const envFonts = join(TMP_DIR, 'env-fonts');
      mkdirSync(envFonts, { recursive: true });
      copyFileSync(
        join(__dirname, '..', 'fonts', 'Baumans', 'Baumans-Regular.ttf'),
        join(envFonts, 'Envonly-Regular.ttf'),
      );
      const inputFile = join(TMP_DIR, 'font-envdir.pathogen');
      writeFileSync(
        inputFile,
        `@font "Envonly";
let g = PathBlock.fromGlyph("A", #{ font-family: Envonly; font-size: 48; });
M 10 100
g[0].draw()
`,
      );
      const run = (env: NodeJS.ProcessEnv) =>
        spawnSync('npx', ['tsx', CLI_PATH, inputFile], { encoding: 'utf-8', cwd: join(__dirname, '..'), env });
      try {
        const without = run(process.env);
        expect(without.status).toBe(1);
        expect(without.stderr).toMatch(/warning: @font "Envonly": not on this computer/);

        const withDirs = run({ ...process.env, PATHOGEN_FONT_DIRS: envFonts });
        expect(withDirs.status).toBe(0);
        expect(withDirs.stderr).not.toMatch(/warning:|error:/);
        expect(withDirs.stdout).toMatch(/M 10 100/);
      } finally {
        unlinkSync(inputFile);
        rmSync(envFonts, { recursive: true, force: true });
      }
    });
  });

  describe('@font file paths and the project folder (docs/projects.md)', () => {
    // tests/tmp is inside the repo, whose pathogen.json makes the repo the
    // project folder for files that have none of their own.
    const fence = join(TMP_DIR, 'fence');
    const fenceMain = join(fence, 'main.pathogen');

    beforeAll(() => {
      mkdirSync(fence, { recursive: true });
      writeFileSync(join(fence, 'pathogen.json'), '{}\n');
      writeFileSync(fenceMain, '@font "../../fixtures/fonts/Inter-Regular.ttf";\nM 0 0\n');
    });

    afterAll(() => {
      rmSync(fence, { recursive: true, force: true });
    });

    it('a leading / means the project folder', () => {
      // From tests/tmp, /fonts/… and ../../fonts/… name the same file.
      const rooted = join(TMP_DIR, 'font-rooted.pathogen');
      const relative = join(TMP_DIR, 'font-relative.pathogen');
      writeFileSync(rooted, glyphProgram('@font "/fonts/Baumans/Baumans-Regular.ttf";', 'Baumans-Regular'));
      writeFileSync(relative, glyphProgram('@font "../../fonts/Baumans/Baumans-Regular.ttf";', 'Baumans-Regular'));
      try {
        expect(drawnGlyph(runCli([rooted]))).toBe(drawnGlyph(runCli([relative])));
      } finally {
        unlinkSync(rooted);
        unlinkSync(relative);
      }
    });

    describe('--root with code from -e or standard input, and with a file outside it', () => {
      const fixtures = join(__dirname, 'fixtures');
      const interProgram = glyphProgram('@font "./fonts/Inter-Regular.ttf";', 'Inter-Regular');

      it('code with no @font compiles whatever the project folder', () => {
        expect(runCli([`--root=${fixtures}`, '-e', 'M 0 0 L 10 10'])).toEqual({
          stdout: 'M 0 0 L 10 10\n',
          stderr: '',
          status: 0,
        });
        expect(runCli([`--root=${fixtures}`, '-'], 'M 0 0 L 10 10').stdout).toBe('M 0 0 L 10 10\n');
      });

      it("when the current folder isn't in the project folder, the code's paths start at the project folder", () => {
        const fromInline = drawnGlyph(runCli([`--root=${fixtures}`, '-e', interProgram]));
        const fromStdin = drawnGlyph(runCli([`--root=${fixtures}`, '-'], interProgram));
        expect(fromStdin).toBe(fromInline);
      });

      it('…and so does the search for a family in a fonts/ folder', () => {
        // The tests run from the repo, whose own fonts/ has no Inter: only
        // tests/fixtures/fonts/ does.
        const byFamily = glyphProgram('@font "Inter";', 'Inter');
        const fromInline = drawnGlyph(runCli([`--root=${fixtures}`, '-e', byFamily]));
        const fromStdin = drawnGlyph(runCli([`--root=${fixtures}`, '-'], byFamily));
        const byPath = drawnGlyph(runCli([`--root=${fixtures}`, '-e', interProgram]));
        expect([fromInline, fromStdin]).toEqual([byPath, byPath]);
      });

      it.skipIf(!caseInsensitiveFs)(
        'a --root spelled in another letter case than on disk is the same folder (macOS, Windows)',
        () => {
          const shouted = join(__dirname.replace(/tests$/, 'TESTS'), 'fixtures');
          const program = join(TMP_DIR, 'case-root.pathogen');
          writeFileSync(program, glyphProgram('@font "../fixtures/fonts/Inter-Regular.ttf";', 'Inter-Regular'));
          try {
            const expected = drawnGlyph(runCli([`--root=${fixtures}`, '-e', interProgram]));
            expect([
              drawnGlyph(runCli([`--root=${shouted}`, '-e', interProgram])),
              drawnGlyph(runCli([`--root=${__dirname.replace(/tests$/, 'TESTS')}`, program])),
            ]).toEqual([expected, expected]);
          } finally {
            unlinkSync(program);
          }
        },
      );

      it('a file outside the project folder compiles; only its @font paths have nowhere to start', () => {
        const plain = join(TMP_DIR, 'outside-root-plain.pathogen');
        const withFamily = join(TMP_DIR, 'outside-root-family.pathogen');
        const withPath = join(TMP_DIR, 'outside-root-path.pathogen');
        writeFileSync(plain, 'M 0 0 L 5 5\n');
        writeFileSync(withFamily, '@font "Zzyzx Nonesuch";\nM 0 0\n');
        writeFileSync(withPath, '@font "./x.ttf";\nM 0 0\n');
        try {
          expect(runCli([`--root=${fixtures}`, plain])).toEqual({ stdout: 'M 0 0 L 5 5\n', stderr: '', status: 0 });
          expect(runCli([`--root=${fixtures}`, withFamily])).toEqual({
            stdout: 'M 0 0\n',
            stderr: `${withFamily}:1:1: warning: @font "Zzyzx Nonesuch": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.\n`,
            status: 0,
          });
          expect(runCli([`--root=${fixtures}`, withPath])).toEqual({
            stdout: '',
            stderr: `Error: ${withPath} is outside the project folder ${fixtures} given by --root, so its @font paths can't be followed.\n`,
            status: 1,
          });
        } finally {
          unlinkSync(plain);
          unlinkSync(withFamily);
          unlinkSync(withPath);
        }
      });
    });

    it('a folder named as a font, the project folder included, says it is a folder', () => {
      const result = runCli(['-e', '@font "./tests";\n@font "/";\nM 0 0']);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        '<inline>:1:1: error: @font path "./tests" is a folder, not a font file.\n' +
          '<inline>:2:1: error: @font path "/" is a folder, not a font file.\n',
      );
    });

    it('a font file cut short is an error at its @font line', () => {
      const cut = join(TMP_DIR, 'Cut-Short.ttf');
      const inter = readFileSync(join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf'));
      writeFileSync(cut, inter.subarray(0, Math.floor(inter.length / 2)));
      try {
        const result = runCli(['-e', '@font "./tests/tmp/Cut-Short.ttf";\nM 0 0']);
        expect([result.status, result.stderr]).toEqual([
          1,
          '<inline>:1:1: error: @font file "./tests/tmp/Cut-Short.ttf" is damaged or incomplete: its tables run past the end of the file.\n',
        ]);
      } finally {
        unlinkSync(cut);
      }
    });

    it('a path that leaves the project folder is an error naming the folder', () => {
      const result = runCli([fenceMain]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        `${fenceMain}:1:1: error: @font path "../../fixtures/fonts/Inter-Regular.ttf" leaves the project folder (${fence}). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.\n`,
      );
    });

    it('--root sets the project folder', () => {
      const result = runCli([`--root=${__dirname}`, fenceMain]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('M 0 0');
    });

    it('--root must name a folder', () => {
      const missing = join(TMP_DIR, 'no-such-folder');
      const result = runCli([`--root=${missing}`, '-e', 'M 0 0']);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`Error: --root=${missing} is not a folder.\n`);
    });

    it('a missing font file is an error, not a warning', () => {
      const result = runCli(['-e', '@font "./no-such-font.ttf";\nM 0 0']);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        `<inline>:1:1: error: @font file "./no-such-font.ttf" was not found (looked for ${join(__dirname, '..', 'no-such-font.ttf')}).\n`,
      );
    });

    it('letter case must match the file on disk, even where the system ignores it', () => {
      const inputFile = join(TMP_DIR, 'font-case.pathogen');
      writeFileSync(inputFile, '@font "../fixtures/fonts/inter-regular.ttf";\nM 0 0\n');
      try {
        const result = runCli([inputFile]);
        expect(result.status).toBe(1);
        expect(result.stderr).toBe(
          `${inputFile}:1:1: error: @font file "../fixtures/fonts/inter-regular.ttf" differs from the file on disk only in letter case: "../fixtures/fonts/Inter-Regular.ttf". Paths are case-sensitive on every system.\n`,
        );
      } finally {
        unlinkSync(inputFile);
      }
    });

    it('a file name without ./ is an error that suggests the path', () => {
      const result = runCli(['-e', '@font "Inter.ttf";\nM 0 0']);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        `<inline>:1:1: error: @font "Inter.ttf" looks like a file name but isn't a path. File paths start with ./, ../ or / — did you mean "./Inter.ttf"?\n`,
      );
    });
  });

  describe('compiling a folder', () => {
    const folder = join(TMP_DIR, 'folder-arg');

    beforeAll(() => {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'drawing.pathogen'), 'M 1 2 L 3 4\n');
    });

    afterAll(() => {
      rmSync(folder, { recursive: true, force: true });
    });

    it('compiles the main named in its pathogen.json', () => {
      writeFileSync(join(folder, 'pathogen.json'), '{ "main": "drawing.pathogen" }\n');
      const result = runCli([folder]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('M 1 2 L 3 4');
    });

    it('a pathogen.json without "main" says what to add', () => {
      writeFileSync(join(folder, 'pathogen.json'), '{}\n');
      const result = runCli([folder]);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        `Error: ${join(folder, 'pathogen.json')} has no "main". Add "main": "your-program.pathogen", or compile a file directly.\n`,
      );
    });

    it('a main that does not exist is an error', () => {
      writeFileSync(join(folder, 'pathogen.json'), '{ "main": "missing.pathogen" }\n');
      const result = runCli([folder]);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        `Error: ${join(folder, 'pathogen.json')} names "main": "/missing.pathogen", which doesn't exist.\n`,
      );
    });

    it('a folder with no pathogen.json is an error', () => {
      const bare = join(TMP_DIR, 'folder-bare');
      mkdirSync(bare, { recursive: true });
      try {
        const result = runCli([bare]);
        expect(result.status).toBe(1);
        expect(result.stderr).toBe(
          `Error: ${bare} is a folder with no pathogen.json. Add one with "main", or compile a file directly.\n`,
        );
      } finally {
        rmSync(bare, { recursive: true, force: true });
      }
    });

    it('a trailing slash on the folder makes no difference', () => {
      writeFileSync(join(folder, 'pathogen.json'), '{ "main": "drawing.pathogen" }\n');
      expect(runCli([`${folder}/`])).toEqual({ stdout: 'M 1 2 L 3 4\n', stderr: '', status: 0 });
    });

    it('a pathogen.json saved with a byte-order mark works', () => {
      writeFileSync(join(folder, 'pathogen.json'), `${String.fromCodePoint(0xfeff)}{ "main": "drawing.pathogen" }\n`);
      expect(runCli([folder])).toEqual({ stdout: 'M 1 2 L 3 4\n', stderr: '', status: 0 });
    });

    it('a main in a subfolder: its ./ and ../ paths start there, and / at the project folder', () => {
      const project = join(TMP_DIR, 'folder-arg-nested');
      mkdirSync(join(project, 'src'), { recursive: true });
      mkdirSync(join(project, 'type'), { recursive: true });
      copyFileSync(
        join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf'),
        join(project, 'type', 'Inter-Regular.ttf'),
      );
      writeFileSync(join(project, 'pathogen.json'), '{ "main": "src/poster.pathogen" }\n');
      try {
        const poster = join(project, 'src', 'poster.pathogen');
        writeFileSync(poster, glyphProgram('@font "../type/Inter-Regular.ttf";', 'Inter-Regular'));
        const relative = drawnGlyph(runCli([project]));
        writeFileSync(poster, glyphProgram('@font "/type/Inter-Regular.ttf";', 'Inter-Regular'));
        expect(drawnGlyph(runCli([project]))).toBe(relative);
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('--root wins over the folder: a leading / then means the --root folder', () => {
      const project = join(TMP_DIR, 'folder-arg-root');
      mkdirSync(join(project, 'type'), { recursive: true });
      copyFileSync(
        join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf'),
        join(project, 'type', 'Inter-Regular.ttf'),
      );
      writeFileSync(join(project, 'pathogen.json'), '{ "main": "main.pathogen" }\n');
      writeFileSync(join(project, 'main.pathogen'), glyphProgram('@font "/type/Inter-Regular.ttf";', 'Inter-Regular'));
      try {
        drawnGlyph(runCli([project]));
        expect(runCli([`--root=${TMP_DIR}`, project])).toEqual({
          stdout: '',
          stderr: `${join(project, 'main.pathogen')}:1:1: error: @font file "/type/Inter-Regular.ttf" was not found (looked for ${join(TMP_DIR, 'type', 'Inter-Regular.ttf')}). A leading / means the project folder, not your computer's root.\n`,
          status: 1,
        });
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('a pathogen.json or a main that is a folder is an error, not a crash', () => {
      const odd = join(TMP_DIR, 'folder-arg-odd');
      mkdirSync(join(odd, 'pathogen.json'), { recursive: true });
      try {
        expect(runCli([odd])).toEqual({
          stdout: '',
          stderr: `Error: pathogen.json (${odd}) is a folder, not a file.\n`,
          status: 1,
        });
        rmSync(join(odd, 'pathogen.json'), { recursive: true });
        mkdirSync(join(odd, 'drawing'), { recursive: true });
        writeFileSync(join(odd, 'pathogen.json'), '{ "main": "drawing" }\n');
        expect(runCli([odd])).toEqual({
          stdout: '',
          stderr: `Error: ${join(odd, 'drawing')} is a folder, not a file.\n`,
          status: 1,
        });
      } finally {
        rmSync(odd, { recursive: true, force: true });
      }
    });
  });

  describe('a pathogen.json found by walking up from the program', () => {
    const project = join(TMP_DIR, 'walked-up');

    beforeAll(() => {
      mkdirSync(join(project, 'parts'), { recursive: true });
      writeFileSync(join(project, 'pathogen.json'), '{ "mian": "main.pathogen" }\n');
    });

    afterAll(() => {
      rmSync(project, { recursive: true, force: true });
    });

    it('a broken one stops a program that loads fonts, naming the problem', () => {
      const program = join(project, 'parts', 'rack.pathogen');
      writeFileSync(program, '@font "./x.ttf";\nM 0 0\n');
      expect(runCli([program])).toEqual({
        stdout: '',
        stderr: `Error: pathogen.json (${project}) has an unknown key "mian". Known keys: main.\n`,
        status: 1,
      });
    });

    it('a program without @font reads no files, so it compiles, as in the editors', () => {
      const program = join(project, 'parts', 'plain.pathogen');
      writeFileSync(program, 'M 0 0 L 1 1\n');
      expect(runCli([program])).toEqual({ stdout: 'M 0 0 L 1 1\n', stderr: '', status: 0 });
    });
  });

  describe('with downloads off (tests run with PATHOGEN_OFFLINE=1)', () => {
    const program = '@font "Zzyzx Nonesuch";\nM 0 0';
    const warning = (reason: string) =>
      `@font "Zzyzx Nonesuch": not on this computer, and downloads are off (${reason}). Calls that need this font will fail.`;

    it('a family that is not installed is a font-load warning, and the compile continues', () => {
      const result = runCli(['-e', program]);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('M 0 0');
      expect(result.stderr).toBe(`<inline>:1:1: warning: ${warning('PATHOGEN_OFFLINE=1')}\n`);
    });

    it('--offline names itself as the reason', () => {
      const result = runCli(['--offline', '-e', program]);
      expect(result.stderr).toBe(`<inline>:1:1: warning: ${warning('--offline')}\n`);
    });

    it('--strict=font-load makes it an error', () => {
      const result = runCli(['--strict=font-load', '-e', program]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(`<inline>:1:1: error: ${warning('PATHOGEN_OFFLINE=1')} (strict: font-load)\n`);
    });

    it('--json lists it with the other warnings', () => {
      const result = runCli(['--json', '-e', program]);
      expect(result.status).toBe(0);
      const doc = JSON.parse(result.stdout) as { warnings: unknown[] };
      expect(doc.warnings).toEqual([{ code: 'font-load', message: warning('PATHOGEN_OFFLINE=1'), line: 1, column: 1 }]);
    });

    it('a call that needs the font fails, and the warning is printed above its error', () => {
      const result = runCli([
        '-e',
        `${program}\nlet g = PathBlock.fromGlyph("A", #{ font-family: "Zzyzx Nonesuch"; font-size: 48; });`,
      ]);
      expect(result.status).toBe(1);
      const lines = result.stderr.trim().split('\n');
      expect(lines[0]).toBe(`<inline>:1:1: warning: ${warning('PATHOGEN_OFFLINE=1')}`);
      expect(lines[1]).toMatch(/^Error: .*no fonts were loaded.*look for a preceding font-loading message\.$/);
    });
  });
});

describe('imports (docs/modules.md)', () => {
  const project = join(TMP_DIR, 'modules-project');
  const main = join(project, 'main.pathogen');
  const GEARS =
    "// parts/gears.pathogen\nexport fn gear(center, radius, teeth) {\n  assert(teeth >= 3, 'a gear needs at least 3 teeth');\n  star(center.x, center.y, radius, radius - 6, teeth);\n}\nlog(\"gears loaded\");\n";

  beforeAll(() => {
    mkdirSync(join(project, 'parts'), { recursive: true });
    writeFileSync(join(project, 'pathogen.json'), '{}\n');
    writeFileSync(join(project, 'parts', 'gears.pathogen'), GEARS);
    writeFileSync(join(project, 'parts', 'warn.pathogen'), '// parts/warn.pathogen\nexport fn bad() {\n  L calc(0 / 0) 0\n}\n');
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('compiles a program that imports a file, drawing what one file would', () => {
    writeFileSync(main, '// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\n\ngear(Point(55, 50), 40, 12);\n');
    const result = runCli([main]);
    const oneFile = runCli([
      '-e',
      'fn gear(center, radius, teeth) { star(center.x, center.y, radius, radius - 6, teeth); }\ngear(Point(55, 50), 40, 12);',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(oneFile.stdout);
  });

  it('an error in an imported fn names its file and the call (docs/modules.md "Errors in other files")', () => {
    writeFileSync(main, '// main.pathogen\nimport { gear } from "./parts/gears.pathogen";\n\ngear(Point(55, 50), 40, 2);\n');
    const result = runCli([main]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      'Error: parts/gears.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth\n  called from main.pathogen line 4\n',
    );
  });

  it("an import of a missing file is an error at the import, like an @font path", () => {
    writeFileSync(main, '// main.pathogen\nimport { gear } from "./parts/gera.pathogen";\n');
    const result = runCli([main]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      `${main}:2:22: error: import file "./parts/gera.pathogen" was not found (looked for ${join(project, 'parts', 'gera.pathogen')}).\n`,
    );
  });

  it('a missing file imported by an imported file names the chain', () => {
    writeFileSync(join(project, 'parts', 'a.pathogen'), 'import { x } from "./missing.pathogen";\n');
    writeFileSync(main, 'import { y } from "./parts/a.pathogen";\n');
    const result = runCli([main]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      `Error: parts/a.pathogen line 1, col 19: import file "./missing.pathogen" was not found (looked for ${join(project, 'parts', 'missing.pathogen')}).\n  imported from main.pathogen line 1\n`,
    );
  });

  it('--print-logs labels a log from an imported file', () => {
    writeFileSync(main, 'import { gear } from "./parts/gears.pathogen";\nlog("main");\n');
    const result = runCli([main, '--print-logs']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('[parts/gears.pathogen line 6] gears loaded\n[line 2] main\n');
  });

  it('a warning from an imported file names it, on stderr and in --json', () => {
    writeFileSync(main, 'import { bad } from "./parts/warn.pathogen";\nM 0 0\nbad();\n');
    const result = runCli([main]);
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/^parts\/warn\.pathogen:3:\d+: warning: /);
    const json = JSON.parse(runCli([main, '--json']).stdout) as { warnings: { file?: string; line?: number }[] };
    expect(json.warnings.map((w) => [w.file, w.line])).toEqual([['parts/warn.pathogen', 3]]);
  });

  it('code from -e imports from the --root folder when the current folder is outside it', () => {
    const result = runCli([
      `--root=${project}`,
      '-e',
      'import { gear } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, 12);',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^M 55 10 /);
  });

  it('a file outside the --root folder cannot follow its import paths', () => {
    const outsideRoot = join(TMP_DIR, 'modules-other-root');
    mkdirSync(outsideRoot, { recursive: true });
    try {
      writeFileSync(main, 'import { gear } from "./parts/gears.pathogen";\n');
      const result = runCli([`--root=${outsideRoot}`, main]);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        `Error: ${main} is outside the project folder ${outsideRoot} given by --root, so its import paths can't be followed.\n`,
      );
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

describe('unknown options', () => {
  it('rejects an unrecognized flag instead of silently ignoring it', () => {
    const result = runCli(['-e', 'M 0 0', '--annotated']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown option '--annotated'");
    expect(result.stdout).toBe('');
  });
});

describe('warnings on stderr', () => {
  const PROGRAM = 'let plate = @{ h 40 v 40 h -40 z };\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();';

  it('prints file:line:col: warning: message and exits 0', () => {
    const result = runCli(['-e', PROGRAM]);
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/^<inline>:2:12: warning: Fillet radius clamped at vertex \d+/m);
    expect(result.stdout.trim().startsWith('M 10 10')).toBe(true);
  });

  it('does not print the [warn] log mirror twice under --print-logs', () => {
    const result = runCli(['-e', PROGRAM, '--print-logs']);
    expect(result.stderr).not.toContain('[warn]');
    expect(result.stderr).toContain('warning: Fillet radius clamped');
  });

  it('keeps the mirror in --log-file output', () => {
    const logFile = join(TMP_DIR, 'warn-logs.json');
    if (existsSync(logFile)) unlinkSync(logFile);
    runCli(['-e', PROGRAM, `--log-file=${logFile}`]);
    const content = JSON.parse(readFileSync(logFile, 'utf-8'));
    expect(content[0].severity).toBe('warn');
    expect(content[0].parts[0].value).toMatch(/^\[warn\] Fillet radius clamped/);
    unlinkSync(logFile);
  });
});

describe('--json', () => {
  const PROGRAM =
    "define PathLayer('lid') #{ stroke: red; }\nlayer('lid').apply {\n  M 10 10\n  h 40 as segment('top')\n}\nlog(\"done\");";

  it('prints one JSON document with layers, records, commands, logs, and warnings', () => {
    const result = runCli(['-e', PROGRAM, '--json']);
    expect(result.status).toBe(0);
    const doc = JSON.parse(result.stdout);
    const lid = doc.layers.find((l: { name: string }) => l.name === 'lid');
    expect(lid.d).toBe('M 10 10 h 40');
    expect(lid.records[1]).toMatchObject({ label: 'top', raw: 'h 40', commandCount: 1, loc: { line: 4, column: 3 } });
    expect(lid.commands).toHaveLength(2);
    expect(doc.logs[0].parts[0].value).toBe('done');
    expect(doc.warnings).toEqual([]);
    expect(Object.keys(doc.defs)).toEqual(['masks', 'clipPaths', 'gradients', 'patterns', 'markers', 'filters']);
  });

  it('writes to -o and refuses --output-svg-file', () => {
    const outFile = join(TMP_DIR, 'result.json');
    if (existsSync(outFile)) unlinkSync(outFile);
    const ok = runCli(['-e', 'M 0 0', '--json', '-o', outFile]);
    expect(ok.status).toBe(0);
    expect(JSON.parse(readFileSync(outFile, 'utf-8')).layers[0].d).toBe('M 0 0');
    unlinkSync(outFile);
    const bad = runCli(['-e', 'M 0 0', '--json', `--output-svg-file=${join(TMP_DIR, 'x.svg')}`]);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('--json cannot be combined');
    const png = runCli(['-e', 'M 0 0', '--json', `--png=${join(TMP_DIR, 'x.png')}`]);
    expect(png.status).toBe(1);
    expect(png.stderr).toContain('--json cannot be combined');
  });
});

describe('--png', () => {
  it('rasterizes the compiled SVG to a PNG at viewBox size × scale', () => {
    const png = join(TMP_DIR, 'out.png');
    if (existsSync(png)) unlinkSync(png);
    const result = runCli(['-e', 'define ViewBox(0, 0, 40, 30);\ncircle(20, 15, 10);', `--png=${png}`, '--scale=1']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PNG written to');
    const bytes = readFileSync(png);
    // PNG signature, then IHDR width/height big-endian at bytes 16..23
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(bytes.readUInt32BE(16)).toBe(40);
    expect(bytes.readUInt32BE(20)).toBe(30);
    unlinkSync(png);
  });
});

describe('warning grouping on stderr', () => {
  // 50 fillet(30) calls on a 4-vertex plate: 4 warnings each, two families.
  const LOOP =
    'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};\nfor (i in 1..50) {\n  let soft = plate.fillet(30);\n}\nM 10 10\nplate.draw();';

  it('prints one line per family followed by a count of the rest', () => {
    const result = runCli(['-e', LOOP]);
    expect(result.status).toBe(0);
    const warningLines = result.stderr.split('\n').filter((l) => l.includes(': warning: '));
    expect(warningLines).toHaveLength(2);
    expect(warningLines[0]).toMatch(/^<inline>:8:\d+: warning: Fillet radius clamped at vertex \d+/);
    expect(warningLines[1]).toMatch(/^<inline>:8:\d+: warning: Fillet skipped at vertex \d+/);
    expect(result.stderr.match(/  … 99 more like this/g)).toHaveLength(2);
  });

  it('--json keeps every instance', () => {
    const result = runCli(['-e', LOOP, '--json']);
    expect(result.status).toBe(0);
    const doc = JSON.parse(result.stdout) as { warnings: unknown[] };
    expect(doc.warnings).toHaveLength(200);
  });

  it('prints position-less warnings one per entity, never folded', () => {
    const result = runCli([
      '-e',
      "let g1 = TopoGradient('surface1', 100, 100);\nlet g2 = TopoGradient('surface2', 100, 100);\nM 10 10 h 10",
    ]);
    expect(result.status).toBe(0);
    const warningLines = result.stderr.split('\n').filter((l) => l.includes('has no contours'));
    expect(warningLines).toEqual([
      expect.stringMatching(/^<inline>: warning: TopoGradient 'surface1' has no contours/),
      expect.stringMatching(/^<inline>: warning: TopoGradient 'surface2' has no contours/),
    ]);
    expect(result.stderr).not.toContain('more like this');
  });
});

// --strict (ISSUE-023): warnings become errors — all of them, or the named codes.
describe('CLI --strict', () => {
  const NAN_PROGRAM = 'let bad = sqrt(-1);\nM bad 0';
  const FILLET_PROGRAM =
    'let plate = @{\n  h 40\n  v 40\n  h -40\n  z\n};\nlet soft = plate.fillet(30);\nM 10 10\nsoft.draw();';

  it('without the flag a NaN is a warning: exit 0, path still printed', () => {
    const result = runCli(['-e', NAN_PROGRAM]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('M NaN 0');
    expect(result.stderr).toMatch(/^<inline>:2:3: warning: `bad` is NaN in a path argument — /m);
  });

  it('--strict makes it a positioned error naming the code: exit 1, no path output', () => {
    const result = runCli(['-e', NAN_PROGRAM, '--strict']);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/Error: Line 2, col 3: `bad` is NaN in a path argument — .*\(strict: non-finite\)/);
  });

  it('--strict covers every code', () => {
    const result = runCli(['-e', FILLET_PROGRAM, '--strict']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\(strict: corner-op\)/);
  });

  it('--strict=non-finite stops a NaN but keeps a warning the program has accepted', () => {
    expect(runCli(['-e', NAN_PROGRAM, '--strict=non-finite']).status).toBe(1);
    const accepted = runCli(['-e', FILLET_PROGRAM, '--strict=non-finite']);
    expect(accepted.status).toBe(0);
    expect(accepted.stderr).toMatch(/warning: Fillet radius clamped/);
  });

  it('accepts a comma-separated list', () => {
    expect(runCli(['-e', FILLET_PROGRAM, '--strict=non-finite,corner-op']).status).toBe(1);
  });

  it('an unknown code is an error that lists the valid ones', () => {
    const result = runCli(['-e', NAN_PROGRAM, '--strict=bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown warning code 'bogus'");
    // derived from the runtime list, so a code added later is advertised too
    for (const code of WARNING_CODES) expect(result.stderr).toContain(code);
  });

  it('--strict= with nothing after it is an error, not "strict off"', () => {
    const result = runCli(['-e', NAN_PROGRAM, '--strict=']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--strict= needs at least one code');
  });

  it('a clean program is unaffected', () => {
    const result = runCli(['-e', 'M 0 0 L 10 20', '--strict']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('M 0 0 L 10 20');
  });
});
