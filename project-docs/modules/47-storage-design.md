# Phase 2 storage design: a workspace that holds files

> **Amended 2026-11-07:** after your answers, `48-storage-design-v2.md` replaces sections 1 (every file is a blob in R2), 3 (no spaces), 4 (every hash regenerated), 6 (snapshots as manifests), 7 (limits by file type) and parts of 8. The rest stands.

2026-11-07, step 2b, for your approval. The facts about today's code were checked by a read-only survey the same day. Every reference in `38-phase-2-audit.md`'s storage section still holds. Decisions it builds on: notes 39 to 46.

## Today, in brief

- **The record:** `workspace:{id}` in the `WORKSPACES` KV holds `code`, `contentHash` and `rev` (`website/api/types.ts:110-125`). Approvals (`approval:{id}`, `types.ts:195-225`) and both review queues (`queue:review`, `queue:rereview`: one JSON array each, `types.ts:184-193`) each hold a full copy of the code.
- **Snapshots** keep their code in R2, at `snapshots/{workspaceId}/{snapshotId}/code.pathogen` (`snapshots.ts:111-125`), with its size in D1's `snapshots.code_bytes`. "Restore" makes a new workspace from it (`snapshots.ts:573-612`).
- **Only the API Worker can reach R2.** The Pages config removes the binding (`wrangler.toml:26-29`). The detail page reads `approval.code` from KV for its source listing and for `source.json`, which forks use (`_worker.ts:473-527, 597, 780`).
- **Hashes:**
  - `hashContent` is SHA-256 cut to 16 hex characters (`utils.ts:19-28`). It has an identical client copy (`autosave.ts:21-30`), plus copies in the two migration scripts.
  - `approval.codeHash` is compared with `contentHash` on every save, to queue a re-review (`router.ts:529-534`).
  - D1 `workspace_publication_states.code_hash` is append-only.
  - The thumbnail uses a third, client-only hash (`workspace-view.ts:596, 1435-1444`).
- **No sizes are recorded** anywhere. The largest stored program is known only by its command count (1,926,648, `35-phase-1a-step7.md:15`). The last count was 220 records: 194 workspaces, 20 approvals and 6 queue entries.

## Summary

| | Today | Proposed |
|---|---|---|
| The record | `code: string`, `contentHash`, `rev` | `files: { path: FileEntry }`, `folders`, `entryPoints`, `contentHash`, `rev` |
| A file's text | the one `code` string | inline in the record (`FileEntry.text`), for every `.pathogen` file |
| Later file types (.json, .csv, .svg, fonts) | — | the same entry shape, with the bytes in R2 by hash instead of `text`. Not built in phase 2 |
| Empty folders | — | `folders`: only the folders with no files under them |
| The hash | `hashContent(code)` | the same for a workspace that is just `main.pathogen`; otherwise a hash of a canonical form |
| A save | the whole code string | the whole workspace, one `rev` |
| Limits | none for code on the server | file count, file size and total size, on the server and the client |
| Migration | — | every stored record gains `files` and `entryPoints`; hashes don't change |

## 1. Inline text now, blobs later, one shape

The decision log leaned toward a manifest plus content-addressed blobs in R2 (decision 13: "lean yes; needs API design"). The case for blobs is real, but most of it arrives after phase 2:

- **For blobs:**
  - review queues and approvals would hold a small manifest, not every file's text;
  - snapshots and forks would share unchanged files;
  - and data files and fonts can be large, or binary.
- **For inline text:**
  - one KV read loads the workspace, and one write saves it, atomically, with today's `rev` check;
  - no blob can be orphaned or missing;
  - the Pages worker, which has no R2 binding, can still serve the detail page's source;
  - stored programs are small (sizes to be measured; see question 1).

**Recommendation: one entry shape that allows both, and in phase 2 only inline text.**

```ts
interface FileEntry {
  /** The file's text. Every .pathogen file in phase 2. */
  text?: string;
  /** Later: the bytes are in R2 under this hash (a full SHA-256), for data files and fonts. */
  blob?: { sha256: string; size: number; type: string };
}
```

