// @vitest-environment jsdom
//
// The workspace's edits (phase 2d, step 2; playground/services/workspace-edits.ts):
// every plan the tree's menus will call, against docs/workspace-files.md. Each
// test of a plan that succeeds also checks two contracts through `made()`:
// - the folders and program list it leaves are the server's normal form
//   (checkWorkspaceManifest's own output), so the autosave hash settles;
// - its Undo puts the workspace back exactly.
// The real engine sits on window.PathogenLang, as the bundle does in the browser.

import { beforeAll, describe, expect, it } from 'vitest';

import {
  applyChange,
  deleteSummary,
  entryPointsAfterEdit,
  importChangeOffsets,
  keepBothName,
  moveHint,
  pathAfterChange,
  planDelete,
  planDuplicate,
  planMove,
  planNewFile,
  planNewFolder,
  planRename,
  planSetMain,
  projectFileText,
  renameHint,
  StaleChangeError,
} from '../playground/services/workspace-edits.js';
import { emptyBoilerplate } from '../playground/utils/examples.js';

import type { Change, Planned, WorkspaceState } from '../playground/services/workspace-edits.js';

const loadEngine = async () => import('../src');
let engine: Awaited<ReturnType<typeof loadEngine>>;
beforeAll(async () => {
  engine = await loadEngine();
  (window as unknown as { PathogenLang: unknown }).PathogenLang = engine;
});

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\nimport * as kit from "./parts/kit.pathogen";\ngear(10);\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\nimport { caption } from "../parts/labels.pathogen";\ngear(5);\n';
const TRY = 'import * as kit from "./parts/kit.pathogen";\nkit.gear(3);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const KIT = 'module;\nimport * as gears from "./gears.pathogen";\nexport const gear = gears.gear;\n';
const LABELS = 'module;\nexport fn caption(t) {\n  log(t);\n}\n';

const gearsWorkspace = (): WorkspaceState => ({
  files: {
    'main.pathogen': MAIN,
    'demos/gears.pathogen': DEMO,
    'try-sizes.pathogen': TRY,
    'parts/gears.pathogen': GEARS,
    'parts/kit.pathogen': KIT,
    'parts/labels.pathogen': LABELS,
  },
  folders: [],
  entryPoints: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'],
});

/** The server's normal form of a workspace's folders and program list. */
function serverForm(state: WorkspaceState) {
  const manifest = {
    files: Object.fromEntries(Object.keys(state.files).map((p) => [p, { sha256: '0'.repeat(64), size: 1 }])),
    folders: state.folders,
    entryPoints: state.entryPoints,
  };
  const checked = engine.checkWorkspaceManifest(manifest);
  if (!checked.ok) throw new Error(checked.message);
  return { folders: checked.value.folders, entryPoints: checked.value.entryPoints };
}

/** A plan that succeeds: the workspace it leaves, after checking its normal form and its Undo. */
function made(state: WorkspaceState, planned: Planned): { after: WorkspaceState; change: Change; undo: Change } {
  if (!planned.ok) throw new Error(`refused: ${planned.message}`);
  const after = applyChange(state, planned.change);
  expect({ folders: after.folders, entryPoints: after.entryPoints }).toEqual(serverForm(after));
  expect(applyChange(after, planned.undo)).toEqual(state);
  return { after, change: planned.change, undo: planned.undo };
}

const refusal = (planned: Planned): string => (planned.ok ? '(made)' : planned.message);

