// @vitest-environment jsdom
//
// The program chip's list (phase 2d, step 5a; mockup v6 screen G,
// docs/workspace-files.md "The preview and the program list"): which programs
// it holds and in what order, each row, the chip's red dot, and what an edit
// that adds or takes out `module;` does to pathogen.json's list. The real
// engine sits on window.PathogenLang, as the bundle does in the browser.

import { beforeAll, describe, expect, it } from 'vitest';

import {
  chipAlert,
  LIBRARY_MAIN,
  programItems,
  programListChange,
  programsOf,
} from '../playground/services/program-list.js';

import type { WorkspaceState } from '../playground/services/workspace-edits.js';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const TRY = 'circle(10, 10, 4);\n';
const isLibrary = (_path: string, text: string): boolean => text.startsWith('module;');

const texts = (files: Record<string, string>) => new Map(Object.entries(files));

describe('the programs the list holds', () => {
  it("pathogen.json's order, the main first; libraries never", () => {
    const files = texts({
      'main.pathogen': MAIN,
      'parts/gears.pathogen': GEARS,
      'try-sizes.pathogen': TRY,
      'demos/gears.pathogen': TRY,
    });
    expect(programsOf(files, ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'], isLibrary)).toEqual([
      'main.pathogen',
      'demos/gears.pathogen',
      'try-sizes.pathogen',
    ]);
  });

  it('the main stays first when it becomes a library; another program that does leaves', () => {
    const files = texts({
      'main.pathogen': `module;\n${MAIN}`,
      'try-sizes.pathogen': `module;\n${TRY}`,
      'b.pathogen': TRY,
    });
    expect(programsOf(files, ['main.pathogen', 'try-sizes.pathogen', 'b.pathogen'], isLibrary)).toEqual([
      'main.pathogen',
      'b.pathogen',
    ]);
  });

  it("a program the list doesn't name (an older save) comes after, by path; a name with no file is skipped", () => {
    const files = texts({ 'z.pathogen': TRY, 'main.pathogen': MAIN, 'a/b.pathogen': TRY, 'lib.pathogen': GEARS });
    expect(programsOf(files, ['gone.pathogen', 'main.pathogen'], isLibrary)).toEqual([
      'main.pathogen',
      'a/b.pathogen',
      'z.pathogen',
    ]);
  });
});

describe('the rows', () => {
  it('names as the tabs give them, the main badge on a main that isn’t main.pathogen, no error', () => {
    const items = programItems(
      ['try-sizes.pathogen', 'main.pathogen', 'demos/gears.pathogen', 'parts/gears.pathogen'],
      {
        main: 'try-sizes.pathogen',
        mainIsLibrary: false,
      },
    );
    expect(items.map(({ path, name, hint, badge, error }) => [path, name, hint, badge, error])).toEqual([
      ['try-sizes.pathogen', 'try-sizes', null, true, null],
      ['main.pathogen', 'main', null, false, null],
      ['demos/gears.pathogen', 'gears', 'demos', false, null],
      ['parts/gears.pathogen', 'gears', 'parts', false, null],
    ]);
    // main.pathogen as the main has no badge (the convention).
    expect(programItems(['main.pathogen'], { main: 'main.pathogen', mainIsLibrary: false })[0].badge).toBe(false);
  });

  it('a main that’s become a library says so (screen E, state 4)', () => {
    const [main, other] = programItems(['main.pathogen', 'b.pathogen'], { main: 'main.pathogen', mainIsLibrary: true });
    expect([main.error, other.error, LIBRARY_MAIN]).toEqual([
      LIBRARY_MAIN,
      null,
      "A library now, so it can't be the main",
    ]);
  });
});

describe("the chip's red dot", () => {
  const item = (path: string, error: string | null) => ({
    path,
    name: path,
    hint: null,
    badge: false,
    error,
    uses: null,
    updating: false,
    miniature: null,
  });

  it('another program has an error; the one shown has the error panel instead', () => {
    expect(chipAlert([item('a', null), item('b', 'Error in b line 2')], 'a')).toBe('Another program has an error');
    expect(chipAlert([item('a', 'Error in a line 2'), item('b', null)], 'a')).toBeNull();
    expect(chipAlert([item('a', null), item('b', null)], 'a')).toBeNull();
  });

  it('the main as a library lights it even while shown, and says why', () => {
    expect(chipAlert([item('main.pathogen', LIBRARY_MAIN), item('b', null)], 'main.pathogen')).toBe(
      `main.pathogen: ${LIBRARY_MAIN}`,
    );
  });
});

describe("pathogen.json's list after edits", () => {
  const state = (files: Record<string, string>, entryPoints: string[]): WorkspaceState => ({
    files,
    folders: [],
    entryPoints,
  });

  it('a program that gains module; leaves; one that loses it goes back at the end', () => {
    const before = state({ 'main.pathogen': MAIN, 'try-sizes.pathogen': `module;\n${TRY}`, 'b.pathogen': TRY }, [
      'main.pathogen',
      'try-sizes.pathogen',
      'b.pathogen',
    ]);
    expect(programListChange(before, ['try-sizes.pathogen'])).toEqual({
      steps: [
        {
          kind: 'entryPoints',
          before: ['main.pathogen', 'try-sizes.pathogen', 'b.pathogen'],
          after: ['main.pathogen', 'b.pathogen'],
        },
      ],
      importsUpdated: [],
    });
    const back = state({ 'main.pathogen': MAIN, 'try-sizes.pathogen': TRY, 'b.pathogen': TRY }, [
      'main.pathogen',
      'b.pathogen',
    ]);
    expect(programListChange(back, ['try-sizes.pathogen'])?.steps).toEqual([
      {
        kind: 'entryPoints',
        before: ['main.pathogen', 'b.pathogen'],
        after: ['main.pathogen', 'b.pathogen', 'try-sizes.pathogen'],
      },
    ]);
  });

  it('several files edited since the last look: each one counts, in order', () => {
    const before = state({ 'main.pathogen': MAIN, 'a.pathogen': `module;\n${TRY}`, 'b.pathogen': TRY }, [
      'main.pathogen',
      'a.pathogen',
    ]);
    expect(programListChange(before, ['a.pathogen', 'b.pathogen'])?.steps).toEqual([
      { kind: 'entryPoints', before: ['main.pathogen', 'a.pathogen'], after: ['main.pathogen', 'b.pathogen'] },
    ]);
  });

  it('the first program of a workspace with none is shown', () => {
    const before = state({ 'lib.pathogen': TRY }, []);
    expect(programListChange(before, ['lib.pathogen'])).toEqual({
      steps: [{ kind: 'entryPoints', before: [], after: ['lib.pathogen'] }],
      importsUpdated: [],
      show: 'lib.pathogen',
    });
  });

  it('nothing changes: the main, a library edited, a file gone, an edit that keeps its kind', () => {
    const before = state({ 'main.pathogen': `module;\n${MAIN}`, 'parts/gears.pathogen': GEARS, 'b.pathogen': TRY }, [
      'main.pathogen',
      'b.pathogen',
    ]);
    expect(
      programListChange(before, ['main.pathogen', 'parts/gears.pathogen', 'gone.pathogen', 'b.pathogen']),
    ).toBeNull();
    expect(programListChange(before, [])).toBeNull();
  });
});
