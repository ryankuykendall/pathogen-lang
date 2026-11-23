# Phase 2g build: Download workspace, and a workspace from a project

2026-11-23. The build of notes 68 and 69 (mockups v1 with v2's changes, approved), against the approved docs (51c7ecd1): `docs/workspace-files.md` "Downloading a workspace" and "A workspace from a project", the naming bullet in "The preview and the program list", and one sentence each in `projects.md`, `exporting.md` and `snapshots.md`.

## Before and after

| | Before | After |
|---|---|---|
| Taking a workspace to the CLI or VS Code | Copy each file by hand | **⋮ → Download workspace** saves `Gear-studies.zip`: one folder with `pathogen.json`, every file as the editor holds it, and the empty folders |
| Bringing a project folder in | Upload folder… inside a workspace; its `pathogen.json` left out | **New Workspace → Or import a project**: Choose folder…, Choose .zip…, or a drop. The card lists what comes in; Create Workspace makes it |
| Export, Copy SVG, Snapshot | Take the program shown, without saying which | The same, and with more than one program each names it: `Export try-sizes`, `The program shown: try-sizes`, `Of try-sizes, the program shown` |

## What was built

- **`playground/services/zip.ts`.** Writing stores each file uncompressed, with UTF-8 names (flag bit 11) and Unix modes. Reading takes a .zip in slices: the end record from its tail, then the central directory, then each entry when asked, so a large .zip is never read whole and what's left out is never read. Stored and deflated entries; zip64 sizes, offsets and end record; data descriptors; names as UTF-8 when flagged or when they decode, else Windows-1252; `\` turned into `/`. Each entry's size and CRC are checked, and inflating stops at the declared size, so a .zip that lies about a size can't make the page inflate more.
- **`playground/services/project-import.ts`.** Picking (Choose folder…, Choose .zip…, a drop) and planning (`planImport`), by the docs' rules and note 69's stop-or-go rule. It reuses Upload's left-out reasons word for word (`kindReason`, `tooLargeReason`, `textOf`), `fittedName`, the workspace's path rules, and the engine's `importEditsForMoves`/`applyImportEdits` for the rewritten imports.
- **`playground/services/workspace-download.ts`.** The .zip from `workspaceNow()` (the editor's text for the open file; every other file's from the store), the empty folders, and `pathogen.json` from the workspace's one writer.
- **The page** (`new-workspace-view.ts`, `.css`): the section, the card, the "Not added" box, the refusal, Create off while reading or refused, the stray-drop guard. **The menu** (`app-breadcrumb.ts`): Download workspace and the `folder-zip` icon. **The naming**: a store key `programNames`, set by the workspace view with the chip, read by the menu, Export's title and the Snapshot panel.

## Decisions the build made (not in notes 68 and 69, or the docs)

1. **No fflate.** Note 68 suggested a small vendor chunk for inflating. The browsers' own `DecompressionStream('deflate-raw')` does it (Chrome 103, Firefox 113, Safari 16.4; Node 24 in the tests), so there's no new dependency.
2. **New messages**, none in the docs word for word (a path a .zip holds twice: "is in the project twice: the last copy comes in."):
   - a file that isn't a .zip, or can't be read as one: "This .zip can't be read, so nothing was added: it isn't a .zip file." (or "it's damaged or cut short.", or "it's split across several files; join them into one .zip first.");
   - an entry the .zip can't give: "is encrypted, and the playground can't open encrypted files." and "is compressed in a way the playground can't read. Make the .zip again with your computer's own Compress.", listed under "Not added"; "is damaged in the .zip, so it couldn't be read." for a bad CRC or size;
   - two things dropped at once, or one file that isn't a .zip: "Drop one project folder, or one .zip.";
   - nothing a workspace can take: "There's no .pathogen file here that a workspace can take, so nothing was added.";
   - a `pathogen.json` over 1 MB, or not text, stops the import as a malformed one does: "pathogen.json (gears) is larger than 1 MB." / "… isn't text.".
3. **A project of modules only** comes in: the workspace has no main (as after deleting the last program), and the card says so.
4. **Folders get numbers too.** `Parts/` and `parts/` from a Linux computer: the second in path order comes in as `parts-2/`, with its imports following. The docs say "names"; numbering folders as files are numbered keeps both folders' files apart.
5. **An `entryPoints` entry that differs from its file only in letter case** finds the file, as macOS and Windows do. The workspace's names can't differ only in case, so the match is unique.
6. **"Not added" is in order of paths**, whatever order the tool that made the .zip wrote it in. A folder picked with more than 1,000 files says so first, as Upload does.
7. **The name field** takes the .zip's name without `.zip` (`Gear-studies`), or the folder's name; a name you typed stays, and Choose another… takes back the name it filled in.
8. **The card's foot** says "in order of their paths" where v2's mockup said "by name", as the docs review settled (finding 6); 2i's message says "choose the folder again" or "choose the .zip again" (finding 9).
9. **Export's title and the Snapshot panel name the program that drew**, which is the program shown except for the moment after choosing another in the chip; Copy SVG's line names the program shown.
10. **The icon** is `folder_zip` at weight 300, as the mockups showed it; the sprite's other icons are weight 400.

## Tested

- `tests/zip.test.ts` (23): fixtures made by Info-ZIP's `zip -r`, `zip -fz` and macOS's `ditto` (`tests/fixtures/zips/`, `make-fixtures.ts`), byte-built zips for deflate, data descriptors, zip64, comments (one holding a fake end record), backslashes, name encodings, encrypted and unknown methods, cut and split zips, CRC and size lies, a size no browser can hold, broken deflate; the writer read back, checked field by field and by `unzip -t`; a large .zip listed from under 70 KB of reads.
- `tests/project-import.test.ts` (34): the docs' rules one by one, and a path a .zip holds twice; every plan also passed through the server's `checkManifest`.
- `tests/workspace-download.test.ts` (6): the .zip's layout; a round trip back through the import; unzipped, the CLI compiles it to exactly what the original project folder gives, and VS Code's `readProject` lists the same programs in order.
- `tests/playground-new-workspace-import.test.ts` (15) and `tests/playground-2g-menu-and-names.test.ts` (7): the page and the menu in jsdom, including a quote in a .zip's name or a link's title, a project picked before a link's code, a slow read (Create off, Choose another…, the page left or taken out mid-read).
- The code review (`reviews/phase-2g-build-code-review.md`): 1 must-fix, 4 should-fix in code and one in tests, and one more on the recheck; all taken.
- **The must-fix closes a hole on the live site.** The New Workspace page's name field didn't escape `"`, so a name holding a quote could add code that runs on the page. The name comes from a link's title (`/workspace/new?state=…`, which anyone can send), from Open as new workspace (another user's public workspace's name), and with 2g from a picked folder or `.zip`. An audit of every other escape helper that writes into an attribute found them all escaping quotes (`reviews/phase-2g-changelog-review.md`).
- `project-docs/modules/verify/verify-2g.ts`: 40 checks on the dev server, signed in, light and dark, with screenshots in `verify/2g/`. It covers the menu, Export, Snapshot, a download holding an edit not saved yet in a tab no longer in front, the CLI on the unzipped folder, the import of that .zip as a new workspace (files, empty folder, program list, opens on its main), Choose folder…, renamed names, a malformed `pathogen.json`, a dropped .zip, a stray drop, and a touch screen.

## Not changed

- `npm run typecheck:playground` reports three errors in files 2g doesn't touch (`svg-preview-pane.ts` lines 712 and 716, `font-loader.ts` line 551). They were there before this work.

## Shipped (2026-11-23)

Pushed with the docs and the CHANGELOG (`0a9438c8..c752a015`, Pages only), live about two minutes later; `tmp/2g/check-live-2g.ts` passed its 7 checks on pathogen.studio, the link route's quote included. Your hand check, the same day: "Confirmed that import and export work as expected."

## Next (before the push)

- Your look at the decisions above, and a hand check if you'd like one: download a workspace of yours and open the folder in VS Code; import a project folder of your own, and a `.zip` made by Finder's Compress.
- The CHANGELOG entry (draft in `tmp/2g/changelog-2g-draft.md`), its content review, and your approval.
- Then the push, with your go-ahead. It ships the 2g docs (51c7ecd1), this build and the CHANGELOG together: the docs describe 2g, so they wait for it. Pages only; no API change.