describe('New program, New module', () => {
  it('a new library starts with module; and stays out of the program list; it opens in a tab', () => {
    const state = gearsWorkspace();
    const { after, change } = made(state, planNewFile(state, 'parts', 'ratchet', 'library'));
    expect(after.files['parts/ratchet.pathogen'].startsWith('module;\n')).toBe(true);
    expect(after.entryPoints).toEqual(state.entryPoints);
    expect(change.open).toBe('parts/ratchet.pathogen');
    expect(change.show).toBeUndefined();
  });

  it('a new program starts like a new workspace and goes at the end of the list; the preview stays', () => {
    const state = gearsWorkspace();
    const { after, change } = made(state, planNewFile(state, '', 'poster', 'program'));
    expect(after.files['poster.pathogen']).toBe(emptyBoilerplate);
    expect(after.entryPoints).toEqual([...state.entryPoints, 'poster.pathogen']);
    expect(change.show).toBeUndefined();
  });

  it('a slash makes folders, inside the folder it is added to', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planNewFile(state, 'parts', 'shapes/star', 'library'));
    expect(Object.keys(after.files)).toContain('parts/shapes/star.pathogen');
    expect(after.folders).toEqual([]);
  });

  it('adds .pathogen once, even when it is typed', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planNewFile(state, '', 'star.pathogen', 'program'));
    expect(Object.keys(after.files)).toContain('star.pathogen');
  });

  it('refuses a name taken in any letter case, naming the folder and the file there', () => {
    const state = gearsWorkspace();
    expect(refusal(planNewFile(state, 'parts', 'gears', 'library'))).toBe('parts/ already has gears.pathogen.');
    expect(refusal(planNewFile(state, 'parts', 'Gears', 'library'))).toBe('parts/ already has gears.pathogen.');
    expect(refusal(planNewFile(state, '', 'main', 'program'))).toBe(
      'The top of the workspace already has main.pathogen.',
    );
  });

  it('refuses names the workspace rules refuse', () => {
    const state = gearsWorkspace();
    expect(refusal(planNewFile(state, '', 'my gear', 'program'))).toBe(
      '"my gear" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    );
    expect(refusal(planNewFile(state, '', '', 'program'))).toBe("A name can't be empty.");
    expect(refusal(planNewFile(state, '', 'shapes//star', 'program'))).toBe("A name can't be empty.");
  });

  it('refuses a 21st file', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) files[`f${i}.pathogen`] = 'module;\n';
    const state: WorkspaceState = { files, folders: [], entryPoints: [] };
    expect(refusal(planNewFile(state, '', 'one-more', 'library'))).toBe(
      'A workspace can hold at most 20 files, and this one has 20.',
    );
  });

  it('a file added to an empty folder takes it off the empty-folder list', () => {
    const state = { ...gearsWorkspace(), folders: ['examples'] };
    const { after } = made(state, planNewFile(state, 'examples', 'spiral', 'program'));
    expect(after.folders).toEqual([]);
  });

  it('in a workspace with no programs, the new program is the main and the preview shows it', () => {
    const state: WorkspaceState = { files: { 'parts/gears.pathogen': GEARS }, folders: [], entryPoints: [] };
    const { after, change } = made(state, planNewFile(state, '', 'poster', 'program'));
    expect(after.entryPoints).toEqual(['poster.pathogen']);
    expect(change.show).toBe('poster.pathogen');
  });
});

describe('New folder', () => {
  it('is kept, empty', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planNewFolder(state, '', 'examples'));
    expect(after.folders).toEqual(['examples']);
  });

  it('refuses a folder already there', () => {
    const state = gearsWorkspace();
    expect(refusal(planNewFolder(state, '', 'Parts'))).toBe('The top of the workspace already has parts/.');
  });
});

