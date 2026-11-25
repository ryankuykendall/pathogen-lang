# Phase 3a, step 8: the carriers (build record)

The plan is note 83. Step 8 goes in parts; each is committed on its own.

## 8a: uploads and a project's import (2026-11-24)

The user, after the first push (note 84): "Let's push what we have then move onto step 8."

**What changed**
- `services/uploads.ts`: `canHold` (a .pathogen file or a data file; never a `pathogen.json`, though it ends in `.json`); `kindReason` gives the docs' sentence (`WORKSPACE_KINDS_HELD`); `tooLargeReason(name, bytes)` and `overLimit` go by the file's kind (1 MB, 5 MB), in the docs' words (`6.2 MB, more than the 5 MB a data file can be in a workspace.`); `textOf(bytes, name)` says "isn't UTF-8 text, so it can't be a data file" for a data file.
- `services/workspace-edits.ts`: `planUpload` refuses an upload that would take the workspace past 50 MB (`A workspace can hold at most 50 MB: its files are 45 MB, and the upload would make them 55 MB.`), replaced files counted as replaced, with save-limits' length × 3 shortcut.
- `services/project-import.ts`: the upload's rules; a 50 MB refusal before reading, beside the 20-file one, both counting `.pathogen` and data files together and not what's left out; `dataFiles` in the plan, never programs or modules; "There’s no file here that a workspace can take" (the import can be all data now).
- `new-workspace-view.ts`: the card lists the data files after the modules, with the braces and `data` (mockup v2 4a).
- `file-tree.ts`: Upload files…'s picker offers `.pathogen` and the data extensions (`DATA_EXTENSIONS`).
- **New: `services/workspace-create.ts`**, `createWorkspace`. A create's body is capped at 24 MB, and an import (or Open as new workspace) can bring 50 MB. Past the cap, the workspace is created without its largest data files; each is stored on its own (`PUT /workspace/:id/file`), then one save names every file by its hash (the create's answer carries the hashes). A failure after the create deletes the workspace. This is the route the server's own 413 gives. The import and Open as new workspace both create through it.

**Checks**
- Tests: uploads (the docs' reasons, data files in, never a program, 50 MB in bytes not characters), the import (data rows, both limits, `pathogen.json`), the page (the data row and its icon, the created body), the tree (the picker's list), and `playground-workspace-create.test.ts` (the split, a `.pathogen` file never waits, a failure deletes).
- Full suite 282/282 files; the commit's tree alone 280 passed, 2 skipped.
- `verify-3a-step8a.ts`, 23/23 on the dev stack in both themes: an upload of `sizes.json` with a 6.2 MB data file and a `.txt` left out, saved outside the program list; the import card (screenshots beside mockup 4a); a created workspace whose main draws from its data file; a 27 MB project created through the split (the API log: `POST /workspace`, `PUT …/file`, `PUT /workspace/:id`), every file whole.

**Review** (code-reviewer): approve, nothing serious. Taken: a comment on the kind fallback in `tooLargeReason`, a two-byte 50 MB test, and a comment that a file found not to be text only when read has counted toward the import's limits (the docs' "not counting what's left out" is about what's left out before reading; a binary `.json` that tips a project over is the rare case). Not taken: `pathogen.json`'s own "isn't text" message, which `textOf`'s wording doesn't reach.

**Left for the rest of step 8**: note 83's rows for the source readers (Open as new workspace reading deferred files by hash first, View source, the review screen, the admin views), snapshots, Make public's check, and the round trip.
