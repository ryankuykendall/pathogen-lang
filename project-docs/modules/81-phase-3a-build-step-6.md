# Phase 3a build: step 6, the playground's engine

2026-11-24. Note 76's step 6: workspaces compile with data; editing a data file redraws its programs; the dots, the error places and the debug report's reach include data; nothing sorts `gears.json` into the programs. Done when: tests for each reader, and a typing check on a 5 MB file. Nothing is pushed.

## Before and after

| | Before | After |
|---|---|---|
| A load with a large data file | The API's `deferred` files had no text, so the workspace opened read-only ("files this version can't edit") | Each deferred file is read by its hash before anything opens (`withDeferredTexts`, four at a time, one read a text); one that can't be read fails the load, naming it |
| A save past 24 MB | Refused by the API (step 5's cap) | Autosave stores its largest new texts first with `PUT /workspace/:id/file` until the body fits, and names them by hash; the cap is one shared number (`LIMITS.saveBodyBytes`) |
| The graph posted to the compile worker | Every data value structured-cloned | Data as text (`graphForMessage`); the worker reads each text again, once per text (`graphFromMessage`) |
| Completion of a key in brackets | Any item with a range moved every item's start to the dot, so `city.` offered nothing | Only an import path moves the start; a bracket key replaces the dot when chosen (`city["Population (2020)"]`) |
| Import paths in the editor | Modules only | Modules and data files: a name alone is offered data files, braces modules |
| Editing a data file | Didn't redraw the programs that read it | Its programs redraw: their inputs are the modules, the data files and the files that couldn't be read (`filesUsed`) |
| Copy Debug Info | Modules only | Data files in the reach, with their size and first 20 lines (all of them when the error is in one), as JSON; lines cut at 200 characters; other data files by size; an error far along a one-line file shown around its column |
| Typing in `gears.json` | Added it to the program list (it has no `module;`), so every save after was refused: `"entryPoints" lists "data/gears.json", which isn't a .pathogen file.` | A data file's edits never change the list |
| The program list, the chip, the drawings, Set as main, Duplicate | A data file counted as a program: listed, compiled as Pathogen in the background (a red dot), offered Set as main, its copy added to the list | Never a program (`isProgram` in workspace-edits, `_isProgram` in workspace-view, `programsOf`); Set as main refuses: "A data file can't be the main." |
| Rename… on `gears.json` | `cogs` gave `cogs.pathogen`; the field showed `.pathogen` | It keeps its extension, typed or not, in any letter case; the field shows `.json` (docs/workspace-files.md "Rename…") |
| The preview with no main | Could compile the open data file, or the first file by path, as the program | Never a data file; a load opens a `.pathogen` file first |
| A JSON mistake's place | `data/gears.json line 3, col 3: …` read as the program's own error, with no line | Read at the data file's line and column, with its `imported from` step: the chip's row, the panel, the tree's dot and the marks. The data extensions come from the engine's list, so 3b's `.csv` needs no change here |
| Delete… | Read every file's imports, a 5 MB data file's too | Only `.pathogen` files |
| An open data file | Built an import graph with the JSON as the entry; a `${` in it could bring the old style-opener offer; `,` or `{` at its end held the redraw 600 ms | None of these |

## The typing check

Measured with `project-docs/modules/verify/step6-typing-probe.ts` (Node, the real engine), per keystroke in a program that imports the data, after the first read:

| | Graph key | Imports resolved | |
|---|---|---|---|
| One 5 MB data file, before | 8.4 ms | 6.8 ms | |
| Ten 5 MB data files (50 MB), before | 83.1 ms | 54.5 ms | at least twice a keystroke: the editor's graph and the compile's |
| One 5 MB data file, after | 0.1 ms | 0.2 ms | |
| 50 MB, after | 0.4 ms | 0.4 ms | |

Two changes:
- **The graph key** named every other file by its whole text; it now names each by a number that changes when its text does (`versionOf`). Typing replaces only the open file's text, so the others are the same strings and compare at once.
- **The in-memory host** encoded each text to bytes for the loader to decode again. It now answers with the text (`HostReadResult` gains `text`; the bytes are made only if asked), and the loader reads it. A text is counted in UTF-8 bytes only when it could pass the limit (3 bytes a UTF-16 unit at most).

What's left, measured and kept: the compile posts its graph to the worker every time, data texts included: 19 ms of structured clone at 50 MB (2 ms at 5 MB), and the worker compares each text with its cached one (5 ms at 50 MB, off the main thread). Sending only the texts a worker hasn't seen would need the client to track each worker's life (it is replaced when a compile is cancelled); not worth it at the workspace's 50 MB.

Editing the 5 MB data file itself re-reads it on each pause in typing: about 50 ms on the main thread (the compile's import read) and again in the worker.

## How the readers were found

An Explore agent listed every playground site that sorts files into programs and modules, reads the import graph, or assumes a file is Pathogen (categories A to D). A, B and the engine's part of C are this step. The rest:
- **Step 7 (the UI):** the editor gives a data file Pathogen's highlighting, completions, hover and services (it needs a third branch beside `pathogen.json`'s read-only JSON: editable, `jsonLanguage`, history, no Pathogen services, the error marks kept); Format Document is offered on it and would run the Pathogen formatter on JSON; its tab shows `pathogen.json`'s lock and "Read-only"; the tree shows it with the module icon (its kind is `library` until step 7 gives data its own); the zero state's line for modules plus data.
- **Step 8 (the carriers):** the viewers (snapshot, public page, review) sort data as a program and highlight it as Pathogen; `review-entry.ts`, the landing page's Make public check and `forkFilesOf` don't read deferred files; the create bodies of Open as new workspace and project import, and the page-leave save, aren't kept under 24 MB; uploads and project import refuse data files and use the 1 MB `.pathogen` limit; snapshots count unsaved data against the 1 MB code limit.

## In the real playground

`project-docs/modules/verify/verify-3a-step6.ts`, against the dev stack (restarted with the user's go-ahead), 11/11 (`verify-3a-step6-results.json`): a workspace made through the dev API with `data/gears.json` and a 2.5 MB `data/big.json`, which the load sends `deferred`, opens editable and draws the gears; the data file's row isn't a program; editing it redraws the main; a JSON mistake shows in the error panel at `data/gears.json Line 3` with `main.pathogen line 1`; fixed again, autosave saves it, and the program list is still just the main; no page errors.

## Code review

No blockers. Taken:
1. **A save read its revision after storing a large file.** A page-leave save answered meanwhile moved `_baseRev` on, so the older text would have landed over the newer one with no 409. The revision is now read before any wait (tested: a save keeps the revision it began from).
2. **The cap ignored what the request adds** (`baseRev`): 1 KB is kept free under it.
3. **A save that failed after storing a file stored it again on every retry** (up to 5 MB each). Stored texts are remembered by path and text (`_storedTexts`), apart from `_savedShas`, which says what a landed save holds; a retry names them by hash (tested).
4. **The bracket key's insert** finds the dot from the start CodeMirror gives when it's chosen, not an offset kept from the query.
5. **The error patterns' new case-insensitivity:** a message that only mentions `values.json` stays the program's own error (tested).

Checked by the reviewer, no change: the graph key's versions (A→B→A, another workspace with the same paths, renames; pruned to the workspace's paths); nothing spreads or clones a host's answer, so the memory host's `bytes` getter is safe; a deferred read that fails stops the load before autosave is armed.

Left for step 8: the page-leave save doesn't keep to the cap (it can't wait for uploads), so with more than 24 MB of unsaved text it gets a 413 and the last edit waits for the next visit's save. The normal save, which runs within seconds of an edit, does keep to it.