describe('Rename… (the name only)', () => {
  it('rewrites the imports that name the file, and says which files changed', () => {
    const state = gearsWorkspace();
    const { after, change } = made(state, planRename(state, 'parts/gears.pathogen', 'cogs'));
    expect(Object.keys(after.files)).toContain('parts/cogs.pathogen');
    expect(after.files['main.pathogen'].split('\n')[0]).toBe('import { gear } from "./parts/cogs.pathogen";');
    expect(after.files['parts/kit.pathogen'].split('\n')[1]).toBe('import * as gears from "./cogs.pathogen";');
    expect(change.importsUpdated).toEqual(['main.pathogen', 'demos/gears.pathogen', 'parts/kit.pathogen']);
    expect(change.message).toBe(
      'Renamed parts/gears.pathogen to cogs.pathogen, and updated the imports in main.pathogen, demos/gears.pathogen and parts/kit.pathogen.',
    );
  });

  it('renaming the main keeps it the main', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planRename(state, 'main.pathogen', 'poster'));
    expect(after.entryPoints[0]).toBe('poster.pathogen');
  });

  it('refuses a slash: moving is Move to…', () => {
    const state = gearsWorkspace();
    expect(refusal(planRename(state, 'parts/gears.pathogen', 'machines/gears'))).toBe(
      "A name can't hold a slash. To move it to another folder, use Move to….",
    );
  });

  it("keeps the .pathogen: it isn't part of the name field", () => {
    const state = gearsWorkspace();
    const { after } = made(state, planRename(state, 'parts/gears.pathogen', 'cogs.pathogen'));
    expect(Object.keys(after.files)).toContain('parts/cogs.pathogen');
    expect(refusal(planRename(state, 'parts/gears.pathogen', ''))).toBe("A name can't be empty.");
  });

  it('can change only the letter case', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planRename(state, 'parts/gears.pathogen', 'Gears'));
    expect(after.files['main.pathogen'].split('\n')[0]).toBe('import { gear } from "./parts/Gears.pathogen";');
  });

  it('the same name changes nothing; a taken one is refused', () => {
    const state = gearsWorkspace();
    const same = planRename(state, 'parts/gears.pathogen', 'gears');
    expect(same.ok && same.change.steps).toEqual([]);
    expect(refusal(planRename(state, 'parts/gears.pathogen', 'kit'))).toBe('parts/ already has kit.pathogen.');
  });

  it('renaming a folder moves everything in it, its empty folders too', () => {
    const state = { ...gearsWorkspace(), folders: ['parts/spare'] };
    const { after, change } = made(state, planRename(state, 'parts', 'machines'));
    expect(
      Object.keys(after.files)
        .filter((p) => p.startsWith('machines/'))
        .sort(),
    ).toEqual(['machines/gears.pathogen', 'machines/kit.pathogen', 'machines/labels.pathogen']);
    expect(after.folders).toEqual(['machines/spare']);
    expect(after.files['parts/kit.pathogen']).toBeUndefined();
    expect(change.message).toBe(
      'Renamed parts/ to machines/, and updated the imports in main.pathogen, demos/gears.pathogen and try-sizes.pathogen.',
    );
  });

  it('refuses pathogen.json: the playground writes it', () => {
    expect(refusal(planRename(gearsWorkspace(), 'pathogen.json', 'project'))).toBe(
      "pathogen.json can't be renamed: the playground writes it.",
    );
  });
});

describe('Move to…', () => {
  it('moves a file into another folder, with the imports that name it and its own', () => {
    const state = gearsWorkspace();
    const { after, change } = made(state, planMove(state, 'parts/kit.pathogen', 'demos'));
    expect(after.files['demos/kit.pathogen'].split('\n')[1]).toBe('import * as gears from "../parts/gears.pathogen";');
    expect(after.files['main.pathogen'].split('\n')[1]).toBe('import * as kit from "./demos/kit.pathogen";');
    expect(change.message).toBe(
      'Moved parts/kit.pathogen to demos/, and updated the imports in main.pathogen, try-sizes.pathogen and demos/kit.pathogen.',
    );
  });

  it('moving the last file out of a folder keeps the folder, empty', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planMove(state, 'demos/gears.pathogen', ''));
    expect(after.folders).toEqual(['demos']);
    expect(after.entryPoints).toEqual(['main.pathogen', 'gears.pathogen', 'try-sizes.pathogen']);
  });

  it('where a file is after a change (pathAfterChange): moved, moved with its folder, renamed, or unmoved', () => {
    const state = gearsWorkspace();
    const file = made(state, planMove(state, 'parts/kit.pathogen', 'demos')).change;
    const folder = made(state, planMove(state, 'parts', 'demos')).change;
    const renamed = made(state, planRename(state, 'try-sizes.pathogen', 'sizes')).change;
    expect([
      pathAfterChange('parts/kit.pathogen', file),
      pathAfterChange('main.pathogen', file),
      pathAfterChange('parts/gears.pathogen', folder),
      pathAfterChange('partsy.pathogen', folder),
      pathAfterChange('try-sizes.pathogen', renamed),
    ]).toEqual([
      'demos/kit.pathogen',
      'main.pathogen',
      'demos/parts/gears.pathogen',
      'partsy.pathogen',
      'sizes.pathogen',
    ]);
  });

  it('refuses moving a folder into itself, a place that is no folder, and a name taken there', () => {
    const state = { ...gearsWorkspace(), folders: ['parts/spare'] };
    expect(refusal(planMove(state, 'parts', 'parts/spare'))).toBe("parts/ can't move into itself.");
    expect(refusal(planMove(state, 'parts', 'parts'))).toBe("parts/ can't move into itself.");
    expect(refusal(planMove(state, 'main.pathogen', 'nowhere'))).toBe("nowhere/ isn't a folder in the workspace.");
    expect(refusal(planMove(state, 'demos/gears.pathogen', 'parts'))).toBe('parts/ already has gears.pathogen.');
  });

  it('moving to the folder it is in changes nothing', () => {
    const state = gearsWorkspace();
    const same = planMove(state, 'parts/kit.pathogen', 'parts');
    expect(same.ok && same.change.steps).toEqual([]);
  });
});

