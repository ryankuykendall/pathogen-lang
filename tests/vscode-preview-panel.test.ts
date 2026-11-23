/**
 * 2f: the preview panel's VS Code glue (packages/vscode-pathogen/src/preview.ts)
 * against a stand-in for VS Code (tests/fakes/vscode.ts): what it shows as you
 * switch tabs, press its button, edit, rename and delete, what it posts to the
 * page, and what it does with what the page asks (docs/projects.md "The
 * preview in VS Code"). Real folders (a copy of the mockup's gears-project);
 * the library is the extension's bundled copy, as the panel loads it, so this
 * needs `npm run build:vscode` (or, running from source, `npm run build`).
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { openPreview } from '../packages/vscode-pathogen/src/preview';
import { document, fake, Uri } from './fakes/vscode';

import type { FakeDocument, FakePanel } from './fakes/vscode';

const EXT = join(__dirname, '..', 'packages', 'vscode-pathogen');
const FIXTURE = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const TMP = join(__dirname, 'tmp');
let base = '';
let root = '';
let count = 0;

const context = { extensionPath: EXT, extensionUri: Uri.file(EXT) } as never;
const at = (p: string): string => join(root, ...p.split('/'));
const read = (p: string): string => readFileSync(at(p), 'utf8');

async function until<T>(what: string, check: () => T | undefined | false, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Open `p` in a tab and make it the active editor. */
function tab(p: string, text = read(p)): FakeDocument {
  let doc = fake.documents.find((d) => d.uri.fsPath === at(p));
  if (!doc) {
    doc = document(at(p), text);
    fake.documents.push(doc);
  }
  fake.activeTextEditor = { document: doc, viewColumn: 1 };
  return doc;
}

/** Switch to `p`'s tab (VS Code's event). */
function switchTo(p: string): FakeDocument {
  const doc = tab(p);
  fake.activeChanged.fire(fake.activeTextEditor);
  return doc;
}

const lastUpdate = (panel: FakePanel) =>
  panel.of('update').at(-1) as
    { source: string; errors: string[]; modules?: { files: [string, { source: string }][] } } | undefined;
const lastPrograms = (panel: FakePanel) =>
  panel.of('programs').at(-1) as
    | {
        items: { path: string; note?: string | null; error: string | null }[];
        shown: string | null;
        editing: string | null;
      }
    | undefined;

let panel: FakePanel;

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  base = mkdtempSync(join(TMP, 'preview-panel-'));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

beforeEach(() => {
  fake.reset();
  root = join(base, `p${++count}`, 'gears-project');
  cpSync(FIXTURE, root, { recursive: true });
  // The drawing thread's script is compiled to out/, not beside the sources: here its draws fail, quietly.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  panel?.dispose();
  vi.restoreAllMocks();
});

async function open(p: string): Promise<FakePanel> {
  tab(p);
  openPreview(context);
  panel = fake.panels.at(-1)!;
  panel.received.fire({ type: 'ready' });
  return panel;
}