## Decided while building (confirm or overrule)

1. **Copy Debug Info's data rules came forward from step 8.** The reach had to include data in this step, and without the 20-line and 200-character rules a one-line 5 MB file would have filled the report.
2. **A load fails whole when a deferred file can't be read,** rather than opening without it: a save would drop it.
3. **Set as main on a data file says "A data file can't be the main."**, as a module's says "A module can't be the main." The menu won't offer it once step 7 gives data its own kind.
4. **Rename keeps a data file's extension as it is** (`MAP.GEOJSON` stays capital); typing another data extension keeps the old one (`points.geojson` on `dots.json` gives `points.geojson.json`), as typing `.json` on a program gives `….json.pathogen` today.

## Tests

`tests/data-import-graph-message.test.ts` (a graph with data through structured clone compiles the same; read once per text); `tests/playground-workspace-files.test.ts` (deferred files read once per text, the store gets their text; a failed read names the file and carries no status; a save past the cap stores the largest text first and names it by hash next time; UTF-8 bytes counted as the server does; data import paths and key completion through the bridge, a bracket key replacing the dot); `tests/playground-debug-capture.test.ts` (a data file's size, first 20 lines and cut lines; other data files by size; an error in a one-line data file); `tests/data-import-loader.test.ts` (a memory host's text read without its bytes; a text near the limit counted in UTF-8 bytes); `tests/playground-workspace-edits.test.ts` (typing in a data file, even with an empty list; Rename keeps the extension and its importers follow; Duplicate; Set as main refused; Delete's importers, never reading a data file as Pathogen); `tests/playground-workspace-files.test.ts` (the program shown and the file opened first are never data while a `.pathogen` file exists); `tests/playground-error-place.test.ts` (a JSON mistake read at its place, as the compile worker words it); `tests/playground-file-tree.test.ts` (the rename field holds `dots` with `.json` after it).