// The lines the tree shows before you choose (mockup v7 screen F, states 2, 5 and 6).
describe('what a rename or a move says it will do', () => {
  const change = (planned: Planned): Change => {
    if (!planned.ok) throw new Error(planned.message);
    return planned.change;
  };

  it('Rename…: the files a folder moves, and the files whose imports change', () => {
    const state = gearsWorkspace();
    expect(renameHint(change(planRename(state, 'parts', 'machines')), true)).toBe(
      'Moves its 3 files, and updates the imports in 3 files',
    );
    expect(renameHint(change(planRename(state, 'parts/gears.pathogen', 'cogs')), false)).toBe(
      'Updates the imports in 3 files',
    );
    // Nothing imports it, and it's a file: nothing to say.
    expect(renameHint(change(planRename(state, 'try-sizes.pathogen', 'poster')), false)).toBeUndefined();
    const spare = { ...state, folders: ['spare'] };
    expect(renameHint(change(planRename(spare, 'demos', 'examples')), true)).toBe('Moves its file');
  });

  it('Move to…: the files whose imports change, a moved file’s own last', () => {
    const state = gearsWorkspace();
    expect(moveHint(change(planMove(state, 'parts/kit.pathogen', 'demos')), 'parts/kit.pathogen', 'demos', false)).toBe(
      'Moving it to demos/ updates the imports in main.pathogen and try-sizes.pathogen, and kit.pathogen’s own.',
    );
    expect(moveHint(change(planMove(state, 'try-sizes.pathogen', 'demos')), 'try-sizes.pathogen', 'demos', false)).toBe(
      'Moving it to demos/ updates try-sizes.pathogen’s own imports.',
    );
    const withSpare = { ...state, folders: ['spare'] };
    expect(moveHint(change(planMove(withSpare, 'parts/labels.pathogen', '')), 'parts/labels.pathogen', '', false)).toBe(
      'Moving it to the top updates the imports in demos/gears.pathogen.',
    );
    expect(moveHint(change(planMove(withSpare, 'demos', 'spare')), 'demos', 'spare', true)).toBe(
      'Moving it to spare/ updates the imports in spare/demos/gears.pathogen.',
    );
    const lone = { files: { 'a.pathogen': 'M 0 0;\n' }, folders: ['b'], entryPoints: ['a.pathogen'] };
    expect(moveHint(change(planMove(lone, 'a.pathogen', 'b')), 'a.pathogen', 'b', false)).toBe(
      'Moving it to b/ changes no imports.',
    );
  });
});

