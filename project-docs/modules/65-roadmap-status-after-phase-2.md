# Where the modules, data and files effort stands, after phase 2

2026-11-21. Follows `37-roadmap-status.md` (2026-11-05), which stays as written: it is the record of where things stood when phase 2 began. The plan of record is still `02-decision-log-v1.md`, phase 2's step order is `42-phase-2-order.md`, and deferred items live in `backlog.md`.

> **Update, 2026-11-23.** **2f shipped:** the VS Code preview shows the program you choose in a project, with the playground's program chip (note 66). It was pushed the same day (`0151e11e..b5cefe4b`), with the CHANGELOG entry. Phase 2 has one step left, **2g**. Since then, a small fixes batch:
> - the phase 2 audit's "Admin writes can lose a code save" turned out fixed since 80f193f8, and is now pinned by a test;
> - the playground's code is checked on every load;
> - the Pages worker's tests run in a fresh checkout.
>
> 2f's own follow-ups are in `backlog.md`. The tables below are as of 2026-11-21, except the 2f rows.

## The phases

| Phase | What | Status |
|---|---|---|
| 0b | One shared loader for every surface; fonts in VS Code | Shipped 2026-10-26 |
| 0a | Language groundwork: lexical named fns, the drawing context follows the call, `const`, built-in names reserved | Shipped 2026-11-02 |
| 1a | `import`/`export`, `module;` files that never draw, in the CLI and VS Code | Shipped 2026-11-05 |
| **2** | **Multi-file workspaces in the playground** | **Live on pathogen.studio since 2026-11-17.** 2f shipped 2026-11-23; step 2g not built (below) |
| 3 | Data imports: JSON, CSV, text | Not started. Waits for the language changes in note 37 |
| 4 | SVG import | Not started. Its scope needs another look (note 37) |
| 5 | Globs, sharing modules between workspaces and people, images | Later |

**Where that leaves the goal** (R2, modules and libraries, from the domain survey): a kit can be written as a module and imported from other files in the playground, the CLI and VS Code. Sharing a kit with other people still needs phase 5, and data in a workspace needs phase 3.

## Phase 2: what shipped

- **The timeline:**
  - mockups from 2026-11-05;
  - 2b to 2e committed locally and held;
  - one push on 2026-11-17 (`ecbaabc8..8716907f`, 100 commits);
  - the files migration on production the same day, 218 records;
  - the card copy on 2026-11-21, 20 cards (note 58, step 8).
