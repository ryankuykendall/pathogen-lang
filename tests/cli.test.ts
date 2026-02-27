import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const TMP_DIR = join(__dirname, 'tmp');

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

describe('CLI', () => {
  beforeAll(() => {
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup tmp files
    const files = ['test-input.svgx', 'test-output.txt', 'test-output.svg'];
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
      expect(result.stdout).toContain('svg-path-extended');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Options:');
    });

    it('shows help with --help', () => {
      const result = runCli(['--help']);
      expect(result.stdout).toContain('svg-path-extended');
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
      const result = runCli(['-e', 'circle(100, 100, 50)']);
      expect(result.stdout).toContain('M');
      expect(result.stdout).toContain('A');
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
      writeFileSync(inputFile, 'let r = 25; circle(50, 50, r)');
      const result = runCli([`--src=${inputFile}`]);
      expect(result.stdout).toContain('M');
      expect(result.stdout).toContain('A');
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
      writeFileSync(inputFile, 'circle(100, 100, 50)');
      runCli([`--src=${inputFile}`, '-o', outputTxt]);
      expect(existsSync(outputTxt)).toBe(true);
      const content = readFileSync(outputTxt, 'utf-8');
      expect(content).toContain('M');
      expect(content).toContain('A');
    });

    it('writes path to file with --output', () => {
      writeFileSync(inputFile, 'M 10 20');
      runCli([`--src=${inputFile}`, '--output', outputTxt]);
      expect(existsSync(outputTxt)).toBe(true);
    });

    it('writes SVG file with --output-svg-file', () => {
      writeFileSync(inputFile, 'circle(100, 100, 50)');
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
      expect(content).toContain('viewBox="0 0 200 200"');
      expect(content).toContain('width="200"');
      expect(content).toContain('height="200"');
      expect(content).toContain('stroke="#000"');
      expect(content).toContain('fill="none"');
      expect(content).toContain('stroke-width="2"');
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
      runCli(['-e', 'M 0 0', `--output-svg-file=${outputSvg}`, '--stroke=green', '--fill=yellow', '--stroke-width=3', '--viewBox=0 0 500 500']);
      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('stroke="green"');
      expect(content).toContain('fill="yellow"');
      expect(content).toContain('stroke-width="3"');
      expect(content).toContain('viewBox="0 0 500 500"');
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
      const result = runCli(['-e', 'fn sq(x, y, s) { rect(x, y, s, s) } sq(10, 10, 20)']);
      expect(result.stdout).toContain('M');
      expect(result.stdout).toContain('L');
      expect(result.stdout).toContain('Z');
    });

    it('compiles nested loops', () => {
      const result = runCli(['-e', 'for (i in 0..2) { for (j in 0..2) { M calc(i * 10) calc(j * 10) } }']);
      expect(result.stdout).toContain('M 0 0');
      expect(result.stdout).toContain('M 0 10');
      expect(result.stdout).toContain('M 10 0');
      expect(result.stdout).toContain('M 10 10');
    });
  });

  describe('annotated output', () => {
    it('outputs annotated format with --annotated flag', () => {
      const result = runCli(['-e', 'for (i in 0..3) { M i 0 }', '--annotated']);
      expect(result.stdout).toContain('//--- for (i in 0..3)');
      expect(result.stdout).toContain('//--- iteration 0');
      expect(result.stdout).toContain('//--- iteration 1');
    });

    it('preserves comments in annotated output', () => {
      const result = runCli(['-e', '// Test comment\nM 0 0', '--annotated']);
      expect(result.stdout).toContain('// Test comment');
      expect(result.stdout).toContain('M 0 0');
    });

    it('shows function call annotations', () => {
      const result = runCli(['-e', 'circle(50, 50, 25)', '--annotated']);
      expect(result.stdout).toContain('//--- circle(50, 50, 25)');
    });

    it('truncates long loops in annotated output', () => {
      const result = runCli(['-e', 'for (i in 0..20) { M i 0 }', '--annotated']);
      expect(result.stdout).toContain('//--- iteration 0');
      expect(result.stdout).toContain('more iterations');
      expect(result.stdout).toContain('//--- iteration 19');
    });

    it('writes annotated output to file with -o', () => {
      const outputFile = join(TMP_DIR, 'annotated-output.txt');
      if (existsSync(outputFile)) unlinkSync(outputFile);

      runCli(['-e', 'for (i in 0..3) { M i 0 }', '--annotated', '-o', outputFile]);
      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('//--- for (i in 0..3)');

      unlinkSync(outputFile);
    });
  });

  describe('--to-fixed option', () => {
    it('rounds decimals with --to-fixed=2', () => {
      const result = runCli(['-e', 'M calc(10/3) calc(20/7)', '--to-fixed=2']);
      expect(result.stdout.trim()).toBe('M 3.33 2.86');
      expect(result.status).toBe(0);
    });

    it('rounds to 0 places with --to-fixed=0', () => {
      const result = runCli(['-e', 'M calc(10/3) calc(20/7)', '--to-fixed=0']);
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

      const result = runCli(['-e', 'M calc(10/3) 0', '--to-fixed=2', `--output-svg-file=${outputFile}`]);
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
      writeFileSync(inputFile, "define TextLayer('labels') ${ font-size: 14; fill: #333; }\nlayer('labels').apply {\n  text(50, 45)`Hello`\n}");
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('<text x="50" y="45"');
      expect(content).toContain('font-size="14"');
      expect(content).toContain('fill="#333"');
      expect(content).toContain('>Hello</text>');

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });

    it('generates <text> with rotation', () => {
      const inputFile = join(TMP_DIR, 'text-rot.svgx');
      const outputFile = join(TMP_DIR, 'text-rot.svg');
      writeFileSync(inputFile, "define TextLayer('t') ${}\nlayer('t').apply {\n  text(10, 20, 45deg)`Rotated`\n}");
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputFile}`]);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('transform="rotate(45, 10, 20)"');

      unlinkSync(inputFile);
      unlinkSync(outputFile);
    });

    it('generates <tspan> elements', () => {
      const inputFile = join(TMP_DIR, 'text-tspan.svgx');
      const outputFile = join(TMP_DIR, 'text-tspan.svg');
      writeFileSync(inputFile, "define TextLayer('t') ${}\nlayer('t').apply {\n  text(10, 20) {\n    tspan()`first`\n    tspan(0, 16)`second`\n  }\n}");
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
      writeFileSync(inputFile, "define TextLayer('t') ${}\nlayer('t').apply {\n  text(10, 20)`a < b & c > d`\n}");
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
      writeFileSync(inputFile, `
        let c = Color(CSSVar('--base-color', '#e63946'));
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 L 100 100 }
      `);
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
      writeFileSync(inputFile, `
        let c1 = Color(CSSVar('--base', '#e63946'));
        let c2 = Color(CSSVar('--accent', '#457b9d'));
        define PathLayer('a') \${ fill: c1; stroke: c2; }
        layer('a').apply { M 0 0 L 100 100 }
      `);
      runCli([`--src=${inputFile}`, `--output-svg-file=${outputSvg}`]);

      const content = readFileSync(outputSvg, 'utf-8');
      expect(content).toContain('@property --base');
      expect(content).toContain('@property --accent');

      unlinkSync(inputFile);
    });

    it('omits <style> when no Color(CSSVar(...)) used', () => {
      const inputFile = join(TMP_DIR, 'css-prop-none.svgx');
      writeFileSync(inputFile, `
        let c = Color('#e63946');
        define PathLayer('a') \${ fill: c; }
        layer('a').apply { M 0 0 }
      `);
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
});