describe('Undo (the toast after a rename or a move)', () => {
  it('still works after you typed elsewhere in a file whose imports it changed, and keeps what you typed', () => {
    const state = gearsWorkspace();
    const { after, undo } = made(state, planRename(state, 'parts', 'machines'));
    const typed = {
      ...after,
      files: { ...after.files, 'main.pathogen': `// a note at the top\n${after.files['main.pathogen']}gear(20);\n` },
    };
    const back = applyChange(typed, undo);
    expect(back.files['main.pathogen']).toBe(`// a note at the top\n${MAIN}gear(20);\n`);
    expect(Object.keys(back.files).sort()).toEqual(Object.keys(state.files).sort());
  });

  it('is refused, changing nothing, when an import it would put back was retyped', () => {
    const state = gearsWorkspace();
    const { after, undo } = made(state, planRename(state, 'parts/gears.pathogen', 'cogs'));
    const retyped = {
      ...after,
      files: { ...after.files, 'main.pathogen': after.files['main.pathogen'].replace('./parts/cogs', './parts/other') },
    };
    expect(() => applyChange(retyped, undo)).toThrow(StaleChangeError);
    expect(() => applyChange(retyped, undo)).toThrow(
      'main.pathogen no longer imports "./parts/cogs.pathogen" where it did, so its imports were left as they are.',
    );
  });

  it('is refused when an import alike was typed in since: the one it counted to is another now', () => {
    const state = gearsWorkspace();
    const { after, undo } = made(state, planRename(state, 'parts/gears.pathogen', 'cogs'));
    const line = 'import { gear } from "./parts/cogs.pathogen";\n';
    const doubled = { ...after, files: { ...after.files, 'main.pathogen': `${line}${after.files['main.pathogen']}` } };
    expect(() => applyChange(doubled, undo)).toThrow(
      'main.pathogen no longer imports "./parts/cogs.pathogen" where it did, so its imports were left as they are.',
    );
    // An import of something else typed in since doesn't count.
    const other = 'import { caption } from "./parts/labels.pathogen";\n';
    const typed = { ...after, files: { ...after.files, 'main.pathogen': `${other}${after.files['main.pathogen']}` } };
    expect(applyChange(typed, undo).files['main.pathogen']).toBe(`${other}${MAIN}`);
  });

  it('is refused when the program list changed since', () => {
    const state = gearsWorkspace();
    const { after, undo } = made(state, planRename(state, 'main.pathogen', 'poster'));
    const reordered = { ...after, entryPoints: [...after.entryPoints].reverse() };
    expect(() => applyChange(reordered, undo)).toThrow('The program list changed since.');
  });

  it("gives an editor each import's place in the text it holds now", () => {
    const state = gearsWorkspace();
    const planned = planRename(state, 'parts/gears.pathogen', 'cogs');
    if (!planned.ok) throw new Error(planned.message);
    const step = planned.change.steps.find((s) => s.kind === 'imports' && s.path === 'main.pathogen');
    if (step?.kind !== 'imports') throw new Error('no import step for main');
    const live = `// typed in the editor\n${MAIN}`;
    const [edit] = importChangeOffsets(live, 'main.pathogen', step.changes);
    expect(live.slice(edit.from, edit.to)).toBe('./parts/gears.pathogen');
    expect(edit.insert).toBe('./parts/cogs.pathogen');
  });
});

describe('Duplicate and Keep-both names', () => {
  it('a copy of a library goes beside it; a copy of a program also goes at the end of the list', () => {
    const state = gearsWorkspace();
    const lib = made(state, planDuplicate(state, 'parts/labels.pathogen')).after;
    expect(lib.files['parts/labels-2.pathogen']).toBe(LABELS);
    expect(lib.entryPoints).toEqual(state.entryPoints);
    const prog = made(state, planDuplicate(state, 'try-sizes.pathogen')).after;
    expect(prog.entryPoints).toEqual([...state.entryPoints, 'try-sizes-2.pathogen']);
  });

  it('numbers after the whole name, skipping names taken in any letter case', () => {
    const state = gearsWorkspace();
    state.files['parts/Labels-2.pathogen'] = LABELS;
    expect(keepBothName(state, 'parts', 'labels.pathogen')).toBe('labels-3.pathogen');
    expect(keepBothName(state, 'parts', 'Labels-2.pathogen')).toBe('Labels-2-2.pathogen');
    expect(keepBothName(state, '', 'poster-2026.pathogen')).toBe('poster-2026-2.pathogen');
  });
});

