# Phase 3a build: step 5, the workspace's rules and the API

2026-11-24. Note 76's step 5: a workspace may hold data files, and the API stores, loads and copies them without running out of memory. Nothing is pushed; the API deploys first when it is (note 76, decision 8).

## Before and after

| | Before | After |
|---|---|---|
| A workspace's kinds | `.pathogen` only ("a workspace holds .pathogen files for now") | `.pathogen` and data files: `.json`, `.geojson`, `.topojson`, `.fold`. `.csv`, `.tsv`, `.txt` and `.svg` left the table until their phases |
| A file of another kind | "… holds .pathogen files for now." | "… holds .pathogen files and data files (.json, .geojson, .topojson and .fold)." (the docs' upload message) |
| A load | Every `.pathogen` file's text; a data file would have come back empty | Also data files' text, up to 2 MB in all; any other data file comes back `deferred`, for the playground to read by its hash |
| Storing a large data file | Only inside a save's JSON body, every new text at once | `PUT /workspace/:id/file`: one file's raw text, up to 5 MB, answered with its hash; a save then names it by hash |
| A create's or a save's body | Read whole, however large | Read while it stays within 24 MB (a body without a Content-Length too); larger is a 413 that says to send large files with `PUT /workspace/:id/file` |
| A visitor reading an approved workspace's large data file | (no data files) | `GET /approval-source/:id/file/:sha256`: public, the same guards and short cache as `/approval-source/:id`, only hashes the approval names |
| The owner reading a snapshot's large data file | (no data files) | `GET /snapshot/:sid/file/:sha256`: only hashes the snapshot names, which the live workspace may have dropped |
| A total just over 50 MB | "this one holds 50.0 MB" | "this one holds 50.1 MB" (sizes round up, as in every message since step 2) |

## Why the two API changes

A workspace can hold 50 MB of data files. Reading that much text, then writing it out as JSON again, in one request is more than a 128 MB Worker can hold (note 50 left this unfixed while `.pathogen` files alone couldn't reach it; note 72 listed it for 3a). So:
- **A load** sends every `.pathogen` file's text (at most 20 MB under the limits) and data files' text in path order while they fit 2 MB (`DATA_INLINE_BYTES`). The rest are `{ sha256, size, deferred: true }`. The playground reads each through `GET /workspace/:id/file/:sha256`, which streams one file from storage, and the browser keeps it, since a hash's bytes never change. Viewers (`filesToShow`) and copies answer the same way. The same text at two paths is one stored file, sent once.
- **A save** already names unchanged files by hash. An upload of several large data files, or a large project coming in, would still put every new text in one body. `PUT /workspace/:id/file` stores one file (owner only, UTF-8, at most 5 MB) and answers its `{ sha256, size }`. The playground sends large files that way first, then the save names them (step 6). A file no save names is removed by the sweep, as for any blob nothing names.

## Also

- `src/data/data-extensions.ts` holds the data extensions with no imports, so the API Worker shares the rule without the language's name tables (which pull in the stdlib). `src/data/data-files.ts` re-exports it.
- The library exports `WORKSPACE_KINDS_HELD`, the sentence an upload will give (step 8).
- Checked: the API Worker bundles with the data list defined before the rules use it (`wrangler deploy --dry-run`). While these files were edited, the local API server reloaded on a half-made change and stopped ("DATA_EXTENSIONS is not defined"): the dev stack is down until restarted.

## Code review, and what changed

The first version was reviewed before its commit. Three critical findings, all fixed in this step:
1. **A deferred file broke the public detail page.** The Pages worker's reader (`website/approval-source.ts`) refused a source whose file had neither text nor `unreadable`, so an approved workspace with more than 2 MB of data lost its page and `source.json` (503). It now accepts `deferred`; a program's main is always a `.pathogen` file, so the page's main text is unchanged (a test pins that a data file can't be an entry point).
2. **Nobody but the owner and an admin could read a deferred file,** and the owner only while the live workspace still named it. So a visitor of a public workspace, and the owner of a snapshot whose data file was later removed, had no way to read it. Two routes, each scoped to its own frozen manifest: `/approval-source/:id/file/:sha256` and `/snapshot/:sid/file/:sha256`. `getWorkspaceFile`'s comment said "anyone for a public workspace", which was never true; corrected.
3. **A create or a save still read its whole body.** A 50 MB body would be held as text, then parsed, before any limit ran. Now `website/api/request-body.ts` reads a body only while it stays within its route's cap (24 MB for a create or a save, 5 MB for `PUT /workspace/:id/file`), whether or not it says its length. A malformed body still ends as it did (the route's 500).

Also taken: the PUT route's own check trusted Content-Length and then buffered the whole body (now the same capped read); a stray blank line. Not taken: the reviewer's request to test an admin's PUT (the route is owner only, as a save is).

