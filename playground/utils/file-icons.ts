// Icons for a workspace's files, drawn as in the phase 2 mockups
// (project-docs/modules/phase-2-mockups-v6): a program, a library,
// pathogen.json, and the controls around them. Inline SVG strings, so they
// render inside any shadow root and take the text colour (`currentColor`).
// The tabs (2d step 3) and the file tree (step 4a) use them; the program list will too.

const icon = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const FILE_ICONS = {
  /** A program: a page with a drawn wave. */
  program: icon(
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 16c1.4-2.6 2.6-2.6 4 0s2.6 2.6 4 0"/>',
  ),
  /** A library (`module;`): a box. */
  library: icon('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  /** pathogen.json. */
  json: icon(
    '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
  ),
  lock: icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  /** A folder, in the file tree. */
  folder: icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  /** A folder's fold control: points down when open (the tree turns it for a folded one). */
  chevron: icon('<path d="m6 9 6 6 6-6"/>'),
  /** The docs. */
  book: icon(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  ),
  close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
} as const;
