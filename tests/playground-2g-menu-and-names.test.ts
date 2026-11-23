// @vitest-environment jsdom
//
// Phase 2g in the workspace (docs/workspace-files.md "Downloading a
// workspace" and "The preview and the program list"; mockups-2g-project-v2;
// note 70):
// - Download workspace sits under Copy Workspace, for the owner only, not in
//   a scratch buffer, and stays on with no program; it saves a .zip of every
//   file as the editor holds them, and says "Downloaded Gear-studies.zip";
// - with more than one program, Copy SVG's line names the program shown,
//   Export's title names the program that drew, and the Snapshot panel names
//   it too; with one, nothing changes.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { programNamesOf } from '../playground/services/program-list.js';
import { readZip } from '../playground/services/zip.js';

const text = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);

describe('programNamesOf: the names the chip shows', () => {
  it('null with fewer than two programs; else each name, with its folder when two share one', () => {
    expect(programNamesOf(['main.pathogen'], 'main.pathogen')).toBeNull();
    expect(programNamesOf([], 'main.pathogen')).toBeNull();
    expect(programNamesOf(['main.pathogen', 'try-sizes.pathogen'], 'try-sizes.pathogen')).toEqual({
      shown: 'try-sizes',
      byPath: { 'main.pathogen': 'main', 'try-sizes.pathogen': 'try-sizes' },
    });
    expect(programNamesOf(['main.pathogen', 'demos/gears.pathogen', 'parts/gears.pathogen'], 'demos/gears.pathogen')).toEqual({
      shown: 'gears · demos',
      byPath: { 'main.pathogen': 'main', 'demos/gears.pathogen': 'gears · demos', 'parts/gears.pathogen': 'gears · parts' },
    });
  });
});

describe('Export names the program that drew', () => {
  beforeAll(() => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
  });

  it('Export try-sizes, with more than one program; Export with one, or from a snapshot', async () => {
    const { exportTitle } = await import('../playground/components/export-modal.ts');
    const programNames = { shown: 'try-sizes', byPath: { 'main.pathogen': 'main', 'try-sizes.pathogen': 'try-sizes' } };
    expect(exportTitle({ programNames, renderedFiles: { program: 'try-sizes.pathogen' } })).toBe('Export try-sizes');
    // The preview still shows the main's drawing while try-sizes is chosen: the title names what's exported.
    expect(exportTitle({ programNames, renderedFiles: { program: 'main.pathogen' } })).toBe('Export main');
    expect(exportTitle({ programNames, renderedFiles: null })).toBe('Export try-sizes');
    expect(exportTitle({ programNames: null, renderedFiles: { program: 'main.pathogen' } })).toBe('Export');
    expect(exportTitle({})).toBe('Export');
  });
});

describe('the Snapshot panel names the program', () => {
  it('"Of try-sizes, the program shown" under the name, only when given', async () => {
    await import('../playground/components/shared/snapshot-popover.ts');
    const pop = document.createElement('snapshot-popover') as HTMLElement & { setState: (s: unknown) => void };
    document.body.appendChild(pop);
    pop.setState({ kind: 'naming', thumbUrl: null, name: 'Gear studies #1', stale: null, program: 'try-sizes' });
    const line = pop.shadowRoot!.querySelector('.program-shown');
    expect(line?.textContent).toBe('Of try-sizes, the program shown');
    expect(line?.querySelector('b')?.textContent).toBe('try-sizes');
    pop.setState({ kind: 'naming', thumbUrl: null, name: 'Gear studies #1', stale: null, program: null });
    expect(pop.shadowRoot!.querySelector('.program-shown')).toBeNull();
    pop.remove();
  });
});

