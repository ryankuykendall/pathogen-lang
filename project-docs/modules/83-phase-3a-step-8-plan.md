# Phase 3a, step 8: everything that carries a workspace (plan)

2026-11-24. Note 76's step 8: upload, project import, Download workspace, snapshots, Copy Workspace, public pages and the review viewer, Copy Debug Info's 20 lines. Done when each round-trips a workspace with `data/gears.json`. Gathered from the owed lists in notes 80 (the API) and 81 (the engine), and the Explore agent's category D. Copy Debug Info's data rules came forward to step 6 (note 81), so they're done.

## The carriers, and what each owes

| Carrier | Today with a data file | Owed |
|---|---|---|
| **Upload files…, a drop on the tree** (`services/uploads.ts`) | Refused: "workspaces hold .pathogen files for now; data files come later." | Takes data files: 5 MB a data file (`fileBytes.data`, not `.pathogen`'s 1 MB), the UTF-8 check, the 20-file and 50 MB limits; `file-tree.ts` `accept` lists the data extensions; every other kind gets the docs' sentence, `KINDS_HELD` (step 5's interim reasons for `.csv`, `.txt`, `.svg` go) |
| **A project imported as a workspace** (`services/project-import.ts`, `new-workspace-view.ts`) | Refused at its gate; would count a data file as a program | Takes data files with the upload's rules; lists them after the modules (docs "A workspace from a project"); never a program; a data file over 5 MB is "Not added" with the docs' words; a create body within 24 MB (create with what fits, then PUT the rest and save) |
| **Open as new workspace** (public page) and **forkFilesOf** | Needs every file's text; a deferred file makes it give up | Reads deferred files by hash (`/approval-source/:id/file/:sha256`) first; a create body within 24 MB |
| **Download workspace** (`workspace-download.ts`) | Writes every text | Check only: the round trip of `data/gears.json` |
| **Snapshots** (`snapshot-controller.ts`, the snapshots page) | Counts unsaved data texts against the 1 MB code limit ("This program is X MB"); the viewer sorts data as a program and highlights it as Pathogen | Data files by hash when saved; the viewer reads deferred files through `/snapshot/:sid/file/:sha256`, shows data with the braces and JSON highlighting |
| **Copy Workspace** | Server side (step 5) | Check only |
| **Public page's View source, the review screen, admin views** (`source-files.ts`, `detail-source-files.ts`, `review-entry.ts`, `admin-*`, `mini-workspace.ts`, `scripts/backfill-approval-svgs.ts`) | `review-entry.ts` treats a deferred file as a broken source, or as `''`; the viewers sort data as a program | Read deferred files through the route each may use (visitor: approval route; admin: workspace route); a `data` kind with the braces and JSON highlighting in `SourceFile` |
| **Make public's check** (`landing-view.ts`) | Loads the workspace without reading deferred files | `withDeferredTexts` |
| **The page-leave save** | Doesn't keep to the 24 MB cap | Best effort; documented in note 81. No change planned unless a cheap one appears |

## Order

1. Uploads and project import (the shared rules: kinds, sizes, the reason), with their tests pinned to the docs' words.
2. The readers of approval and snapshot sources (deferred files, the `data` kind).
3. Snapshots' save side and Open as new workspace's create.
4. A verify script that round-trips `data/gears.json` through every carrier on the dev stack.
