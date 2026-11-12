// @vitest-environment jsdom
//
// Making a planned change to the workspace the playground holds (2d, step 4b;
// playground/services/workspace-apply.ts). The plans are step 2's
// (workspace-edits.ts); this is where one lands in the store: every file, the
// folders and the program list together, the open file's typed text kept, and
// a plan made for another workspace changing nothing.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyToWorkspace, workspaceState } from '../playground/services/workspace-apply.js';
import { planNewFile, planNewFolder, PROJECT_FILE } from '../playground/services/workspace-edits.js';
import { workspaceNow } from '../playground/services/workspace-files.js';
import { store } from '../playground/state/store.js';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(10);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const NEW_LIBRARY = 'module;\n\n// A library. Export fns, consts and enums here;\n// other files import them.\n';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

beforeEach(() => {
  store.update({
    workspaceFiles: { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS },
    workspaceFolders: [],
    workspaceEntryPoints: ['main.pathogen'],
    openFile: 'main.pathogen',
    openFiles: ['main.pathogen'],
    // Typed since the last tab switch: newer than workspaceFiles' copy.
    code: `${MAIN}gear(20);\n`,
    shownProgram: null,
  });
});

function planned(plan: ReturnType<typeof planNewFile>) {
  if (!plan.ok) throw new Error(plan.message);
  return plan.change;
}

describe('applying a change to the workspace', () => {
  it('reads the workspace as it stands, the open file’s typed text included, never pathogen.json', () => {
    expect(workspaceState().files['main.pathogen']).toBe(`${MAIN}gear(20);\n`);
    store.update({ openFile: PROJECT_FILE, code: '{}\n' });
    expect(Object.keys(workspaceState().files).sort()).toEqual(['main.pathogen', 'parts/gears.pathogen']);
  });

  it('a new library joins the files; the open file keeps its typed text; the programs stay', () => {
    const result = applyToWorkspace(planned(planNewFile(workspaceState(), 'parts', 'ratchet', 'library')));
    expect(result.ok).toBe(true);
    expect(store.get('workspaceFiles')).toEqual({
      'main.pathogen': `${MAIN}gear(20);\n`,
      'parts/gears.pathogen': GEARS,
      'parts/ratchet.pathogen': NEW_LIBRARY,
    });
    expect(Object.fromEntries(workspaceNow().texts)['main.pathogen']).toBe(`${MAIN}gear(20);\n`);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([['main.pathogen'], null]);
  });

  it('a new program goes at the end of the program list, and the preview stays', () => {
    applyToWorkspace(planned(planNewFile(workspaceState(), '', 'poster', 'program')));
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([
      ['main.pathogen', 'poster.pathogen'],
      null,
    ]);
  });

  it('in a workspace with no programs, the new program is the main and is shown', () => {
    store.update({
      workspaceFiles: { 'parts/gears.pathogen': GEARS },
      workspaceEntryPoints: [],
      openFile: 'parts/gears.pathogen',
      code: GEARS,
    });
    const change = planned(planNewFile(workspaceState(), '', 'poster', 'program'));
    expect(change.show).toBe('poster.pathogen');
    applyToWorkspace(change);
    expect([store.get('workspaceEntryPoints'), store.get('shownProgram')]).toEqual([
      ['poster.pathogen'],
      'poster.pathogen',
    ]);
  });

  it('a new folder is kept, empty', () => {
    const plan = planNewFolder(workspaceState(), '', 'examples');
    applyToWorkspace(planned(plan));
    expect(store.get('workspaceFolders')).toEqual(['examples']);
  });

  it('a change planned for another workspace changes nothing, and says why', () => {
    const change = planned(planNewFile(workspaceState(), 'parts', 'ratchet', 'library'));
    expect(applyToWorkspace(change).ok).toBe(true);
    const before = store.get('workspaceFiles');
    expect(applyToWorkspace(change)).toEqual({
      ok: false,
      message: 'parts/ratchet.pathogen is already in the workspace.',
    });
    expect(store.get('workspaceFiles')).toBe(before);
  });
});