- **What a user gets** (the CHANGELOG's top entry has the full list):
  - files and folders in a workspace, with a `pathogen.json` the workspace writes itself;
  - the file tree, tabs, and the program list that chooses what the preview draws;
  - imports across files, with completion, hover and go-to-definition;
  - renames and moves that rewrite imports;
  - uploads of files and folders;
  - errors in other files;
  - Copy Debug Info with every file;
  - snapshots, copies, forks, publishing, review and the public page carrying every file;
  - the card image frozen at approval.
- **Storage:** a manifest on the record and content-addressed blobs in R2 (notes 47 to 50).
- **Docs:** "Files in a Workspace" (`docs/workspace-files.md`), plus changes to the projects, modules, snapshots and publishing pages.

| Step | What | Status |
|---|---|---|
| 2a | Mockups, v1 to v14 | Done (notes 39 to 62) |
| 2b | Docs and storage design, the API, the migration script | Done. The migration ran on production on 2026-11-17 |
| 2c | Compile path and language services against a workspace | Done (note 51) |
| 2d | The UI | Done (note 52) |
| 2e | Publishing, forks, snapshots, admin tools, the public page | Done (note 58) |
| 2f | VS Code parity for what the preview shows | Done, shipped 2026-11-23 (note 66) |
| 2g | Export and import a project | **Not built** |
| 2h | Copy Debug Info | Done, in 2d step 8 |

## What's left of phase 2

### 2f, VS Code parity for what the preview shows
- **Today:**
  - **VS Code's preview** draws the file you're editing; a module's preview is empty, with its notice (`docs/projects.md`, "In each tool").
  - **The playground** draws the program chosen in its list, the main at first, whichever file is open.
- **Decision 16:** "the main file by default, with a toggle to pin it to the current file. VS Code mirrors this."
  - The playground built a program list rather than that toggle, so 2f needs a short design first: how VS Code chooses among `entryPoints`, and what it shows while you edit a file that isn't on the list.
  - Then `docs/projects.md` changes, the `.vsix` is rebuilt, and the extension is checked end to end.

### 2g, export and import a project
- **Download a workspace as a project folder:** a .zip with its `pathogen.json` that the CLI and VS Code open as it is.
- **Make a workspace from a project folder,** reading `entryPoints`. Today Upload folder… brings a folder's files in but leaves its `pathogen.json` out (`docs/workspace-files.md`, "Uploading files").
- **Revisit which program Export (SVG, PNG, PDF), Copy SVG and Snapshot use.** Today it's the program the preview shows (your answer, 2026-11-13: "Sounds good for now. We can spend more time during 2g").
- **A design round and a mockup first,** as for any playground change. `docs/workspace-files.md`'s "Not yet" goes when it ships.

### Storage, from note 50
Moved to `backlog.md` ("Storage") on 2026-11-21; until then they lived only in note 50:
- **The sweep** of R2 blobs that nothing names. It is designed but not built, and you said "Let's wait until after 2e ships," so it's now due a decision. Nothing breaks without it.
- **Removing the reader for records from before phase 2.** Production has none left.

One step of note 50's shipping list wasn't run: the export and collision check after the migration (step 5), a smoke test of reading every workspace's files from R2. The public-pages check covered the 20 public workspaces; the export would cover all 195. It's a production read, so it needs your go-ahead.

## Deferred during phase 2 (`backlog.md`)

| Area | Items |
|---|---|
| Publishing and snapshots | **Publish from a snapshot**: a design round that also settles re-review, edits made while a review is pending, what never-approved cards open, and the review modal's ↗. Publish every program's drawing. Snapshots of every program, and of a program that isn't the main. Line-by-line differences on a re-review. The 16 never-reviewed Explore entries. Snapshots over 50 MB |
| Playground | A thumbnail render queue not tied to the preview. Sharing a workspace (Copy URL's replacement). The console "mole". Usage events research, then counting the 20-file limit's refusals. Copy icons on the docs' and blog's code examples |
| Editor | Rename and find-references across files. Imports follow a file renamed in VS Code |
| Language | Default import of a drawing, and the `demo { }` block (both delayed by you). Fn and enum bindings fixed in every file. Positions on every evaluator error. `@font` paths follow a moved file |
| Bugs | Three small language bugs. Of the six found in the phase 2 audit, two are fixed (a copy keeps `flagged`; no server-side size limit), one is moot (Copy URL), and three need a fresh look |
| Performance | The inspector's one-time freeze on its first close. A module cache in VS Code |
| Storage | The sweep. Removing the reader for records from before phase 2 |

## Outside the playground

Phase 1a's modules work in the CLI and VS Code from a checkout, but neither has reached users:
- the npm registry has no `pathogen-lang` package (`npm view pathogen-lang` answers 404 on 2026-11-21);
- the VS Code extension is a local build, version 0.0.1.

The three-surface rule (`.claude/CLAUDE.md`) counts a feature as shipped when it works in all three. A first npm release and a published extension would make that true for users, not only in the repository. That's a project decision rather than part of this effort, so it's noted here, not planned.

## What shipping taught

- **The API deploy can lag Pages.** On 2026-11-17, GitHub's checkout stalled for about 30 minutes, so the new playground ran against the old API (note 58, "Step 8, the push"). Nobody saved in that window (checked 2026-11-21), but nothing prevented it. When a change needs the API live first (note 47 §8), push the API part on its own beforehand.
- **There was no saved production admin token.** The admin routes also accept a signed-in admin's session, so the card copy ran from the browser console instead (note 58, "Step 8, the card copy"). Production steps that need admin rights can plan on that route, rather than on rotating the token: `scripts/rotate-admin-token.ts` also runs `wrangler deploy` from the checkout.

## Possible next steps

1. **2f,** the VS Code preview's choice of program: the smaller of the two steps left in phase 2, with a short design first.
2. **2g's design round,** with mockups.
3. **A larger design round:** publishing from a snapshot, or the language changes phase 3 waits on.
4. **Small storage work:** the post-migration export check (a production read), then the sweep's go-ahead, and removing the old reader.
