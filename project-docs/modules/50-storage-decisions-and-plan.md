# Storage: your decisions, and the plan for the code

2026-11-07, step 2b. The design is `48-storage-design-v2.md`. Note 49 covers the `entryPoints` code and the VS Code fix.

## Your answers, in your words

1. On the VS Code gap: "Fix it before pushing."
2. On the docs text added after your approval: "Approved"
3. On the blob design: "Yes, this sounds correct"
4. On regenerating every hash in the migration: "Sounds good"
5. On names of ASCII letters, digits, `-`, `_` and `.` only: "Yes, that is correct"
6. On the limits: "This should be a fine starting point."

## Decided

| Question | Decision |
|---|---|
| Where file bytes live | R2, at `files/{workspaceId}/{sha256}`. The KV record is a manifest (note 48, sections 1–4) |
| Loading | One request: the manifest plus every `.pathogen` file's text. Other file types, when they come, are fetched on demand by hash and cached for good |
| The detail page and forks | A new API Worker route, `GET /approval-source/:id`, as `/approval-svg/:id` serves the SVG |
| Deleting | Saves never delete blobs. Deleting a workspace deletes its prefix and its thumbnails. A sweep script, run by hand, removes blobs no manifest points to |
| Hashes | One rule for every workspace, regenerated in the migration. The dry run checks that every approved, unedited workspace still matches its approval |
| Names | Letters a–z and A–Z, digits, `-`, `_` and `.`, starting with a letter or digit; 100 characters a name, 255 a path; unique without case; `pathogen.json` reserved; no Windows reserved names |
| Limits | `.pathogen` 1 MB a file; data files 5 MB; fonts 20 MB; 50 MB and 500 files a workspace; folders 8 deep. "A fine starting point" |
| Shipping | Committed locally, held until 2e is done, then shipped with the rest of phase 2 (note 48) |

`docs/workspace-files.md` (not yet published) now states the names and limits.

## The plan for the storage code (2b), held until 2e

Each part comes with its tests in `tests/api/`. The tests that pin today's record shape are named in note 38.

1. **One shared module** for the rules both sides apply: the manifest's canonical hash, the name rules and the limits. The server and the playground import the same file, replacing `autosave.ts`'s copy of `hashContent`.
2. **Types** (`website/api/types.ts`):
   - `FileEntry`, and the manifest fields on `Workspace`;
   - `WorkspaceApproval` holds a manifest;
   - `ReviewQueueEntry` without `code`;
   - the snapshot manifest.
3. **Blob helpers:** put a file after checking its hash, get one, and delete a workspace's prefix.
4. **Endpoints** (`website/api/router.ts`, `snapshots.ts`):
   - create; get, with the inlined text;
   - update, which sends the manifest plus changed text, writes blobs first, and doesn't carry over the unchanged-hash shortcut that drops metadata;
   - `GET /workspace/:id/file/:sha256`; copy; delete;
   - submit and approve, which freeze a manifest;
   - the admin approval read; `GET /approval-source/:id`;
   - snapshots: create, get, and restore into a new workspace.
5. **Old-shape reading** for the deploy window: a record without `files` is read as just `main.pathogen`. A save that sends only `code` is accepted for such a workspace and refused for one with more files.
6. **The detail page** (`website/_worker.ts`) reads the source through the new route.
7. **The migration script:** `scripts/migrate-workspace-files-kv.ts`, after `migrate-builtin-names-kv.ts`.
   - A dry run by default; `--write`, `--backup-dir`, and `--confirm` for production.
   - R2 writes through `wrangler r2 object put --remote`.
   - The dry run includes the false-re-review check.
   - Run against production only with your go-ahead.
8. **The sweep script** for unreferenced blobs: a dry run by default.

The playground's side (the store, autosave, the editor) is 2c and 2d. The review screens, publishing and snapshot UI are 2e.
