// What a copy icon says once it's pressed (2e, step 3; mockups v13 and v14,
// states "Copied" and "Couldn't copy"): one look for the read-only viewer
// (<source-files>) and the workspace's tabs (<editor-tabs>).
//
// "Copied" comes only once the clipboard has taken the text; a refusal says
// what to do instead. The icon turns to a check or a cross meanwhile.

import { FILE_ICONS } from './file-icons.js';

/** How long "Copied" (or the refusal) shows. */
export const COPY_FEEDBACK_MS = 2000;

/** Nothing yet, copied, or refused. */
export type CopyState = '' | 'ok' | 'fail';

/** The keys that copy on this machine. */
export const copyKeys = (): string => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C');

/** The icon for a state: copy, a check, or a cross. */
export function copyIconFor(state: CopyState): string {
  return state === 'ok' ? FILE_ICONS.check : state === 'fail' ? FILE_ICONS.close : FILE_ICONS.copy;
}

/**
 * The note under the icon, for the eye. `namedHtml` names what was copied, already
 * escaped. A screen reader hears `copyStatusText` instead, through a status region
 * that stays on the page (one inserted already holding its words is often skipped).
 */
export function copyTipHtml(state: CopyState, namedHtml: string): string {
  if (state === 'ok') return `<span class="tip" aria-hidden="true">Copied ${namedHtml}</span>`;
  if (state === 'fail') {
    return `<span class="tip" aria-hidden="true">Couldn't copy. Select the text and press ${copyKeys()}</span>`;
  }
  return '';
}

/** What the status region says: the note's words, as text. */
export function copyStatusText(state: CopyState, named: string): string {
  if (state === 'ok') return `Copied ${named}`;
  if (state === 'fail') return `Couldn't copy. Select the text and press ${copyKeys()}`;
  return '';
}

/**
 * The note's look: dark on a light page, light on a dark one, from the theme's
 * own colours. It hangs under its icon, right-aligned, over what's below.
 */
export const COPY_TIP_CSS = `
  .tip { position: absolute; top: calc(100% + 6px); right: -4px; z-index: 30; padding: 5px 9px; border-radius: 6px; white-space: nowrap;
    font: 400 12px/1.4 var(--font-sans, system-ui, sans-serif); background: var(--text-primary, #1c1722); color: var(--bg-primary, #f7f0e3);
    box-shadow: var(--shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1)); pointer-events: none; }
  .tip code { font-family: var(--font-mono, monospace); font-size: 11.5px; }
  .copy-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0);
    white-space: nowrap; border: 0; }
`;

/** The status region a copy icon's component keeps on the page for screen readers. */
export const COPY_STATUS_HTML = '<span class="copy-status" role="status"></span>';
