// @vitest-environment jsdom
//
// 2f: VS Code's program list follows the playground's rules, but the
// extension's build can't import the playground's files, so it keeps its own
// copies (packages/vscode-pathogen/src/preview-programs.ts, program-drawing.ts,
// program-chip-item.ts). Each copy is pinned here to its original: change one
// and this fails until the other matches.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import * as playgroundPlace from '../playground/services/error-place.js';
import * as playgroundDrawings from '../playground/services/program-drawings.js';
import * as playgroundList from '../playground/services/program-list.js';
import { tabLabels as playgroundTabLabels } from '../playground/services/open-files.js';
import * as drawing from '../packages/vscode-pathogen/src/program-drawing';
import * as programs from '../packages/vscode-pathogen/src/preview-programs';

import type { ProgramItem } from '../playground/services/program-list.js';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

const row = (path: string, extra: Partial<ProgramItem> = {}): ProgramItem => ({
  path,
  name: path,
  hint: null,
  badge: false,
  error: null,
  uses: null,
  updating: false,
  miniature: null,
  ...extra,
});

describe("the rows' words", () => {
  it('MODULE_MAIN and TOO_DETAILED', () => {
    expect(programs.MODULE_MAIN).toBe(playgroundList.MODULE_MAIN);
    expect(programs.TOO_DETAILED).toBe(playgroundList.TOO_DETAILED);
  });

  it('errorPlace and errorRowText, over the messages a compile gives', () => {
    const messages = [
      'Line 13, col 3: Function gear expects 3 arguments, got 2',
      'Line 4: Something',
      'Parse error at line 2, column 9: Expected ;',
      'parts/gears.pathogen line 7, col 10: Unknown function circel',
      '/parts/gears.pathogen line 7: no column',
      'parts/gears.pathogen line 7, col 10: Unknown function circel\n  called from main.pathogen line 12',
      'main.pathogen: a file-level error',
      '\nLine 3, col 1: after a blank line',
      'pathogen.json (/x/y): has an unknown key "entrypoints".',
      'Something with no place at all',
      'Line 5, col 2: first\nLine 9, col 1: second',
    ];
    for (const message of messages) {
      const ours = drawing.errorPlace(message, 'try-sizes.pathogen');
      expect(ours, message).toEqual(playgroundPlace.errorPlace(message, 'try-sizes.pathogen'));
      expect(drawing.errorRowText(ours)).toBe(playgroundPlace.errorRowText(ours));
    }
    expect(drawing.errorRowText({ file: 'parts/gears.pathogen', line: null })).toBe('Error in parts/gears.pathogen');
  });
});

describe('the rows', () => {
  it('usesOf', () => {
    const files = ['parts/gears.pathogen'];
    const cases: [string, readonly string[] | null, string | null, string | null][] = [
      ['main.pathogen', files, 'parts/gears.pathogen', 'main.pathogen'],
      ['main.pathogen', files, 'main.pathogen', 'main.pathogen'],
      ['train.pathogen', files, 'train.pathogen', 'main.pathogen'],
      ['train.pathogen', null, 'parts/gears.pathogen', 'main.pathogen'],
      ['train.pathogen', [], 'parts/gears.pathogen', 'main.pathogen'],
      ['train.pathogen', files, null, 'main.pathogen'],
    ];
    for (const c of cases) expect(programs.usesOf(...c), JSON.stringify(c)).toBe(playgroundList.usesOf(...c));
  });

  it('chipAlert', () => {
    const lists: [ProgramItem[], string][] = [
      [[row('a'), row('b')], 'a'],
      [[row('a'), row('b', { error: 'Error in b line 2' })], 'a'],
      [[row('a', { error: 'Error in a line 2' }), row('b')], 'a'],
      [[row('a', { error: playgroundList.MODULE_MAIN }), row('b')], 'a'],
      [[row('a', { error: playgroundList.MODULE_MAIN }), row('b')], 'b'],
    ];
    for (const [items, shown] of lists)
      expect(programs.chipAlert(items, shown)).toBe(playgroundList.chipAlert(items, shown));
  });

  it('tabLabels', () => {
    const sets = [
      ['main.pathogen', 'demos/train.pathogen'],
      ['main.pathogen', 'demos/main.pathogen'],
      ['a/x/gears.pathogen', 'b/x/gears.pathogen', 'gears.pathogen'],
      ['parts/gears.pathogen', 'demos/gears.pathogen', 'try.pathogen'],
    ];
    for (const paths of sets) expect(programs.tabLabels(paths)).toEqual(playgroundTabLabels(paths));
  });

  it("ProgramChipItem has the shared chip's fields", () => {
    const fieldsOf = (file: string): string[] => {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      const body = text.slice(text.indexOf('export interface ProgramChipItem {'));
      const block = body.slice(0, body.indexOf('\n}'));
      return [...block.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
    };
    const shared = fieldsOf('src/ui/program-chip.ts');
    expect(shared.length).toBeGreaterThanOrEqual(10);
    expect(fieldsOf('packages/vscode-pathogen/src/program-chip-item.ts')).toEqual(shared);
  });
});

describe('the drawings', () => {
  it('MINIATURE_MAX_CHARS, drawingOf and withBackground', () => {
    expect(drawing.MINIATURE_MAX_CHARS).toBe(playgroundDrawings.MINIATURE_MAX_CHARS);
    const lib = (window as unknown as { PathogenLang: typeof import('../src') }).PathogenLang;
    const sources = [
      'define ViewBox(0, 0, 120, 80);\ncircle(60, 40, 30);\n',
      "define PathLayer('a') #{ stroke: red; }\nlayer('a').apply { M 0 0 L 10 10 }\n",
      'for (i in 0..20000) {\n  M calc(i / 100) 0 L calc(i / 100) 10\n}\n',
    ];
    for (const source of sources) {
      const result = lib.compile(source);
      const ours = drawing.drawingOf(result as never);
      expect(ours).toEqual(playgroundDrawings.drawingOf(result as never));
      if (ours === null) continue;
      const box = ours.viewBox ?? { originX: 0, originY: 0, width: 200, height: 200 };
      const svg = lib.generateSvg(ours as never);
      expect(drawing.withBackground(svg, '#ffffff', box)).toBe(playgroundDrawings.withBackground(svg, '#ffffff', box));
    }
  });
});
