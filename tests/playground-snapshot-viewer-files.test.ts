// @vitest-environment jsdom
//
// The snapshots page (2e, step 3c; note 59, mockups v13 and v14):
// - its code panel gets every file, each a program or a module as the engine
//   reads it, pathogen.json last when there are several, opening on the program
//   that drew the image; Export's legend lists that same file;
// - one file shows the code alone, as snapshots made before 2e do;
// - its breadcrumb has no Copy code (the panel's icon copies), and Start new
//   workspace says it copies the files;
// - ← and → step between snapshots, but not from the code panel's list.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { snapshotViewerFiles } from '../playground/utils/snapshot-viewer-files.ts';
import { isModuleSource, workspaceProjectFileText } from '../src';

import type { SnapshotFiles } from '../playground/services/api.ts';

const ENGINE = { isModuleSource, workspaceProjectFileText };

const MAIN =
  'import { gear } from "./parts/gears.pathogen";\ndefine ViewBox(0, 0, 200, 100);\ngear(Point(55, 50), 40);\n';
const GEARS = 'module;\n\nexport fn gear(at, r) {\n  circle(at.x, at.y, r);\n}\n';
const DEMO =
  'import { gear } from "../parts/gears.pathogen";\ndefine ViewBox(0, 0, 300, 110);\ngear(Point(50, 50), 34);\n';

function filesOf(texts: Record<string, string>, more: Partial<SnapshotFiles> = {}): SnapshotFiles {
  return {
    files: Object.fromEntries(
      Object.entries(texts).map(([path, text]) => [path, { sha256: 'x', size: text.length, text }]),
    ),
    folders: [],
    entryPoints: ['main.pathogen'],
    contentHash: 'h',
    program: 'main.pathogen',
    ...more,
  };
}

const SEVERAL = { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS, 'demos/gears.pathogen': DEMO };

describe('the code panel’s files', () => {
  it('every file, with its kind as the engine reads it, and pathogen.json last as the tree writes it', () => {
    const { viewer, drawing } = snapshotViewerFiles(
      filesOf(SEVERAL, { folders: ['spare'], entryPoints: ['main.pathogen', 'demos/gears.pathogen'] }),
      ENGINE,
    );
    expect(viewer.files.map((f) => [f.path, f.kind])).toEqual([
      ['main.pathogen', 'program'],
      ['parts/gears.pathogen', 'library'],
      ['demos/gears.pathogen', 'program'],
      ['pathogen.json', 'project'],
    ]);
    expect(viewer.files[3].text).toBe(workspaceProjectFileText(['main.pathogen', 'demos/gears.pathogen']));
    expect([viewer.folders, viewer.main, viewer.open, drawing]).toEqual([
      ['spare'],
      'main.pathogen',
      'main.pathogen',
      { path: 'main.pathogen', text: MAIN },
    ]);
  });

  it('a snapshot drawn by another program opens on it, and Export’s legend lists it (answer A)', () => {
    const { viewer, drawing } = snapshotViewerFiles(
      filesOf(SEVERAL, { entryPoints: ['main.pathogen', 'demos/gears.pathogen'], program: 'demos/gears.pathogen' }),
      ENGINE,
    );
    expect([viewer.main, viewer.open, drawing]).toEqual([
      'main.pathogen',
      'demos/gears.pathogen',
      { path: 'demos/gears.pathogen', text: DEMO },
    ]);
  });

  it('one file shows the code alone, as a snapshot made before 2e: no pathogen.json', () => {
    const { viewer, drawing } = snapshotViewerFiles(filesOf({ 'main.pathogen': MAIN }), ENGINE);
    expect([viewer.files.map((f) => f.path), viewer.open, drawing.text]).toEqual([
      ['main.pathogen'],
      'main.pathogen',
      MAIN,
    ]);
  });

  it('a snapshot that answers with its one text alone shows it as main.pathogen', () => {
    const { viewer, drawing } = snapshotViewerFiles(
      filesOf({}, { entryPoints: [], program: null, code: MAIN }),
      ENGINE,
    );
    expect([viewer.files, drawing]).toEqual([
      [{ path: 'main.pathogen', text: MAIN, kind: 'program' }],
      { path: 'main.pathogen', text: MAIN },
    ]);
  });

  it('with no program and no main, the panel and the legend agree on the first program', () => {
    const { viewer, drawing } = snapshotViewerFiles(
      filesOf({ 'parts/gears.pathogen': GEARS, 'demos/gears.pathogen': DEMO }, { entryPoints: [], program: null }),
      ENGINE,
    );
    expect([viewer.main, viewer.open, drawing.text]).toEqual([null, 'demos/gears.pathogen', DEMO]);
  });

  it('an engine that fails on a file still shows every file, without pathogen.json, open on the program', () => {
    const failing = {
      isModuleSource: (): boolean => {
        throw new Error('parse');
      },
      workspaceProjectFileText: (): string => {
        throw new Error('write');
      },
    };
    const { viewer, drawing } = snapshotViewerFiles(filesOf(SEVERAL), failing);
    expect([viewer.files.map((f) => f.path), drawing.path]).toEqual([
      ['main.pathogen', 'parts/gears.pathogen', 'demos/gears.pathogen'],
      'main.pathogen',
    ]);
  });

  it('an answer without its lists reads as none', () => {
    const answer = { ...filesOf(SEVERAL), entryPoints: undefined, folders: undefined } as unknown as SnapshotFiles;
    const { viewer } = snapshotViewerFiles(answer, ENGINE);
    expect([viewer.main, viewer.folders, viewer.open]).toEqual([null, [], 'main.pathogen']);
  });

  it('without the engine (not loaded yet), every file is a program and there is no pathogen.json', () => {
    const { viewer } = snapshotViewerFiles(filesOf(SEVERAL), null);
    expect(viewer.files.map((f) => f.kind)).toEqual(['program', 'program', 'program']);
  });

  it('a file the server couldn’t read is named in the page’s error, never shown empty (2e step 5d)', () => {
    const answer = filesOf(SEVERAL);
    answer.files['parts/gears.pathogen'] = { sha256: 'g', size: GEARS.length, unreadable: true };
    expect(() => snapshotViewerFiles(answer, ENGINE)).toThrow("parts/gears.pathogen couldn't be read.");
  });
});