describe('the preview panel in a project with a main', () => {
  it("opened from the main's tab: titled for it, its update, and the program list", async () => {
    const p = await open('main.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    expect(p.title).toBe('Preview main.pathogen');
    const list = await until('the list', () => lastPrograms(p));
    expect(list.items.map((i) => i.path)).toEqual(['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen']);
    expect([list.shown, list.editing]).toEqual(['main.pathogen', 'main.pathogen']);
  });

  it("switching to a module's tab keeps the program; an edit to the module redraws it with the unsaved text", async () => {
    const p = await open('main.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    const updates = p.of('update').length;
    const gears = switchTo('parts/gears.pathogen');
    await until('the list', () => lastPrograms(p)?.editing === 'parts/gears.pathogen');
    expect(p.title).toBe('Preview main.pathogen');
    expect(p.of('update').length).toBe(updates);
    gears.text = gears.text.replace('toothDepth = 6', 'toothDepth = 10');
    fake.textChanged.fire({ document: gears });
    const update = await until('the redraw', () => {
      const u = lastUpdate(p);
      const sent = u?.modules?.files.find(([path]) => path === '/parts/gears.pathogen');
      return sent?.[1].source.includes('toothDepth = 10') ? u : undefined;
    });
    expect(update.source).toBe(read('main.pathogen'));
  });

  it("a demo's preview button shows it and makes it the choice; the main's tab then leaves it there", async () => {
    const p = await open('main.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    tab('demos/train.pathogen');
    openPreview(context);
    await until('train', () => lastUpdate(p)?.source === read('demos/train.pathogen'));
    expect(p.title).toBe('Preview train.pathogen');
    switchTo('main.pathogen');
    await until('the list', () => lastPrograms(p)?.editing === 'main.pathogen');
    expect([p.title, lastPrograms(p)?.shown]).toEqual(['Preview train.pathogen', 'demos/train.pathogen']);
  });

  it('a program the page chooses is shown; a path not in the list is ignored; Open in the editor opens its tab', async () => {
    const p = await open('main.pathogen');
    // (Before the project is read, the list is empty: the page can't ask for anything yet.)
    await until('the list', () => (lastPrograms(p)?.items.length ?? 0) > 0);
    p.received.fire({ type: 'showProgram', path: 'try-sizes.pathogen' });
    await until('try-sizes', () => lastUpdate(p)?.source === read('try-sizes.pathogen'));
    expect(p.title).toBe('Preview try-sizes.pathogen');
    const updates = p.of('update').length;
    p.received.fire({ type: 'showProgram', path: '../outside.pathogen' });
    p.received.fire({ type: 'openFile', path: 'parts/gears.pathogen' });
    await new Promise((r) => setTimeout(r, 100));
    expect(p.of('update').length).toBe(updates);
    expect(fake.opened).toEqual([]);
    p.received.fire({ type: 'openFile', path: 'demos/train.pathogen' });
    await until('the tab', () => fake.opened.length > 0);
    expect(fake.opened[0].uri.fsPath).toBe(at('demos/train.pathogen'));
    expect(fake.opened[0].options).toMatchObject({ viewColumn: 1 });
  });

  it('a program not in pathogen.json: in the list while you edit it, said so; its button chooses it; it stays while shown', async () => {
    const p = await open('main.pathogen');
    await until('the list', () => lastPrograms(p));
    switchTo('sketch.pathogen');
    const list = await until('sketch listed', () => {
      const l = lastPrograms(p);
      return l?.items.some((i) => i.path === 'sketch.pathogen') ? l : undefined;
    });
    expect(list.items.at(-1)).toMatchObject({ path: 'sketch.pathogen', note: 'not in pathogen.json' });
    expect(list.shown).toBe('main.pathogen');
    openPreview(context);
    await until('sketch', () => lastUpdate(p)?.source === read('sketch.pathogen'));
    switchTo('main.pathogen');
    await until('the list', () => lastPrograms(p)?.editing === 'main.pathogen');
    expect(lastPrograms(p)?.items.at(-1)?.path).toBe('sketch.pathogen');
  });

  it('renamed in VS Code, the program shown follows; deleted outside it, back to the main', async () => {
    const p = await open('demos/train.pathogen');
    await until('train', () => lastUpdate(p)?.source === read('demos/train.pathogen'));
    switchTo('main.pathogen');
    renameSync(at('demos/train.pathogen'), at('demos/locomotive.pathogen'));
    fake.renamed.fire({
      files: [{ oldUri: Uri.file(at('demos/train.pathogen')), newUri: Uri.file(at('demos/locomotive.pathogen')) }],
    });
    await until('the new title', () => p.title === 'Preview locomotive.pathogen');
    rmSync(at('demos/locomotive.pathogen'));
    for (const w of fake.watchers) w.deleted.fire(Uri.file(at('demos/locomotive.pathogen')));
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    expect(p.title).toBe('Preview main.pathogen');
  });

  it("pathogen.json names a main that doesn't exist: the CLI's message, titled for it, the other programs offered", async () => {
    const p = await open('parts/gears.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    writeFileSync(at('pathogen.json'), '{ "entryPoints": ["poster.pathogen", "main.pathogen"] }');
    for (const w of fake.watchers) w.changed.fire(Uri.file(at('pathogen.json')));
    const update = await until('the message', () => {
      const u = lastUpdate(p);
      return u?.errors.length ? u : undefined;
    });
    expect(update.errors[0]).toMatch(/^The main of gears-project, poster\.pathogen, doesn't exist/);
    expect(p.title).toBe('Preview poster.pathogen');
    const list = await until(
      'the list',
      () => lastPrograms(p)?.items[0]?.path === 'poster.pathogen' && lastPrograms(p),
    );
    expect(list.items[0]).toMatchObject({ error: 'Not found' });
    expect(list.shown).toBe('poster.pathogen');
  });

  it("opened from a module's tab, the page's first update is the main, never the module", async () => {
    const p = await open('parts/gears.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    expect((p.of('update')[0] as { source: string }).source).toBe(read('main.pathogen'));
  });

  it('a press on a tab you leave at once still chooses that tab’s program', async () => {
    const p = await open('main.pathogen');
    await until('the main', () => lastUpdate(p)?.source === read('main.pathogen'));
    tab('demos/train.pathogen');
    openPreview(context);
    switchTo('main.pathogen');
    await until('train', () => p.title === 'Preview train.pathogen');
    await new Promise((r) => setTimeout(r, 100));
    expect([p.title, lastPrograms(p)?.shown, lastPrograms(p)?.editing]).toEqual([
      'Preview train.pathogen',
      'demos/train.pathogen',
      'main.pathogen',
    ]);
  });
});

describe('without a main', () => {
  it('the file you edit, as before, with no list; a module is empty with its notice', async () => {
    const lone = join(base, `lone-${count}`);
    mkdirSync(lone, { recursive: true });
    writeFileSync(join(lone, 'a.pathogen'), 'M 0 0 L 10 10\n');
    writeFileSync(join(lone, 'b.pathogen'), 'module;\nexport const x = 1;\n');
    fake.documents.push(document(join(lone, 'a.pathogen'), 'M 0 0 L 10 10\n'));
    fake.activeTextEditor = { document: fake.documents[0], viewColumn: 1 };
    openPreview(context);
    panel = fake.panels.at(-1)!;
    panel.received.fire({ type: 'ready' });
    await until('a', () => lastUpdate(panel)?.source === 'M 0 0 L 10 10\n');
    expect(panel.title).toBe('Preview a.pathogen');
    expect(lastPrograms(panel)?.items).toEqual([]);
    const b = document(join(lone, 'b.pathogen'), 'module;\nexport const x = 1;\n');
    fake.documents.push(b);
    fake.activeTextEditor = { document: b, viewColumn: 1 };
    fake.activeChanged.fire(fake.activeTextEditor);
    const update = await until('b', () =>
      lastUpdate(panel)?.source.startsWith('module;') ? lastUpdate(panel) : undefined,
    );
    expect((update as unknown as { notices: string[] }).notices[0]).toMatch(/^This file is a module/);
    expect(panel.title).toBe('Preview b.pathogen');
  });

  it('closing the panel removes every listener it registered', async () => {
    const p = await open('main.pathogen');
    await until('the list', () => lastPrograms(p));
    p.dispose();
    expect([fake.activeChanged.listeners.size, fake.textChanged.listeners.size, fake.renamed.listeners.size]).toEqual([
      0, 0, 0,
    ]);
    expect(fake.watchers.every((w) => w.disposed)).toBe(true);
  });
});