describe('the workspace’s menu (2g)', () => {
  beforeAll(async () => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
    (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({
      currentView: 'landing',
      workspaceFiles: {},
      workspaceFolders: [],
      workspaceEntryPoints: [],
      workspaceId: null,
      workspaceName: '',
      openFile: 'main.pathogen',
      openFiles: ['main.pathogen'],
      code: '',
      currentUser: null,
      workspaceOwnerId: null,
      noPrograms: false,
      programNames: null,
    });
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function mount(workspaceId: string | null = 'ws-1') {
    const { store } = await import('../playground/state/store.ts');
    const users = await import('../playground/services/user-id.ts');
    await import('../playground/components/app-breadcrumb.ts');
    store.update({
      currentView: 'workspace',
      workspaceId,
      workspaceName: 'Gear studies',
      workspaceOwnerId: workspaceId ? users.getUserId() : null,
      workspaceFiles: {
        'main.pathogen': 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n',
        'try-sizes.pathogen': 'circle(10, 10, 4);\n',
        'parts/gears.pathogen': 'module;\nexport fn gear(r) { circle(0, 0, r); }\n',
      },
      workspaceFolders: ['drafts'],
      workspaceEntryPoints: ['main.pathogen', 'try-sizes.pathogen'],
      openFile: 'try-sizes.pathogen',
      openFiles: ['main.pathogen', 'try-sizes.pathogen'],
      // The editor's text for the open file: an edit not saved yet.
      code: 'circle(10, 10, 8);\n',
    });
    const el = document.createElement('app-breadcrumb') as HTMLElement & { handleMenuAction: (a: string) => Promise<void> };
    document.body.appendChild(el);
    const item = (action: string) => el.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    const order = () => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.menu-dropdown [data-action]')].map((b) => b.dataset.action);
    return { store, el, item, order };
  }

  it("Download workspace is the owner's, under Copy Workspace, and stays on with no program", async () => {
    const { store, item, order } = await mount();
    expect(order().slice(order().indexOf('copy-workspace'), order().indexOf('copy-workspace') + 3)).toEqual([
      'copy-workspace',
      'download-workspace',
      'copy-svg',
    ]);
    const download = item('download-workspace')!;
    expect(download.querySelector('span')!.firstChild!.textContent).toBe('Download workspace');
    expect(download.querySelector('small')!.textContent).toBe('A .zip of every file');
    expect(download.querySelector('use')!.getAttribute('href')).toBe('/assets/material-icons-sprite.svg#mi-folder-zip');
    store.update({ noPrograms: true });
    expect(item('download-workspace')!.disabled).toBe(false);
    // Someone else's workspace: no Download workspace, as no Copy Workspace.
    store.update({ workspaceOwnerId: 'someone-else' });
    expect(item('download-workspace')).toBeNull();
  });

  it('a scratch buffer has no Download workspace', async () => {
    const { item } = await mount(null);
    expect(item('download-workspace')).toBeNull();
    expect(item('copy-svg')).not.toBeNull();
  });

  it('downloads Gear-studies.zip: every file as the editor holds it, and says so', async () => {
    const { el } = await mount();
    let saved: Blob | null = null;
    let fileName = '';
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:zip';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      fileName = this.download;
    });
    await el.handleMenuAction('download-workspace');
    expect(fileName).toBe('Gear-studies.zip');
    expect(el.shadowRoot!.querySelector('.overflow-feedback')!.textContent).toBe('Downloaded Gear-studies.zip');
    expect(saved).not.toBeNull();
    const entries = await readZip(saved!);
    expect(entries.map((e) => (e.folder ? `${e.path}/` : e.path))).toEqual([
      'Gear-studies/',
      'Gear-studies/pathogen.json',
      'Gear-studies/drafts/',
      'Gear-studies/main.pathogen',
      'Gear-studies/parts/',
      'Gear-studies/parts/gears.pathogen',
      'Gear-studies/try-sizes.pathogen',
    ]);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    expect(text(await byPath.get('Gear-studies/try-sizes.pathogen')!.read())).toBe('circle(10, 10, 8);\n');
    expect(text(await byPath.get('Gear-studies/pathogen.json')!.read())).toBe(
      '{\n  "entryPoints": [\n    "main.pathogen",\n    "try-sizes.pathogen"\n  ]\n}\n',
    );
  });

  it("Copy SVG's line names the program shown, with more than one program", async () => {
    const { store, item } = await mount();
    expect(item('copy-svg')!.querySelector('small')).toBeNull();
    store.update({ programNames: { shown: 'try-sizes', byPath: { 'main.pathogen': 'main', 'try-sizes.pathogen': 'try-sizes' } } });
    expect(item('copy-svg')!.querySelector('small')!.textContent).toBe('The program shown: try-sizes');
  });
});