describe('the page', () => {
  beforeAll(() => {
    // The breadcrumb and the page pull in services/api.ts, which reads a build-time define.
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', snapshotsPage: null });
    document.body.innerHTML = '';
  });

  it('the breadcrumb: Start new workspace (“this snapshot’s files”) and Export…, no Copy code', async () => {
    const { store } = await import('../playground/state/store.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({
      currentView: 'workspace-snapshots',
      snapshotsPage: { workspaceName: 'Gears', workspaceSlugId: 'gears--ws-1', currentName: 'Gears #4' },
    });
    const el = document.createElement('app-breadcrumb');
    document.body.appendChild(el);
    const actions = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-snapshot-action]')];
    expect(actions.map((b) => [b.dataset.snapshotAction, b.title])).toEqual([
      ['start-workspace', "Create a new workspace with this snapshot's files"],
      ['export', 'Export this snapshot as SVG, PNG, or PDF'],
    ]);
    expect(el.shadowRoot!.querySelector('.controls-left .copy-feedback')).toBeNull();
  });

  it('← and → belong to the code panel’s list and to fields, not to stepping between snapshots', async () => {
    const { ownsArrowKeys } = await import('../playground/components/views/workspace-snapshots-view.ts');
    await import('../playground/components/shared/source-files.ts');
    const seen: boolean[] = [];
    const listen = (e: KeyboardEvent): void => {
      seen.push(ownsArrowKeys(e));
    };
    document.addEventListener('keydown', listen);
    const viewer = document.createElement('source-files') as HTMLElement & { files: unknown[] };
    viewer.files = [
      { path: 'main.pathogen', text: MAIN, kind: 'program' },
      { path: 'demos/gears.pathogen', text: DEMO, kind: 'program' },
    ];
    const input = document.createElement('input');
    const plain = document.createElement('button');
    document.body.append(viewer, input, plain);
    const key = (target: Element): void => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    };
    key(viewer.shadowRoot!.querySelector('[data-path="demos/gears.pathogen"]')!);
    key(input);
    key(plain);
    document.removeEventListener('keydown', listen);
    expect(seen).toEqual([true, true, false]);
  });
});
