/**
 * Phase 3a, step 2: data imports in the CLI (docs/data-import.md "In each
 * tool" and "Errors"; docs/cli.md "Data files").
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('npx', ['tsx', CLI_PATH, ...args], { encoding: 'utf-8', cwd });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status ?? 1 };
}

const GEARS =
  '[\n  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },\n  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }\n]\n';
const DRAW =
  'define ViewBox(0, 0, 200, 100);\n\nfor (gear in gears) {\n  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);\n  circle(gear.x, gear.y, gear.radius * 0.3);\n}\n';

let project: string;

beforeAll(() => {
  mkdirSync(join(__dirname, 'tmp'), { recursive: true });
  project = mkdtempSync(join(__dirname, 'tmp', 'data-cli-'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  mkdirSync(join(project, 'data'));
  writeFileSync(join(project, 'data', 'gears.json'), GEARS);
  writeFileSync(join(project, 'main.pathogen'), `// main.pathogen\nimport gears from "./data/gears.json";\n\n${DRAW}`);
  writeFileSync(
    join(project, 'inline.pathogen'),
    `let gears = [\n  { name: "drive", x: 55, y: 50, radius: 40, teeth: 12 },\n  { name: "idler", x: 150, y: 50, radius: 28, teeth: 8 },\n];\n${DRAW}`,
  );
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

describe('the example at the top of docs/data-import.md', () => {
  it('compiles, drawing the same as the data written in the program', () => {
    const imported = runCli(['main.pathogen'], project);
    const inline = runCli(['inline.pathogen'], project);
    expect([imported.status, imported.stderr]).toEqual([0, '']);
    expect(imported.stdout).toBe(inline.stdout);
    expect(imported.stdout.match(/M/g)).toHaveLength(4);
  });
});

describe('a mistake in a data file (docs/data-import.md "Errors")', () => {
  it("prints the docs' block: the file, the line and the import that read it", () => {
    writeFileSync(join(project, 'data', 'broken.json'), '[\n  { "name": "drive" }\n  { "name": "idler" }\n]\n');
    writeFileSync(
      join(project, 'broken.pathogen'),
      '// broken.pathogen\nimport gears from "./data/broken.json";\nM 0 0\n',
    );
    const result = runCli(['broken.pathogen'], project);
    expect([result.status, result.stdout, result.stderr]).toEqual([
      1,
      '',
      'Error: data/broken.json line 3, col 3: expected , or ] after an array item\n  imported from broken.pathogen line 2\n',
    ]);
  });

  it('braces on a data file name the form to use, at the path', () => {
    writeFileSync(join(project, 'braces.pathogen'), 'import { gears } from "./data/gears.json";\nM 0 0\n');
    const result = runCli(['braces.pathogen'], project);
    expect([result.status, result.stderr]).toEqual([
      1,
      'braces.pathogen:1:23: error: "./data/gears.json" is a data file: import it by a name, as import gears from "./data/gears.json";\n',
    ]);
  });
});

describe('--max-data-size (docs/cli.md "Data files")', () => {
  beforeAll(() => {
    // 1.5 MB: over a 1 MB limit, under a 2 MB one.
    writeFileSync(join(project, 'data', 'big.json'), `[${'1,'.repeat(786_432)}1]`);
    writeFileSync(join(project, 'big.pathogen'), 'import big from "./data/big.json";\nlog(big.length);\n');
  });

  it('a file over the limit stops at its import, with its size and how to raise the limit', () => {
    const result = runCli(['--max-data-size=1', 'big.pathogen'], project);
    expect([result.status, result.stderr]).toEqual([
      1,
      'big.pathogen:1:17: error: import file "./data/big.json" is 1.6 MB, more than the 1 MB a data file can be. To read it anyway, pass --max-data-size=50 (in VS Code, the pathogen.maxDataSize setting).\n',
    ]);
  });

  it('raising the limit reads it', () => {
    const result = runCli(['--max-data-size=2', '--print-logs', 'big.pathogen'], project);
    expect([result.status, result.stderr.trim()]).toEqual([0, '[line 2] big.length = 786433']);
  });

  it.each(['--max-data-size=0', '--max-data-size=abc', '--max-data-size=1.5', '--max-data-size=', '--max-data-size'])(
    '%s is refused',
    (flag) => {
      const result = runCli([flag, 'big.pathogen'], project);
      expect([result.status, result.stderr]).toEqual([
        1,
        'Error: --max-data-size needs a whole number of megabytes from 1 up, after =, such as --max-data-size=200.\n',
      ]);
    },
  );
});