describe('Delete…', () => {
  it('deleting the main makes the next program the main, and says so', () => {
    const state = gearsWorkspace();
    const { after, change } = made(state, planDelete(state, 'main.pathogen'));
    expect(after.entryPoints).toEqual(['demos/gears.pathogen', 'try-sizes.pathogen']);
    expect(change.message).toBe(
      'Deleted main.pathogen. demos/gears.pathogen is the main now: it was next in entryPoints.',
    );
  });

  it('deleting the last program leaves no main, and pathogen.json is {}', () => {
    const state: WorkspaceState = {
      files: { 'try-sizes.pathogen': TRY, 'parts/kit.pathogen': KIT },
      folders: [],
      entryPoints: ['try-sizes.pathogen'],
    };
    const { after, change } = made(state, planDelete(state, 'try-sizes.pathogen'));
    expect(after.entryPoints).toEqual([]);
    expect(projectFileText(after.entryPoints)).toBe('{}\n');
    expect(change.message).toBe(
      'Deleted try-sizes.pathogen. It was the last program, so the preview is empty until you add one.',
    );
  });

  it('deleting a folder deletes the files in it; the dialog names them and the files that import them', () => {
    const state = gearsWorkspace();
    expect(deleteSummary(state, 'parts')).toEqual({
      files: ['parts/gears.pathogen', 'parts/kit.pathogen', 'parts/labels.pathogen'],
      importers: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'],
    });
    const { after, change } = made(state, planDelete(state, 'parts'));
    expect(Object.keys(after.files).sort()).toEqual(['demos/gears.pathogen', 'main.pathogen', 'try-sizes.pathogen']);
    expect(after.folders).toEqual([]);
    expect(change.message).toBe('Deleted parts/ and the 3 files in it.');
  });

  it('the folder a deleted file was in stays, empty if it was the last', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planDelete(state, 'demos/gears.pathogen'));
    expect(after.folders).toEqual(['demos']);
  });
});

describe('Set as main, and module; in the program list', () => {
  it('Set as main puts the program first; the old main is second; the rest keep their order', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planSetMain(state, 'try-sizes.pathogen'));
    expect(after.entryPoints).toEqual(['try-sizes.pathogen', 'main.pathogen', 'demos/gears.pathogen']);
    expect(refusal(planSetMain(state, 'parts/kit.pathogen'))).toBe("A module can't be the main.");
  });

  it('a program gaining module; leaves the list; losing it, it goes back at the end; the main stays first', () => {
    const state = gearsWorkspace();
    expect(entryPointsAfterEdit(state, 'try-sizes.pathogen', `module;\n${TRY}`)).toEqual({
      entryPoints: ['main.pathogen', 'demos/gears.pathogen'],
    });
    expect(entryPointsAfterEdit(state, 'parts/kit.pathogen', 'kit.gear(1);\n')).toEqual({
      entryPoints: [...state.entryPoints, 'parts/kit.pathogen'],
    });
    expect(entryPointsAfterEdit(state, 'main.pathogen', `module;\n${MAIN}`)).toBeNull();
    expect(entryPointsAfterEdit(state, 'try-sizes.pathogen', `${TRY}// edited\n`)).toBeNull();
  });

  it('a library losing module; in a workspace with no programs becomes the main and is shown', () => {
    const state: WorkspaceState = { files: { 'parts/kit.pathogen': KIT }, folders: [], entryPoints: [] };
    expect(entryPointsAfterEdit(state, 'parts/kit.pathogen', 'circle(0, 0, 4);\n')).toEqual({
      entryPoints: ['parts/kit.pathogen'],
      show: 'parts/kit.pathogen',
    });
  });

  it("pathogen.json's text is the engine's", () => {
    expect(projectFileText(['main.pathogen'])).toBe(engine.workspaceProjectFileText(['main.pathogen']));
  });
});

