# Phase 2g: export and import a project (design, for your answers)

2026-11-23. The last step of phase 2 (`42-phase-2-order.md` step 7; note 65 "What's left of phase 2"). Nothing is built yet. A workspace is already a project folder in all but name: files, folders and a `pathogen.json` the workspace writes itself, with `entryPoints` (`docs/workspace-files.md`). 2g lets it leave the playground as one, and come back.

## Before and after

| | Today | Proposed |
|---|---|---|
| Taking a workspace to the CLI or VS Code | Copy each file by hand | **Export → Project (.zip):** every file and folder, with its `pathogen.json`, in a folder named after the workspace. `pathogen-lang <folder>` compiles its main; VS Code's preview opens on it (2f) |
| Bringing a project folder in | Upload folder… adds its files to the workspace you're in, leaving `pathogen.json` out ("its programs join the end of the program list; use Set as main") | **New workspace → from a project folder or a .zip:** its files, folders and `entryPoints` as they are. Upload folder… stays as it is |
| Which program Export (SVG, PNG, PDF), Copy SVG and Snapshot take | The program the preview shows, without saying which | The same, and they say which: "Export try-sizes" (the v3 mockup's recommendation, which you liked but wanted to think through: note 41, #4) |
| `docs/workspace-files.md` | "Not yet: a workspace can't be downloaded as a project folder, or made from one" | That line goes; a section on projects |

**Unchanged:** Upload files… and Upload folder… inside a workspace, the limits (20 files, 1 MB a file), and that a workspace holds only `.pathogen` files and its `pathogen.json`.

## What's there to build on

- **The Export modal** (`playground/components/export-modal.ts`, the only export path) has SVG, PNG and PDF. The v3 mockup (`phase-2-mockups-v3/`, state "Export the project") drew **Project** as a fourth format, and v4 kept it; the mockups after v4 don't draw the Export modal.
- **`pathogen.json`'s text** comes from one writer, `workspaceProjectFileText`, shared with the server.
- **Upload folder…** already reads a picked folder's files, keeps their folders, and lists what it leaves out (`playground/services/uploads.ts`: other file kinds, files over the limits, `pathogen.json`).
- **A new workspace with files** is one API call: `POST /workspace` with `files`, `folders` and `entryPoints` (2e's Open as new workspace uses it).
- **No zip code yet.** Writing one is small (stored, not compressed, with a checksum per file). Reading one needs inflate: a small vendor chunk such as `fflate` (about 8 KB), built like the other vendor chunks. A decision for the build, not for you.

## Questions for you

1. **Where is a project downloaded?**
   - (a) **The Export modal's fourth format, Project (.zip),** as the v3 mockup drew it. *Recommended:* one place to take a workspace out, beside SVG, PNG and PDF.
   - (b) The workspace's ⋮ menu, Download project.
   - (c) Both.
2. **What does the .zip hold?**
   - (a) **The project only:** every file and folder (empty folders kept), and `pathogen.json` as the workspace writes it, inside a folder named after the workspace. Unsaved edits are included: it's what you see. *Recommended.*
   - (b) The project, plus each program's drawing as an SVG beside it.
3. **Where is a project brought in?**
   - (a) **New workspace, from a project folder or a .zip,** on the new-workspace page (and by dropping one there). It reads `entryPoints` and keeps the folders. What it can't take (other file kinds, files over the limits, more than 20 files) is listed, as Upload does. *Recommended:* a project becomes a workspace of its own, so its list and its `/` imports stay as they were.
   - (b) Also inside a workspace: Upload folder… of a folder with a `pathogen.json` at its top offers to take its list. That would mean merging two lists, so I'd leave it out.
4. **Which program do Export (SVG, PNG, PDF), Copy SVG and Snapshot take?**
   - (a) **The program the preview shows, as now, and they say so:** the modal's title or button names it ("Export try-sizes"), and Snapshot's popover says which program it captures. *Recommended:* what you see is what you get; the chip is how you choose.
   - (b) Always the main.
   - (c) A program picker in the Export modal.
5. **Visitors:** should an approved workspace's public page offer the project download too? Its files are already public there (View source), and "Open as new workspace" already copies them. *Recommended:* not in 2g; on the backlog, so 2g stays the owner's round trip.

## The plan, once answered

1. **Mockups** of what you chose (the Export modal's Project format; the new-workspace page's import, with what's left out; the program named in Export and Snapshot), light and dark, phone included.
2. **Docs first:** `docs/workspace-files.md` (a projects section; "Not yet" goes), `docs/projects.md` ("In each tool", the playground line), with a content review and your approval.
3. **Tests first, then the build:** the zip writer and reader (round trip: export, import, the same workspace), the import's checks (limits, file kinds, a hand-written `entryPoints` that names a missing file or a module), the modal and the page, a playground check end to end, and the CLI and VS Code opening an exported project.
4. **Close out:** a code review, the full suite, the CHANGELOG.
