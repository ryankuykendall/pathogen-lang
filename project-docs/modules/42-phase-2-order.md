# Phase 2: the order, with export and debug capture added

2026-11-06. Replaces "A possible order for phase 2" in `38-phase-2-audit.md` (38 is left as it was). Steps 2g and 2h are new, from your v3 review (`41-phase-2-mockups-v3-review.md`).

1. **2a, mockups.** v1 to v4 so far (`phase-2-mockups-v1/` … `-v4/`), reviewed with you before any playground code.
2. **2b, docs and storage design,** then the API and the migration (dry run, your go-ahead, write).
3. **2c, the compile path and language services** against a workspace host: compile the program the chip shows, fonts across files, diagnostics, completion and definition across files, file-aware errors and logs.
4. **2d, the UI** from the approved mockups, storybook first. Also in 2d:
   - Renaming a file rewrites the import paths in the workspace's other files (decided in 41-).
   - The mini-workspace's Background and Grid controls (not Precision), with their own mockup first.
5. **2e, publishing, forks, snapshots, admin tools and the detail page,** carrying every file.
6. **2f, VS Code parity** for what the preview shows.
7. **2g, export a project (new).** A design round and a mockup, then the build:
   - A .zip of every file, with a `pathogen.json` whose `main` is the entry point, so `pathogen-lang <folder>` and VS Code open it as the same project.
   - Importing a project folder back, reading `main`.
   - Which program SVG, PNG and PDF export and Snapshot use when the preview shows one that isn't the entry point (41-, #4).
   - The mockups show the Project button now. In the product it ships with this step, since a button with nothing behind it can't ship.
8. **2h, Copy Debug Info (new).** It has to land with 2d: once a workspace holds several files, today's capture leaves most of them out. Design it before building.

## Copy Debug Info today

`playground/utils/debug-capture.ts` builds one Markdown capture from the store. These parts assume one file:

- **One source string** (`state.code`), in a code fence labelled `svg-path`, an old name for the language.
- **One error** (`compilationError`), without the file it happened in.
- **Logs and warnings** print `[line N]` without the file. The entries carry `file` since phase 1a step 3, but the capture doesn't print it.
- **Nothing on which program is shown,** which file is the entry point, which file is open in the editor, or what imports what.
- **The diagnostic prompt** at the end describes the language with nothing about `module;`, imports or files.

The rest (layers, canvas settings, called functions, the per-section line limit) carries over.

## Questions for 2h

- Every file in the workspace, or the shown program and what it imports?
- How big it may get: the 200-row limit is per section, and a workspace with many files multiplies the source section.
- Errors in other programs (not the one shown): included or not?
- Where it is offered: today the error panel's button and the breadcrumb's menu. Does either need to say which program it captures?
- Whether the prompt stays, and how it is kept current as the language changes.