describe('imports the edits keep track of', () => {
  // Two imports of kit, one written another way, one single-quoted, and one
  // still being typed (no closing quote).
  const SPELLINGS = [
    'import { gear } from "../parts/kit.pathogen";',
    "import * as kit from '../parts/kit.pathogen';",
    'import { gear as g2 } from "./../parts/kit.pathogen";',
    'kit.gear(1);',
    'import { more } from "../parts/ki',
  ].join('\n');
  const spellingsWorkspace = (): WorkspaceState => ({
    files: { ...gearsWorkspace().files, 'demos/spellings.pathogen': SPELLINGS },
    folders: [],
    entryPoints: [...gearsWorkspace().entryPoints, 'demos/spellings.pathogen'],
  });

  it('rewrites every import of a moved file, however it is written, and leaves one still being typed', () => {
    const state = spellingsWorkspace();
    const { after } = made(state, planMove(state, 'parts/kit.pathogen', ''));
    expect(after.files['demos/spellings.pathogen']).toBe(
      [
        'import { gear } from "../kit.pathogen";',
        "import * as kit from '../kit.pathogen';",
        'import { gear as g2 } from "../kit.pathogen";',
        'kit.gear(1);',
        'import { more } from "../parts/ki',
      ].join('\n'),
    );
  });

  it('Undo finds each import by what it imports, even with another import of the same file typed above it', () => {
    const state = spellingsWorkspace();
    const { after, undo } = made(state, planMove(state, 'parts/kit.pathogen', ''));
    // You add an import of kit at the top, then press Undo.
    const added = 'import { other } from "../kit.pathogen";\n';
    const typed = {
      ...after,
      files: { ...after.files, 'demos/spellings.pathogen': added + after.files['demos/spellings.pathogen'] },
    };
    const back = applyChange(typed, undo);
    // The three imports go back as they were written; yours stays as you typed it.
    expect(back.files['demos/spellings.pathogen']).toBe(added + SPELLINGS);
  });

  it('a whole file is right after a rename: every import of the file, and nothing else', () => {
    const state = gearsWorkspace();
    const { after } = made(state, planRename(state, 'parts', 'machines'));
    expect(after.files['main.pathogen']).toBe(MAIN.replaceAll('./parts/', './machines/'));
    expect(after.files['demos/gears.pathogen']).toBe(DEMO.replaceAll('../parts/', '../machines/'));
    expect(after.files['machines/kit.pathogen']).toBe(KIT);
  });
});

describe('applying a change is all or nothing', () => {
  it('a change that fails partway leaves the workspace as it was', () => {
    const state = gearsWorkspace();
    const before = structuredClone(state);
    const change: Change = {
      steps: [
        { kind: 'add', path: 'new.pathogen', text: 'module;\n' },
        { kind: 'remove', path: 'gone.pathogen', text: '' },
      ],
      importsUpdated: [],
    };
    expect(() => applyChange(state, change)).toThrow("gone.pathogen isn't in the workspace any more.");
    expect(state).toEqual(before);
  });

  it('a refused Undo changes nothing', () => {
    const state = gearsWorkspace();
    const { after, undo } = made(state, planRename(state, 'parts/gears.pathogen', 'cogs'));
    const retyped = {
      ...after,
      files: { ...after.files, 'main.pathogen': after.files['main.pathogen'].replace('./parts/cogs', './x/cogs') },
    };
    const snapshot = structuredClone(retyped);
    expect(() => applyChange(retyped, undo)).toThrow(StaleChangeError);
    expect(retyped).toEqual(snapshot);
  });
});

