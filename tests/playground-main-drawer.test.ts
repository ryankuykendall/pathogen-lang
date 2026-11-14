// @vitest-environment jsdom
//
// The workspace's layout below 800 px (2d, step 9b; mockup v7 screen M, state
// 2; docs/workspace-files.md "On a phone"): the file tree is a drawer, and
// playground-main owns how it closes:
// - a tap on the dimmed screen closes it;
// - Esc closes it wherever the keyboard is, unless something else used the
//   Esc first (a menu, a name field, the docs);
// - narrowing the window with the tree open closes it, rather than open the
//   drawer over the editor;
// - on a wide screen, none of it.
// Its listeners go when it leaves the page.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let narrow = false;
let changeListeners: (() => void)[] = [];
function setNarrow(next: boolean): void {
  narrow = next;
  for (const listener of [...changeListeners]) listener();
}

describe('the drawer’s container (step 9b)', () => {
  beforeAll(async () => {
    window.matchMedia = ((query: string) => ({
      get matches() {
        return query === '(max-width: 800px)' && narrow;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => changeListeners.push(listener),
      removeEventListener: (_type: string, listener: () => void) => {
        changeListeners = changeListeners.filter((l) => l !== listener);
      },
    })) as unknown as typeof window.matchMedia;
    await import('../playground/components/playground-main.js');
  });

  let main: HTMLElement;
  let store: { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

  beforeEach(async () => {
    ({ store } = (await import('../playground/state/store.ts')) as unknown as { store: typeof store });
    narrow = false;
    document.body.innerHTML = '';
    main = document.createElement('playground-main');
    document.body.appendChild(main);
    store.set('filesOpen', true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    store.set('filesOpen', true);
  });

  const escape = (target: EventTarget = document.body): KeyboardEvent => {
    const event = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('follows the store: open gives it .files-open, and a tap on the dimming closes it', () => {
    setNarrow(true);
    store.set('filesOpen', true);
    expect(main.classList.contains('files-open')).toBe(true);
    main.shadowRoot!.querySelector<HTMLElement>('.drawer-scrim')!.click();
    expect([store.get('filesOpen'), main.classList.contains('files-open')]).toEqual([false, false]);
  });

  it('narrow: Esc closes it from anywhere; an Esc already used leaves it open', () => {
    setNarrow(true);
    store.set('filesOpen', true);
    const used = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    used.preventDefault();
    document.body.dispatchEvent(used);
    expect(store.get('filesOpen')).toBe(true);
    expect(escape().defaultPrevented).toBe(true);
    expect(store.get('filesOpen')).toBe(false);
  });

  it('wide: Esc leaves the tree alone', () => {
    store.set('filesOpen', true);
    expect(escape().defaultPrevented).toBe(false);
    expect(store.get('filesOpen')).toBe(true);
  });

  it('narrowing the window with the tree open closes it', () => {
    store.set('filesOpen', true);
    setNarrow(true);
    expect(store.get('filesOpen')).toBe(false);
  });

  it('gone from the page, it hears nothing', () => {
    main.remove();
    setNarrow(true);
    store.set('filesOpen', true);
    escape();
    expect([store.get('filesOpen'), changeListeners.length]).toEqual([true, 0]);
  });
});
