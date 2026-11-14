// One rule below 800 px (2d, step 9b; mockup v7 screen M; docs/workspace-files.md
// "On a phone"): the tree is a drawer, the program list a sheet, and a menu an
// action sheet. The CSS says `@media (max-width: 800px)`; this is the same query
// for what CSS can't do: a Cancel button, whether the tree starts open, whether
// a row can be dragged. Touch has no hover, and nothing is dragged there either.
//
// jsdom has no matchMedia, so there it reads as a wide screen with a mouse.

export const NARROW_QUERY = '(max-width: 800px)';
export const TOUCH_QUERY = '(hover: none)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Below 800 px: a phone, or a narrow window. */
export const isNarrow = (): boolean => matches(NARROW_QUERY);

/** A screen with no hover: a phone or a tablet. */
export const isTouch = (): boolean => matches(TOUCH_QUERY);

/** Rows are dragged with a mouse on a wide screen only: "Nothing is dragged" on a phone. */
export const canDragRows = (): boolean => !isNarrow() && !isTouch();

/**
 * The drawer was dismissed (its ×, Esc, a tap on the dimming): the keyboard goes back to
 * Files in the breadcrumb, which opened it, rather than to nowhere. Called after the store
 * says it's closed, so the breadcrumb has redrawn the button.
 */
export function focusFilesToggle(): void {
  if (typeof document === 'undefined') return;
  // The breadcrumb is in app-shell's shadow root.
  const crumb =
    document.querySelector('app-shell')?.shadowRoot?.querySelector('app-breadcrumb') ??
    document.querySelector('app-breadcrumb');
  crumb?.shadowRoot?.querySelector<HTMLButtonElement>('#files-toggle')?.focus();
}

/** Call `listener` when either rule starts or stops applying (a resize, a rotation). Returns its undo. */
export function onNarrowChange(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const queries = [window.matchMedia(NARROW_QUERY), window.matchMedia(TOUCH_QUERY)];
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}
