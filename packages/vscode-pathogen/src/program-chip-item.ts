/**
 * One row of the program chip's list, as the webview hands it to
 * <program-chip> (src/ui/program-chip.ts `ProgramChipItem`, which the
 * extension's own build can't import). Same fields, same meanings;
 * tests/vscode-preview-programs.test.ts fails if the two lists of fields differ.
 */
export interface ProgramChipItem {
  /** Its path in the project folder: "demos/train.pathogen". */
  path: string;
  /** The file's name without `.pathogen`, and its folder when two programs share the name (the tabs' rule). */
  name: string;
  hint: string | null;
  /** The `main` badge: on a main that isn't main.pathogen. */
  badge: boolean;
  /** Why it doesn't draw, as its row says it; null when it does. */
  error: string | null;
  /** The dot: it's the file you're editing ('self'), or it uses it ('import'). */
  uses: 'self' | 'import' | null;
  /** Its miniature is being redrawn after an edit. */
  updating: boolean;
  /** Its miniature's URL; null for a blank tile. */
  miniature: string | null;
  /** Why its tile is blank, on hover; none otherwise. */
  tileNote?: string | null;
  /** Said after its path, such as "not in pathogen.json"; none otherwise. */
  note?: string | null;
}
