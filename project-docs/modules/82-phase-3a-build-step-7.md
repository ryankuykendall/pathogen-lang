# Phase 3a build: step 7, the playground's UI

2026-11-24. Note 76's step 7: the braces icon, tabs that keep the extension, JSON highlighting and mistakes underlined as you type, Format Document off, the New data file… dialog, and the refused save in the error panel (the 1 MB `.pathogen` one too) with its retry. Done when: a verify script on the real dev playground, both themes, against mockups v2 and v3. In three commits: 7a (the editor, the tabs and the tree), 7b (New data file…), 7c (refused saves). Nothing is pushed.

## 7a: a data file in the editor, its tab and its row

| | Before (after step 6) | After |
|---|---|---|
| The editor on `gears.json` | Pathogen's state: Pathogen highlighting, completions, hover, signature help, rename, the color picker | A state of its own (`_dataExtensions`): JSON highlighted (the tokenizer `pathogen.json` already used), editable, its own undo, its edits reaching the store and autosave; none of Pathogen's services, keys or pickers |
| A JSON mistake | Marked only through a compile of a program that imports it, without its message | Marked as you type by the engine's JSON reader (`_dataLint`, 150 ms after typing pauses, as a compile waits), with the message on hover, in any data file, imported or not; a compile's marks and clears pass a data file by |
| Format Document | Ran the Pathogen formatter on the JSON | Off: the editor's call does nothing, and the workspace menu's item is greyed with "It formats Pathogen code" |
| The tab | `pathogen.json`'s kind: its lock and "Read-only: the playground writes this file" | Its own kind, `data`: the braces, `gears.json` as its label, no lock |
| The tree row | Step 6's interim: the module's box, the module's menu | Its own kind, `data`: the braces, the menu without Set as main; the drag chip too |

`FILE_ICONS.data` is the braces `pathogen.json` shows (mockup 1a). The tree's storybook entry gained "Data files" and "A data file's menu".

### In the real playground

`project-docs/modules/verify/verify-3a-step7.ts`, 18/18 in both themes after the review's fixes (`verify-3a-step7-results.json`; screenshots `3a-step7/1a-tree-editor-*.png` and `1b-json-error-*.png`, beside mockups v2 1a and 1b): the row and the tab; the JSON's strings and numbers in colors of their own; no completions when typing; Format Document off and why; a mistake in `gears.json` marked at line 3 with "expected , or ] after an array item" on hover, the panel saying it under `data/gears.json` with `imported from main.pathogen line 2`; a mistake in `sizes.json`, which no program imports, marked too; a minified 4 MB file shown plain; no page errors.

Against the mockups: the error panel sits over the editor, where the playground places it now (2d step 7), not over the tree as mockup 1b drew it.

### Code review

No blockers; the timer's ownership checked out (setState destroys a state's plugins, so a file no longer shown is never marked). Taken:
1. **A mistake at the end of a file had no mark and no message.** The reader places `[1,` followed by a newline at line 2, column 1: an empty line, with no character to mark. The error line itself now carries the message on hover (tested with that position).
2. **The hover text reaches no keyboard or screen reader.** The pane has a polite status line that says the same words, `Line 3: expected , or ] after an array item`, empty once the JSON reads (tested).
3. **A minified file is one long line,** and CodeMirror highlights and lays out a line whole: every keystroke went through all of it. A data file with a line over 20,000 characters is shown plain, without highlighting or wrapping. In the browser, a keystroke in a 4 MB one-line file costs about 71 ms (`verify-3a-step7.ts`), CodeMirror's own cost for a line that long.

Also: a test that only checked for a throw now checks the data state holds none of the language services; a test that a destroyed plugin's timer never fires; two comments named the method wrongly.

### Decided while building (confirm or overrule)

1. **The message shows on hover over the mark** (the mark's `title`). The docs say a mistake is "underlined as you type, with the message the import would give"; the panel says it only when the program shown imports the file, so the mark carries it itself.
2. **Format Document stays in the menu, greyed, with a reason,** as Export does when nothing draws, rather than leaving the menu.

### Tests

`tests/playground-editor-data-file.test.ts` (the data state's extensions and keymap; the mistake marked with its message when the file shows and 150 ms after typing, cleared when it reads; a compile's marks and clears and Format Document do nothing on a data file); `tests/playground-open-files.test.ts` (`gears.json` is a `data` tab, `pathogen.json` still `json`); `tests/playground-editor-tabs.test.ts` (the braces, the label, no lock); `tests/playground-file-tree.test.ts` (the row's class and braces, its menu).
