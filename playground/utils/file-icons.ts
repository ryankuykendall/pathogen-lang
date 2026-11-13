// Icons for a workspace's files, drawn as in the phase 2 mockups
// (project-docs/modules/phase-2-mockups-v6): a program, a library,
// pathogen.json, and the controls around them. Inline SVG strings, so they
// render inside any shadow root and take the text colour (`currentColor`).
// The tabs (2d step 3), the file tree (step 4a) and the program chip (step 5a) use them.

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
  /** A row's own menu (⋮), and what it offers (step 4c). */
  kebab:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  star: icon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  copy: icon(
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  ),
  trash: icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  /** Rename…, Move to…, and Move to…'s top of the workspace (step 4c-2). */
  pencil: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  move: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13.5 10.5 16 13l-2.5 2.5"/>',
  ),
  home: icon('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  /** The tree's + (add a file or folder), and New folder in its menu. */
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  folderPlus: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  ),
  /** The docs. */
  book: icon(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  ),
  close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
  /** The editor's zero-state (step 4d): no file open; the program list's Open in the editor (step 5a). */
  code: icon('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  /** The program chip's caret: its list opens upward (step 5a). */
  chevronUp: icon('<path d="m6 15 6-6 6 6"/>'),
  /** The program list's check on the program shown. */
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  /** Upload files… and Upload folder… in the + menu (step 6a; mockup v6 screen N). */
  upload: icon('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
  folderUp: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 16v-6M9 12.5l3-3 3 3"/>',
  ),
} as const;

/** The `main` badge's title, in the file tree and the program list (mockup v6). */
export const MAIN_BADGE_TITLE = 'The main: first in pathogen.json’s entryPoints. Thumbnails and publishing use it';