The fixes were reviewed again: all three resolved, nothing broken. One warning, taken: a save wrote all its new texts at once, and each write encodes its text again, so a 24 MB save could hold every encoding together on top of the body and its parsed strings (the reviewer's estimate: 75 to 100 MB before the isolate's own). New texts now go three at a time (`putTexts`), and a copy's too. Owed before the push (step 9): one PUT through `wrangler dev` with a chunked 6 MB body (`Transfer-Encoding: chunked`), since the tests prove the capped read in Node only, and one 24 MB save of non-ASCII text measured there.

## Tests

`tests/api/workspace-files.test.ts` (the kinds, the reason, `pathogen.json` still reserved, 5 MB a data file, 50 MB in all), `tests/api/workspace-data-files.test.ts` (a data file created and loaded; each extension; a `.txt` refused with the reason; 5 MB exactly saves and one byte more doesn't; a data file refused as a program; the budget and `deferred`, read back by hash; a copy; the new route stored, saved by hash and read, and refused over 5 MB, sent in pieces too, for bytes that aren't UTF-8 and for another user; the capped read itself; a save and a create over 24 MB refused with how to send large files; 20 `.pathogen` files of 1 MB still fit one create; an approval's deferred file read by a visitor, accepted by the page's reader, not served for an unnamed hash or once unpublished) and `tests/api/snapshots.test.ts` (a snapshot's data file read by hash after the live workspace dropped it; not for an unnamed hash or another account). The API suite: 411 with the three upload tests below.

The upload tests (`playground-uploads`, `project-import`, `playground-new-workspace-import`) pinned "data files come later" for `.csv`, `.txt` and `.svg`. Those aren't data files in 3a, so an upload now gives them its general reason, "workspaces hold .pathogen files for now." That stays true until step 8, which gives all of them the docs' sentence ("a workspace holds .pathogen files and data files (…)") when uploads take data files. Giving it now would tell someone dropping `cities.json` that data files are allowed while leaving it out.

Checked: the type errors in the changed API and Pages worker files are the same five as at HEAD (none new; nothing type-checks `website/` otherwise); the API Worker bundles (`wrangler deploy --dry-run`); no new lint findings (`website/**` isn't linted).

## Decided while building (confirm or overrule)

1. **2 MB of data text in a load,** the rest by hash. Small projects load in one request; large ones add one request a large file.
2. **The new route** is the one way to send a file larger than a save comfortably carries; the playground decides when (step 6).
3. **24 MB for a create's or a save's body.** Twenty `.pathogen` files of 1 MB, with JSON's escapes, fit (about 23 MB for short lines); a body past it is refused with what to do. A workspace whose texts escape to more (a file of mostly newlines or quotes) still saves: its client sends the largest new files by PUT first. The memory a 24 MB body costs is what a save of 20 MB of `.pathogen` text could already cost before 3a.

## For you to decide before the push: files nothing names

Before this step, a stored file nothing named came from a failed save, or was an old version of a saved file (saves never delete; note 48 §1 planned a sweep script, run by hand, and deferred it: "Storage is cheap enough that the sweep can wait"). `PUT /workspace/:id/file` adds a way to store files no save ever names: an owner could PUT any number of 5 MB files, since nothing limits a workspace's or an account's stored bytes. The same owner could already fill storage at 24 MB a save by saving changed text over and over, so this isn't a new kind of risk, but it is an easier one. The choices:
- **(a)** Ship as is, as for old versions today; the sweep stays deferred.
- **(b)** Write the sweep before the push (one script: list each workspace's files, keep what the live manifest, its snapshots and its approval name).
- **(c)** Limit PUTs per workspace per hour.

My recommendation is (a) for 3a, with (b) on the list before data files are widely used. The comments in the code say what's true either way (the PUT route's no longer claims a sweep removes them).

## Owed to later steps

- **Step 6:** read deferred files by hash before compiling (the owner: `/workspace/:id/file/:sha256`); send large new files through `PUT /workspace/:id/file` before the save, so a save's body stays within 24 MB.
- **Step 8:**
  - uploads, the import of a project and the viewers learn data files (the reason, the sizes, the text check), and an upload's reasons become the docs' sentence (above);
  - a new workspace from a large project: create it with what fits 24 MB, then PUT the rest and save;
  - the public page's View source and "Open as new workspace" read deferred files through `/approval-source/:id/file/:sha256`; the snapshots page through `/snapshot/:sid/file/:sha256`; the review screen as an admin through `/workspace/:id/file/:sha256`;
  - a snapshot's `files` field is limited to 1 MB (`SNAPSHOT_LIMITS.codeBytes`), so a snapshot sends data files by hash, or the owner reads "This program is X MB";
  - the readers that still assume every file has text (the reviewer's list): `playground/utils/review-entry.ts` (refuses the whole source, or uses `''`), `playground/components/shared/source-files.ts`, `playground/components/blog/mini-workspace.ts`, `admin-moderation-view.ts`, `admin-thumbnails-view.ts`, `playground/services/api.ts`'s file type, and `scripts/backfill-approval-svgs.ts`.