describe('more folders, names and limits', () => {
  it('deleting an empty folder', () => {
    const state = { ...gearsWorkspace(), folders: ['spare'] };
    const { after, change } = made(state, planDelete(state, 'spare'));
    expect(after.folders).toEqual([]);
    expect(change.message).toBe('Deleted spare/.');
  });

  it('deleting a file deep in folders keeps every folder it was in', () => {
    const state: WorkspaceState = { files: { 'a/b/c.pathogen': 'module;\n' }, folders: [], entryPoints: [] };
    const { after } = made(state, planDelete(state, 'a/b/c.pathogen'));
    expect(after.folders).toEqual(['a/b']);
  });

  it('moves a folder into another folder, and back out to the top', () => {
    const state = gearsWorkspace();
    const into = made(state, planMove(state, 'demos', 'parts')).after;
    expect(into.files['parts/demos/gears.pathogen']).toBe(DEMO.replaceAll('../parts/', '../'));
    expect(into.entryPoints[1]).toBe('parts/demos/gears.pathogen');
    const out = made(into, planMove(into, 'parts/demos', '')).after;
    expect(out.files).toEqual(state.files);
  });

  it('moves a file into an empty folder, which is then no longer empty', () => {
    const state = { ...gearsWorkspace(), folders: ['spare'] };
    const { after } = made(state, planMove(state, 'try-sizes.pathogen', 'spare'));
    expect(after.folders).toEqual([]);
    expect(after.files['spare/try-sizes.pathogen']).toBe(TRY.replace('./parts/', '../parts/'));
  });

  it('refuses a folder rename or move onto a name taken', () => {
    const state = { ...gearsWorkspace(), folders: ['machines', 'parts/demos'] };
    expect(refusal(planRename(state, 'parts', 'machines'))).toBe('The top of the workspace already has machines/.');
    expect(refusal(planMove(state, 'demos', 'parts'))).toBe('parts/ already has demos/.');
  });

  it('a new folder with a slash makes the folders on the way', () => {
    const state = gearsWorkspace();
    expect(made(state, planNewFolder(state, '', 'a/b')).after.folders).toEqual(['a/b']);
    expect(made(state, planNewFolder(state, 'parts', 'x/y')).after.folders).toEqual(['parts/x/y']);
  });

  it('refuses a name longer than 100 characters, .pathogen and all, and a file more than 8 folders deep', () => {
    const state = gearsWorkspace();
    const stem = 'g'.repeat(95);
    expect(refusal(planNewFile(state, '', stem, 'program'))).toBe(`"${stem}.pathogen" is longer than 100 characters.`);
    expect(refusal(planRename(state, 'parts/gears.pathogen', stem))).toBe(
      `"${stem}.pathogen" is longer than 100 characters.`,
    );
    expect(refusal(planNewFile(state, '', 'a/b/c/d/e/f/g/h/i/deep', 'library'))).toBe(
      '"a/b/c/d/e/f/g/h/i/deep.pathogen" is more than 8 folders deep.',
    );
  });

  it('Set as main on the main changes nothing', () => {
    const state = gearsWorkspace();
    const same = planSetMain(state, 'main.pathogen');
    expect(same.ok && same.change.steps).toEqual([]);
  });

  it("a copy of a program in a workspace with no programs is shown; a 21st file isn't made", () => {
    const state: WorkspaceState = { files: { 'poster.pathogen': 'module;\n' }, folders: [], entryPoints: [] };
    const turned = { ...state, files: { 'poster.pathogen': emptyBoilerplate } };
    const { change } = made(turned, planDuplicate(turned, 'poster.pathogen'));
    expect(change.show).toBe('poster-2.pathogen');
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) files[`f${i}.pathogen`] = 'module;\n';
    expect(refusal(planDuplicate({ files, folders: [], entryPoints: [] }, 'f0.pathogen'))).toBe(
      'A workspace can hold at most 20 files, and this one has 20.',
    );
  });

  it("deleting a program that isn't the main says only that", () => {
    const state = gearsWorkspace();
    const { change } = made(state, planDelete(state, 'try-sizes.pathogen'));
    expect(change.message).toBe('Deleted try-sizes.pathogen.');
  });
});