When data files and fonts arrive, they use `blob`, and nothing that reads `.pathogen` files changes. The queue-size problem is solved separately (section 6): queue entries stop carrying code.

## 2. The record

```ts
interface Workspace {
  // ...every field it has today, except code...
  /** Every file, by its path: "main.pathogen", "parts/gears.pathogen". */
  files: Record<string, FileEntry>;
  /** Folders with no files under them: "examples". Other folders come from the file paths. */
  folders: string[];
  /** The programs in order, the main first (pathogen.json's entryPoints). */
  entryPoints: string[];
  contentHash: string;
  rev: number;
}
```

- **Paths** are written as `pathogen.json` writes them: relative to the workspace, with forward slashes and no `./` (`parts/gears.pathogen`). The compiler's project paths add a leading `/`; the playground's host adds it when it reads.
- **`folders` is kept minimal.** A folder that gains a file leaves the list; a folder whose last file is deleted joins it, so it survives as an empty folder (your v5 decision). Every save normalizes it, so equal workspaces have equal records.
- **`entryPoints` follows note 45.** Programs only, the main first, upkept by the playground. It can be empty only when the workspace has no programs. The server checks that each entry is a file in `files`. It doesn't check that it's a program, since that needs a parse.
- **`pathogen.json` isn't stored.** It's written from `entryPoints` whenever it's shown or exported. An empty list is written as `{}`, so the file is always one the CLI accepts (`docs/projects.md` makes `"entryPoints": []` an error).
- **`code` goes.** During the deploy window it is still returned, as the main's text, for clients that haven't reloaded (section 8).

## 3. Names

Recommended rules, checked on the server and in the playground. The CLI already enforces its own rules for paths on disk.

