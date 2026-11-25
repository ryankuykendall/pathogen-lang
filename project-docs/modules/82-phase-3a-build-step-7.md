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

## 7b: New data file…

The **+** menu and a folder's menu have **New data file…** after New module, with no small text (mockup v2 2a). It opens a dialog (`components/shared/new-data-file-dialog.ts`, mockups v3 2b to 2d):
- one field, the name with the extension after it as a dropdown, `.json` unless another is chosen; the list says what each holds (its texts are the mockup's, and a test pins that the list is the engine's `DATA_EXTENSIONS`);
- the line under the field: `Adds data/trips.json`, or why not, and then Create is off: a taken name in the tree's words (`data/ already has gears.json.`), another extension (`A data file ends in .json, .geojson, .topojson or .fold, not .txt.`), the name rules, a full workspace;
- typing `trips.geojson` chooses `.geojson`; choosing from the list replaces an extension typed;
- Enter or Create makes the file, starting as `{}`, and opens it; Esc closes the list first, then cancels; Cancel puts the keyboard back in the tree.

The frame is `confirm-dialog`'s: its styles are exported (`DIALOG_STYLES`), not copied. The rules are workspace-edits' (`planNewDataFile`, `readDataFileName`, `dataFileNameParts`), sharing New program's name and taken-name walk (`newFilePath`). The dialog has a storybook entry with the four states.

### In the real playground

`verify-3a-step7.ts`, now 30/30 in both themes: the + menu's order, the dialog's line and Create, its list of four, Esc closing the list but not the dialog, the taken name, and Enter making `data/trips-light.json` (`trips-dark.json`) as `{}` in its own tab. Screenshots `3a-step7/2a-plus-menu-*.png`, `2b-new-data-dialog-*.png`, `2c-extension-list-*.png`, `2d-name-taken-*.png`, beside mockups v2 2a and v3 2b to 2d.

### Code review

No critical findings. Taken:
1. **A dialog the browser closes itself** (a second Escape, which Chrome won't let a page hold back) would have closed without an answer: no file, the element left behind, the keyboard nowhere. Its `close` now answers "no file" (tested).
2. **Taken out of the page some other way,** it left its outside-click listener on the document. It now removes it and answers "no file" when it leaves (tested).
3. **The list could go off a small screen:** it keeps 8 px from the left edge, opens above the button when there's no room below (a phone held sideways, or with its keyboard up), and is never wider than the screen.
4. **A dotted name** (`report.final`) was refused as a wrong extension with no way out. The message now says how to keep it: `A data file ends in .json, .geojson, .topojson or .fold, not .final. To keep .final in its name, add one: report.final.json.`; typing that makes `report.final.json` (tested, with a folder named `raw.json` and a name ending in a dot, which New program's rules decide alike).

Also: Tab from the open list goes on from the extension button; tests for an outside click, Home and End.

### Decided while building (confirm or overrule)

3. **The message for another extension** is new: `A data file ends in .json, .geojson, .topojson or .fold, not .txt. To keep .txt in its name, add one: trips.txt.json.` (the docs say the dialog says why, but not in which words).
4. **An empty field** shows no line and Create is off, rather than a placeholder file name.

### Tests (7a)

`tests/playground-editor-data-file.test.ts` (the data state's extensions and keymap; the mistake marked with its message when the file shows and 150 ms after typing, cleared when it reads; a compile's marks and clears and Format Document do nothing on a data file); `tests/playground-open-files.test.ts` (`gears.json` is a `data` tab, `pathogen.json` still `json`); `tests/playground-editor-tabs.test.ts` (the braces, the label, no lock); `tests/playground-file-tree.test.ts` (the row's class and braces, its menu).

### Tests (7b)

`tests/playground-workspace-edits.test.ts` (New data file… makes `{}` and opens it, off the program list; an extension typed; folders; the four refusals; reading a typed name); `tests/playground-new-data-file-dialog.test.ts` (the list is the engine's extensions; the line, Create and Enter; a typed extension chosen, another refused, a taken name; the list's states and a typed extension replaced; the list's keyboard and Esc twice); `tests/playground-file-tree.test.ts` (the menus' order; New data file… asks for its folder).
