// @vitest-environment jsdom
//
// Phase 2g: "Or import a project" on the New Workspace page
// (docs/workspace-files.md "A workspace from a project"; mockups-2g-project
// and -v2; note 70). In blank mode the section offers Choose folder…, Choose
// .zip… and a drop area; a pick lists what comes in, fills the name, and
// Create Workspace sends the files, empty folders and program list. A
// pathogen.json that can't be read turns Create off and shows the CLI's
// message. A drop that misses the drop area is stopped. Copying a workspace,
// or opening code from a link, doesn't offer the import.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeZip } from '../playground/services/zip.js';

const { getSpy, copySpy, createSpy, navSpy, flushSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  copySpy: vi.fn(),
  createSpy: vi.fn(),
  navSpy: vi.fn(),
  flushSpy: vi.fn(async () => undefined),
}));
vi.mock('../playground/services/api.js', () => ({
  workspaceApi: { get: getSpy, copy: copySpy, create: createSpy },
}));
vi.mock('../playground/services/autosave.js', () => ({ autosave: { awaitPendingFlush: flushSpy } }));
vi.mock('../playground/utils/router.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  navigateTo: navSpy,
}));

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const SKETCH = 'circle(10, 10, 4);\n';
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A .zip as Download workspace makes it: one folder, pathogen.json, the files, an empty folder. */
function gearsZip(projectFile = '{\n  "entryPoints": ["main.pathogen"]\n}\n'): File {
  const bytes = writeZip([
    { path: 'Gear-studies/' },
    { path: 'Gear-studies/pathogen.json', bytes: encode(projectFile) },
    { path: 'Gear-studies/main.pathogen', bytes: encode(MAIN) },
    { path: 'Gear-studies/parts/' },
    { path: 'Gear-studies/parts/gears.pathogen', bytes: encode(GEARS) },
    { path: 'Gear-studies/sketch.pathogen', bytes: encode(SKETCH) },
    { path: 'Gear-studies/drafts/' },
    { path: 'Gear-studies/notes.txt', bytes: encode('to do') },
  ]);
  return new File([bytes], 'Gear-studies.zip', { type: 'application/zip' });
}

async function mount(query: Record<string, string> = {}): Promise<ShadowRoot> {
  const { store } = await import('../playground/state/store.ts');
  await import('../playground/components/views/new-workspace-view.ts');
  store.update({ currentView: 'new-workspace', routeQuery: query });
  const el = document.createElement('new-workspace-view');
  document.body.appendChild(el);
  const root = el.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('form')).not.toBeNull());
  return root;
}

/** Choose .zip…: the picker gives the file, as the browser's would. */
async function chooseZip(root: ShadowRoot, file: File): Promise<void> {
  const input = root.querySelector<HTMLInputElement>('.pick-zip')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('.project-head .what')?.textContent).not.toBe('Reading…'));
}

async function submit(root: ShadowRoot): Promise<void> {
  const view = root.host as unknown as { _isSubmitting: boolean };
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(view._isSubmitting).toBe(false));
}

