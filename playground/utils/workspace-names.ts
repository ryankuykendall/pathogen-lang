// The two names every workspace knows, with no imports of their own, so a page
// without the playground's store (the public workspace page, 2e step 6) can
// order files as the tree does (utils/file-tree-rows.ts, components/shared/source-files.ts).

/** The main by convention: a workspace starts with it, and it needs no `main` badge. */
export const MAIN_FILE = 'main.pathogen';

/** The project file, written from the program list and shown read-only (note 45). */
export const PROJECT_FILE = 'pathogen.json';