- Each folder name and file name: 1 to 100 characters, and a full path at most 255.
- Not allowed:
  - `/` inside a name;
  - `\ : * ? " < > |` and control characters (Windows can't hold them, so an exported zip would fail to unpack);
  - a name that starts or ends with a space or a dot;
  - the names `.` and `..`;
  - Windows' reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), with or without an extension.
- Spaces inside a name are allowed: `import { x } from "./my parts/gear.pathogen";` already works in the CLI.
- Files end in `.pathogen` in phase 2.
- **Unique without case** within a folder (v5).
- **`pathogen.json` is reserved** in every folder (note 45).

## 4. The hash

Today `contentHash = hashContent(code)`, SHA-256 cut to 16 hex characters. The client keeps its own copy of the rule (`playground/services/autosave.ts:21-30`).

**Recommendation:**

- **A workspace that is just `main.pathogen`** keeps `hashContent(code)`. That's every stored workspace today, so:
  - no `contentHash`, `approval.codeHash` or D1 `code_hash` changes in the migration;
  - re-review never fires because of it;
  - the append-only D1 history keeps one format.

  "Just `main.pathogen`" means: one file, named `main.pathogen`, with `entryPoints` `["main.pathogen"]` and no empty folders.
- **Any other workspace** hashes a canonical JSON form:
  - files sorted by path, each as `[path, text]`;
  - then `entryPoints` in its order;
  - then `folders`, sorted.
- **One rule, one module.** The client stops copying the rule and imports the same pure module the server uses, so the two can't drift.

## 5. Saving

- **A save sends the whole workspace:** `files`, `folders` and `entryPoints`, with `baseRev`. The server replaces the record and bumps `rev` once. With the size limits below, this stays small, and it keeps the record consistent without a per-file merge.
- **One `rev` per workspace** (38, Q9). Two tabs editing different files still conflict, as two tabs editing one file do today. The two-tab banner covers it.
- **The update endpoint's carry-over** (when a save has no `code`, it keeps `code`, `contentHash` and `rev`: `router.ts:488-496`) now carries `files`, `folders` and `entryPoints`.

## 6. Approvals, queues, snapshots and forks

The shapes are decided here; the work is step 2e.

- **Approvals** freeze `files`, `folders` and `entryPoints` with `codeHash`, as they freeze `code` today.
- **Review queues** (`queue:review`, `queue:rereview`) stop carrying code. Each entry keeps the workspace id, `codeHash` and its metadata, and the review screen reads the files from the approval or the workspace. This keeps one KV array per queue far from the 25 MiB cap, however many files a workspace holds.
- **Snapshots** store the workspace (files, folders, entry points) as one JSON object in R2, `snapshots/{workspaceId}/{snapshotId}/workspace.json`, next to today's `code.pathogen`, with its total size in D1's `code_bytes`. Older snapshots keep `code.pathogen` and are read as a workspace that is just `main.pathogen`, so no snapshot needs migrating. Restoring one makes a new workspace with every file.
- **Forks:** `source.json` returns the files, and a fork copies them all. The detail page lists the files, the main first (38, Q12). It keeps reading the approval from KV, which is one reason the text stays inline (section 1).
- **`?state=` links** keep working for single-file workspaces only (38, Q12).

## 7. Limits

To be set from the measured sizes (question 1). A starting point:

| Limit | Proposed | Why |
|---|---|---|
| Files per workspace | 200 | a tree of that size is still usable; the tree is windowed anyway |
| One file | 512 KB | far above any hand-written program |
| The whole workspace | 1 MB | matches today's snapshot cap, so every workspace can be snapshotted |
| Folders deep | 8 | |

The server returns a message naming the limit, and the playground checks first, so you're told before a save fails (the "+" menu, uploads and the editor).

## 8. Migration and deploy order

- **The migration** follows `scripts/migrate-builtin-names-kv.ts`, the safer of the two precedents:
  - a dry run by default, and `--write` to write;
  - `--backup-dir` required for a write;
  - production behind `--confirm` and your go-ahead;
  - keys listed by prefix;
  - each record re-read and compared before it's written;
  - values written through a temp file. `migrate-style-opener-kv.ts` passes them on the command line, which a large record would overflow.
- **What it rewrites:** the same four key families, `workspace:*`, `approval:*`, `queue:review` and `queue:rereview`. `code` becomes `files: { "main.pathogen": { text: code } }`, `folders: []` and `entryPoints: ["main.pathogen"]`. Queue entries drop `code` (section 6).
- **No hash changes** (section 4), and **no `rev` bump.** The content is the same, so a tab that was open across the migration can still save without a conflict.
- **Deploy order.** The API Worker and the Pages site deploy separately, and a browser can hold the old playground for a while.
  1. The API learns the new shape first. It reads and writes both, and still returns `code`, the main's text, for old clients.
  2. The migration runs.
  3. The playground switches to `files`.
  4. A save that sends only `code` is still accepted while the workspace is just `main.pathogen`. On a workspace with more files, it's refused, with a message to reload, so an old tab can't wipe the other files.
  5. A later cleanup stops returning `code`.

## Found along the way (today's code, not phase 2)

These sit beside the found-along-the-way list in note 38, all of which still holds:

- **Deleting a workspace leaves its `queue:rereview` entry** (`router.ts:576-584` calls only `removeFromReviewQueue`), with its frozen code. Approving that entry later fails with a 404 (`:1021`).
- **A save whose code hash is unchanged returns early** (`router.ts:458-459`). Any name, description or preferences sent in the same request are dropped. The SPA sends them separately today, so nothing is lost yet, but the multi-file save must not inherit the shortcut.
- **The thumbnail hash is seeded from `workspace.thumbnailContentHash`, which the server never writes** (`workspace-view.ts:530`). This was already in note 38; it matters again here because that hash will cover every file.

## Questions

1. **A read-only export of production, to measure sizes** (needs your go-ahead, as every production read does): `npx tsx scripts/export-workspace-sources.ts --env prod --confirm` writes to the gitignored `tmp/kv-sources/prod`. I'd measure:
   - the largest program;
   - the 95th percentile;
   - the total per workspace;
   - the size of each review queue.

   Then I'd set the limits and confirm inline text, and delete the export when you say so.
2. **Inline text now, with room for blobs later** (recommended), or blobs from the start?
3. **The name rules** in section 3, spaces allowed (recommended)?
4. **Keeping the old hash** for a workspace that is just `main.pathogen` (recommended), or rehashing everything in the migration?