function type(root: ShadowRoot, name: string, value: string): void {
  const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** A row of the card: its path, then its badge, kind, note or "new", each apart. */
const row = (li: Element): string => [...li.querySelectorAll('code, .badge-main, .kind, .new, .note')].map(text).join(' ');

describe('Or import a project (2g)', () => {
  beforeAll(async () => {
    (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
    (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
  });

  beforeEach(() => {
    for (const spy of [getSpy, copySpy, createSpy, navSpy, flushSpy]) spy.mockClear();
  });

  afterEach(async () => {
    const { store } = await import('../playground/state/store.ts');
    store.update({ currentView: 'landing', routeQuery: {} });
    document.body.innerHTML = '';
  });

  it('the blank page offers it under Starting Template: the two pickers and the drop area', async () => {
    const root = await mount();
    const section = root.querySelector('.import-section')!;
    expect(text(section.querySelector('h2'))).toBe('Or import a project');
    expect(text(section.querySelector('.import-lead'))).toBe(
      'A project folder from the CLI or VS Code, or a .zip made by Download workspace. Its files, folders and program list come in as they are.',
    );
    expect([...section.querySelectorAll('.drop-buttons button')].map(text)).toEqual(['Choose folder…', 'Choose .zip…']);
    expect(text(section.querySelector('.drop-zone .hint'))).toBe('or drop a folder or a .zip here');
    expect(section.querySelector<HTMLInputElement>('.pick-folder')!.hasAttribute('webkitdirectory')).toBe(true);
    expect(root.querySelector('[name="template"]')).not.toBeNull();
  });

  it('copying a workspace, or opening code from a link, does not offer it', async () => {
    getSpy.mockResolvedValue({ name: 'Gears' });
    const copying = await mount({ copyFrom: 'w1' });
    await vi.waitFor(() => expect(copying.querySelector('h1')!.textContent).toBe('Copy Workspace'));
    expect(copying.querySelector('.import-section')).toBeNull();
    document.body.innerHTML = '';
    const state = btoa(encodeURIComponent(JSON.stringify({ code: 'M 0 0;', title: 'From a link' })));
    const linked = await mount({ state });
    expect(linked.querySelector('.import-section')).toBeNull();
  });

  it('a picked .zip lists what comes in, fills the name, and Create Workspace sends it', async () => {
    createSpy.mockResolvedValue({ id: 'n1', slug: 'gear-studies' });
    const root = await mount();
    await chooseZip(root, gearsZip());
    expect(text(root.querySelector('.subtitle'))).toBe('Create a workspace from a project');
    expect(root.querySelector('[name="template"]')).toBeNull();
    expect(text(root.querySelector('.import-section h2'))).toBe('Import a project');
    expect(text(root.querySelector('.project-head b'))).toBe('Gear-studies.zip');
    expect(text(root.querySelector('.project-head .what'))).toBe('3 files in 2 folders');
    expect([...root.querySelectorAll('.project-files li')].map(row)).toEqual([
      'main.pathogen main',
      'sketch.pathogen Not in pathogen.json’s list: it joins the end.',
      'parts/gears.pathogen module',
    ]);
    expect(text(root.querySelector('.project-foot'))).toBe(
      'The main and the program list come from its pathogen.json. Imports between its files work as they did in the folder.',
    );
    expect(text(root.querySelector('.left-out .head'))).toBe('Not added:');
    expect([...root.querySelectorAll('.left-out li')].map(text)).toEqual([
      'notes.txt: workspaces hold .pathogen files for now; data files come later.',
    ]);
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Gear-studies');
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(false);

    type(root, 'description', 'From the CLI');
    await submit(root);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toEqual({
      name: 'Gear-studies',
      description: 'From the CLI',
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'sketch.pathogen': { text: SKETCH },
      },
      folders: ['drafts'],
      entryPoints: ['main.pathogen', 'sketch.pathogen'],
      isPublic: false,
      preferences: expect.any(Object),
    });
    expect(navSpy).toHaveBeenCalledWith('/workspace/:slugId', { params: { slugId: 'gear-studies--n1' } });
  });

  it('without a pathogen.json, the card shows the one the workspace writes', async () => {
    const root = await mount();
    const bytes = writeZip([
      { path: 'gears/main.pathogen', bytes: encode(MAIN) },
      { path: 'gears/sketch.pathogen', bytes: encode(SKETCH) },
      { path: 'gears/parts/gears.pathogen', bytes: encode(GEARS) },
    ]);
    await chooseZip(root, new File([bytes], 'gears.zip'));
    expect(row(root.querySelector('.project-files li.json')!)).toBe('pathogen.json new');
    expect(text(root.querySelector('.project-foot'))).toBe(
      'This .zip has no pathogen.json, so the workspace writes one. main.pathogen is the main, and the other programs follow in order of their paths: { "entryPoints": [ "main.pathogen", "sketch.pathogen" ] } Use Set as main in the workspace to choose another main.',
    );
    expect(root.querySelector('.project-foot pre')!.textContent).toBe(
      '{\n  "entryPoints": [\n    "main.pathogen",\n    "sketch.pathogen"\n  ]\n}',
    );
  });

  it("a pathogen.json that can't be read turns Create off and shows the CLI's message", async () => {
    const root = await mount();
    await chooseZip(root, gearsZip('{ "main": "main.pathogen" }\n'));
    const refused = root.querySelector('.refused')!;
    expect(text(refused.querySelector('p'))).toBe(
      'This project’s pathogen.json can’t be read, so nothing was added. Fix the file, then choose the .zip again:',
    );
    expect(text(refused.querySelector('.said'))).toBe(
      'pathogen.json (Gear-studies.zip): "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["main.pathogen"].',
    );
    expect(root.querySelector('.project-files')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(true);
    await submit(root);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('Choose another… goes back to the pickers, and takes the filled-in name with it; a typed name stays', async () => {
    const root = await mount();
    await chooseZip(root, gearsZip());
    root.querySelector<HTMLButtonElement>('[data-project="again"]')!.click();
    expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project');
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('');
    type(root, 'name', 'My gears');
    await chooseZip(root, gearsZip());
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('My gears');
  });

  it('a quote in the .zip’s name stays in the name field, and adds nothing to the page', async () => {
    const root = await mount();
    await chooseZip(root, new File([gearsZip()], 'x" autofocus onfocus="alert(1)" y=".zip'));
    const input = root.querySelector<HTMLInputElement>('[name="name"]')!;
    expect(input.value).toBe('x" autofocus onfocus="alert(1)" y="');
    expect(input.hasAttribute('onfocus')).toBe(false);
    expect(input.getAttributeNames().sort()).toEqual(['autofocus', 'class', 'id', 'name', 'placeholder', 'type', 'value']);
  });

  it('a quote in a link’s title stays in the name field, and adds nothing to the page', async () => {
    // /workspace/new?state=… is a link anyone can send: its title fills the name.
    const title = 'x" autofocus onfocus="alert(1)" y="';
    const state = btoa(encodeURIComponent(JSON.stringify({ code: 'M 0 0;', title })));
    const root = await mount({ state });
    const input = root.querySelector<HTMLInputElement>('[name="name"]')!;
    expect(input.value).toBe(title);
    expect(input.hasAttribute('onfocus')).toBe(false);
  });

  it('a project picked before is never used once the page opens code from a link', async () => {
    createSpy.mockResolvedValue({ id: 'n2', slug: 'from-a-link' });
    const { store } = await import('../playground/state/store.ts');
    const root = await mount();
    await chooseZip(root, gearsZip());
    const state = btoa(encodeURIComponent(JSON.stringify({ code: 'M 0 0;', title: 'From a link' })));
    store.update({ routeQuery: { state } });
    await vi.waitFor(() => expect(text(root.querySelector('.subtitle'))).toBe('Create a workspace from imported code'));
    expect(root.querySelector('.import-section')).toBeNull();
    await submit(root);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toMatchObject({ code: 'M 0 0;' });
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty('files');
  });

  /** A .zip whose reads wait until `release()`. */
  function slowZip(name: string): { file: File; release: () => void } {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = new File([gearsZip()], name);
    const realSlice = slow.slice.bind(slow);
    slow.slice = ((start?: number, end?: number) => {
      const part = realSlice(start, end);
      const bytes = new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(part);
      });
      return Object.assign(part, { arrayBuffer: async () => gate.then(async () => bytes) });
    }) as typeof slow.slice;
    return { file: slow, release };
  }

  function startPick(root: ShadowRoot, file: File): void {
    const input = root.querySelector<HTMLInputElement>('.pick-zip')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('while a pick is read, the card says so and Create is off; then the card lists it', async () => {
    const root = await mount();
    const { file, release } = slowZip('slow.zip');
    startPick(root, file);
    await vi.waitFor(() => expect(text(root.querySelector('.project-head .what'))).toBe('Reading…'));
    expect(text(root.querySelector('.project-head b'))).toBe('slow.zip');
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(true);
    await submit(root);
    expect(createSpy).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(text(root.querySelector('.project-head .what'))).toBe('3 files in 2 folders'));
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(false);
  });

  it('Choose another… while a pick is read drops the read, and the page is back to its pickers', async () => {
    const root = await mount();
    const { file, release } = slowZip('slow.zip');
    startPick(root, file);
    await vi.waitFor(() => expect(text(root.querySelector('.project-head .what'))).toBe('Reading…'));
    root.querySelector<HTMLButtonElement>('[data-project="again"]')!.click();
    expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project');
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project');
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('');
  });

  it('the page taken out mid-read and added back starts blank', async () => {
    const root = await mount();
    const el = root.host;
    const { file, release } = slowZip('slow.zip');
    startPick(root, file);
    await vi.waitFor(() => expect(text(root.querySelector('.project-head .what'))).toBe('Reading…'));
    el.remove();
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    document.body.appendChild(el);
    await vi.waitFor(() => expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project'));
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(false);
  });

  it('a read that ends after the page was left changes nothing: back on the page, it starts blank', async () => {
    const { store } = await import('../playground/state/store.ts');
    const root = await mount();
    const { file, release } = slowZip('slow.zip');
    startPick(root, file);
    await vi.waitFor(() => expect(text(root.querySelector('.project-head .what'))).toBe('Reading…'));
    store.update({ currentView: 'landing', routeQuery: {} });
    store.update({ currentView: 'new-workspace', routeQuery: {} });
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project');
    expect(root.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('');
  });

  it("a file that isn't a .zip says so, and leaves the pickers", async () => {
    const root = await mount();
    const input = root.querySelector<HTMLInputElement>('.pick-zip')!;
    Object.defineProperty(input, 'files', { value: [new File(['not a zip'], 'gears.zip')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(root.querySelector('.refused')).not.toBeNull());
    expect(text(root.querySelector('.refused'))).toBe('This .zip can’t be read, so nothing was added: it isn\'t a .zip file.');
    expect(text(root.querySelector('.import-section h2'))).toBe('Or import a project');
    expect(root.querySelector<HTMLButtonElement>('.primary-btn')!.disabled).toBe(false);
  });

  it('a file dropped outside the drop area is stopped; Cancel is still the actions’ own', async () => {
    const root = await mount();
    const dragged = (type: string): DragEvent => {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], dropEffect: 'copy' } });
      return event;
    };
    const stray = dragged('drop');
    root.querySelector('h1')!.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(true);
    // Text dragged within the page isn't a file: left alone.
    const words = new Event('drop', { bubbles: true, cancelable: true, composed: true }) as DragEvent;
    Object.defineProperty(words, 'dataTransfer', { value: { types: ['text/plain'] } });
    root.querySelector('h1')!.dispatchEvent(words);
    expect(words.defaultPrevented).toBe(false);
    // Over the drop area, it lights up.
    const over = dragged('dragover');
    root.querySelector('.drop-zone')!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(root.querySelector('.drop-zone')!.classList.contains('dragging')).toBe(true);
    root.querySelector<HTMLButtonElement>('.actions .secondary-btn')!.click();
    expect(navSpy).toHaveBeenCalledWith('/workspaces');
  });
});
