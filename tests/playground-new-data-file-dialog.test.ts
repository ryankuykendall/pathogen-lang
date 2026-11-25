// @vitest-environment jsdom
//
// New data file… (phase 3a step 7b; docs/workspace-files.md "Data files";
// mockups v3 2b to 2d): the name with the extension after it as a dropdown,
// the line under the field, Create off with the reason, Enter and Esc. The
// rules are workspace-edits' own (readDataFileName, planNewDataFile), as
// workspace-view passes them; the browser check is
// project-docs/modules/verify/verify-3a-step7.ts.

import { beforeAll, describe, expect, it } from 'vitest';

import type { NewDataFileAnswer, NewDataFileDialog } from '../playground/components/shared/new-data-file-dialog.js';
import type { WorkspaceState } from '../playground/services/workspace-edits.js';

const loadEngine = async () => import('../src');
const loadEdits = async () => import('../playground/services/workspace-edits.js');
const loadDialogs = async () => import('../playground/components/shared/new-data-file-dialog.js');
let engine: Awaited<ReturnType<typeof loadEngine>>;
let edits: Awaited<ReturnType<typeof loadEdits>>;
let dialogs: Awaited<ReturnType<typeof loadDialogs>>;

beforeAll(async () => {
  engine = await loadEngine();
  (window as unknown as { PathogenLang: unknown }).PathogenLang = engine;
  edits = await loadEdits();
  dialogs = await loadDialogs();
});

const STATE: WorkspaceState = {
  files: { 'main.pathogen': 'M 0 0', 'data/gears.json': '[]' },
  folders: [],
  entryPoints: ['main.pathogen'],
};

/** The dialog, asking for a file in data/ with workspace-edits' rules, as workspace-view asks. */
function open(name = ''): { dialog: NewDataFileDialog; answer: Promise<NewDataFileAnswer | null> } {
  const dialog = document.createElement('new-data-file-dialog');
  document.body.append(dialog);
  const answer = dialog.ask({
    name,
    read: (typed) => edits.dataFileNameParts(typed),
    check: (typed, extension) => {
      const planned = edits.planNewDataFile(STATE, 'data', typed, extension);
      return planned.ok ? { path: planned.change.open! } : { problem: planned.message };
    },
  });
  return { dialog, answer };
}

const $ = <T extends Element = HTMLElement>(dialog: NewDataFileDialog, selector: string): T =>
  dialog.shadowRoot!.querySelector<T>(selector)!;

function type(dialog: NewDataFileDialog, text: string): void {
  const input = $<HTMLInputElement>(dialog, 'input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

const view = (dialog: NewDataFileDialog) => ({
  ext: $(dialog, '.ext-button .ext').textContent,
  hint: $(dialog, '.hint').textContent,
  problem: $(dialog, '.hint').classList.contains('problem'),
  create: !$<HTMLButtonElement>(dialog, '.confirm').disabled,
});

describe('New data file…', () => {
  it('its list holds the engine’s data extensions, each with what it holds', () => {
    expect(dialogs.DATA_FILE_TYPES.map((t) => t.extension)).toEqual([...engine.DATA_EXTENSIONS]);
  });

  it('a name: the line says the file it adds, and Enter creates it', async () => {
    const { dialog, answer } = open();
    expect([$(dialog, 'h2').textContent, view(dialog)]).toEqual([
      'New data file',
      { ext: '.json', hint: '', problem: false, create: false },
    ]);
    type(dialog, 'trips');
    expect(view(dialog)).toEqual({ ext: '.json', hint: 'Adds data/trips.json', problem: false, create: true });
    $(dialog, 'input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(await answer).toEqual({ typed: 'trips', extension: '.json' });
    expect(document.body.contains(dialog)).toBe(false);
  });

  it('typing a data extension chooses it; another is refused, and so is a taken name', () => {
    const { dialog } = open();
    type(dialog, 'trips.geojson');
    expect(view(dialog)).toEqual({ ext: '.geojson', hint: 'Adds data/trips.geojson', problem: false, create: true });
    type(dialog, 'trips.txt');
    expect(view(dialog)).toEqual({
      ext: '.geojson',
      hint: 'A data file ends in .json, .geojson, .topojson or .fold, not .txt. To keep .txt in its name, add one: trips.txt.json.',
      problem: true,
      create: false,
    });
    expect($(dialog, 'input').getAttribute('aria-invalid')).toBe('true');
    type(dialog, 'gears');
    // Back to .json for the taken name: mockup v3 2d.
    $(dialog, '.ext-button').click();
    $(dialog, '[data-extension=".json"]').click();
    expect(view(dialog)).toEqual({ ext: '.json', hint: 'data/ already has gears.json.', problem: true, create: false });
  });

  it('the list: each extension with what it holds, the chosen one checked; choosing one replaces an extension typed', () => {
    const { dialog } = open('trips.fold');
    $(dialog, '.ext-button').click();
    expect($(dialog, '.ext-button').getAttribute('aria-expanded')).toBe('true');
    const options = [...dialog.shadowRoot!.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((o) => [o.textContent, o.getAttribute('aria-selected')])).toEqual([
      ['.jsonJSON: tables, lists and settings', 'false'],
      ['.geojsonGeoJSON: places and shapes on a map', 'false'],
      ['.topojsonTopoJSON: maps with shared borders', 'false'],
      ['.foldFOLD: origami crease patterns', 'true'],
    ]);
    options[0].click();
    expect([$<HTMLInputElement>(dialog, 'input').value, view(dialog).ext, view(dialog).hint]).toEqual([
      'trips',
      '.json',
      'Adds data/trips.json',
    ]);
    expect($(dialog, '.ext-list').hidden).toBe(true);
  });

  it('a click outside the list closes it; Home and End move to the ends', () => {
    const { dialog } = open('trips');
    $(dialog, '.ext-button').click();
    const list = $(dialog, '.ext-list');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(list.getAttribute('aria-activedescendant')).toMatch(/-opt-3$/);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(list.getAttribute('aria-activedescendant')).toMatch(/-opt-0$/);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(list.hidden).toBe(true);
  });

  it('no file whenever the dialog goes without Create: withdrawn, closed by the browser, or taken out', async () => {
    const withdrawn = open('trips');
    withdrawn.dialog.cancel();
    expect(await withdrawn.answer).toBeNull();
    // A second Escape a browser won't let the page hold back closes the <dialog> itself.
    const closed = open('trips');
    $(closed.dialog, 'dialog').dispatchEvent(new Event('close'));
    expect(await closed.answer).toBeNull();
    expect(document.body.contains(closed.dialog)).toBe(false);
    const removed = open('trips');
    $(removed.dialog, '.ext-button').click();
    removed.dialog.remove();
    expect(await removed.answer).toBeNull();
  });

  it('the list’s keyboard: Down and Enter choose; Escape closes the list first, then cancels', async () => {
    const { dialog, answer } = open('trips');
    const list = $(dialog, '.ext-list');
    $(dialog, '.ext-button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(list.hidden).toBe(false);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(view(dialog).ext).toBe('.geojson');
    $(dialog, '.ext-button').click();
    const dialogEl = $(dialog, 'dialog');
    dialogEl.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect([list.hidden, document.body.contains(dialog)]).toEqual([true, true]);
    dialogEl.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await answer).toBeNull();
  });
});
