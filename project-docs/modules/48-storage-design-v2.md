# Phase 2 storage design v2: every file a blob

2026-11-07, step 2b. Replaces the proposal in `47-storage-design.md`, which is kept as it was. The parts of 47 not mentioned here still stand: the empty-folder list, `entryPoints`, a save sending the whole workspace with one `rev`, queues without code, and the deploy order.

## Your answers, in your words

1. On the `docs/projects.md` and `docs/cli.md` changes: "Yes, this is approved"
2. On keeping the page in `docs/` without registering it: "This is fine"
3. On when multi-file workspaces reach users: "Let's wait to push this until we complete 2e and then we can ship everything."
4. On a read-only production export to measure sizes: "I think this is overkill...the full radial bar chart in one of the blog posts is just under 600 lines including the data used to generate the visualization. I think the critical file limitations will be caused by .json, .csv, or even font files. So we should come up with limits based on what we can reasonably handle with those."
5. On note 47:
   - "If we are committed to migrating to blobs, we should do that now rather than later."
   - "The name rules are fine, but let's not allow spaces"
   - On keeping the old hash: "What's the cost/risk of regnerating these?"

## Decided

| Question | Decision |
|---|---|
| The `entryPoints` docs | Approved, with the check split |
| The playground page | `docs/workspace-files.md`, not in `DOC_FILES` until the UI ships |
| Shipping | Phase 2's storage, API, compile path and UI (2b's code through 2e) stay unpushed until 2e is done, then ship together. **My reading:** the `entryPoints` change to the CLI and its docs isn't part of that, since question 1 approved pushing it with its docs. It is pushed before any held commit, because after the first held commit nothing on main can be pushed |
| Measuring production | Not done. The limits come from what data files and fonts need (section 6) |
| Spaces in names | Not allowed (section 5) |

## One correction first

Note 47's mixed design wouldn't have needed a later migration for `.pathogen` files. They would have stayed inline for good, and only the new file types would have used R2. So the choice was really **one storage path or two**. Your answer picks one: every file is a blob in R2, starting now, with `.pathogen` files as its first users. Data files and fonts then add types, not a second mechanism.

## Summary

| | Note 47 | v2 |
|---|---|---|
| A file's bytes | inline text in the KV record (`.pathogen`); R2 later for other types | always in R2, at `files/{workspaceId}/{sha256}` |
| The KV record | files with their text | a manifest: each path's `sha256` and `size` |
| Loading | one KV read | one KV read and parallel R2 reads in the API Worker; the playground still makes one request |
| Saving | the whole record | changed files' text plus the manifest; blobs are written first |
| Snapshots | a JSON copy of the workspace | a manifest that shares the workspace's blobs |
| The hash | the old hash kept for a just-`main.pathogen` workspace | one rule for every workspace, regenerated in the migration |
| Names | spaces allowed | letters, digits, `-`, `_` and `.` only |
| Limits | one table for `.pathogen` | per file type, set by data files and fonts |

## 1. The manifest and the blobs

```ts
interface FileEntry {
  sha256: string; // the full SHA-256 of the file's bytes
  size: number;   // bytes
}

interface Workspace {
  // ...every field it has today, except code...
  files: Record<string, FileEntry>; // "main.pathogen", "parts/gears.pathogen"
  folders: string[];                // only folders with no files under them (note 47)
  entryPoints: string[];            // note 45
  contentHash: string;
  rev: number;
}
```

- **Each file's bytes are in R2 at `files/{workspaceId}/{sha256}`.** The file type comes from its extension.
- **Keyed under each workspace, not one global store:**
  - reads are checked against the workspace's own permissions, so a private workspace's files stay private;
  - nobody can probe whether another user holds a file;
  - deleting a workspace deletes its prefix.

  Two identical files in one workspace, and every snapshot of it, share one blob. A fork copies the blobs it needs to its own prefix.

## 2. Loading

- **`GET /workspace/:id` returns the manifest plus the text of every `.pathogen` file.** The API Worker reads them from R2 in parallel, so the playground still loads a workspace with one request. For a few dozen files that adds a few tens of milliseconds.
- **Data files and fonts, when they come,** aren't inlined. The playground fetches each one on demand from `GET /workspace/:id/file/:sha256`, which checks permissions. The response can be cached by the browser for good (`Cache-Control: private, max-age=31536000, immutable`), since content-addressed bytes never change.

## 3. Saving

- **Autosave sends the manifest, plus the text of each `.pathogen` file whose hash changed:** `{ files, texts: { sha256: text }, folders, entryPoints, baseRev }`. The server then:
  1. checks `baseRev`;
  2. checks that each text hashes to its key;
  3. writes the new blobs;
  4. checks that every other referenced blob exists;
  5. writes the manifest and bumps `rev` once.
- **Blobs are written before the manifest.** A failed save can leave a blob nothing points to, but never a manifest that points to a missing blob.
- **Uploads of data files and fonts** (later) go first to `PUT /workspace/:id/file/:sha256`, which checks the hash and the size limit. The file joins the manifest with the next save.
- **A save never deletes a blob.** A snapshot or the approval may still point to an old version of a file.
  - Deleting a workspace deletes its whole `files/{id}/` prefix. The thumbnails are deleted at the same time, which fixes today's leak (note 38).
  - A sweep script, run by hand, deletes blobs that no manifest points to (the workspace's, its snapshots', its approval's). Storage is cheap enough that the sweep can wait.

## 4. Approvals, queues, snapshots, forks and the detail page

- **An approval** freezes a manifest (files, folders, entry points) and its `codeHash`. Its blobs stay under the workspace's prefix, which saves never delete.
- **Review queues** drop code (note 47). The admin review screen loads the files through the API.
- **A snapshot** stores a manifest at `snapshots/{workspaceId}/{snapshotId}/manifest.json` in place of `code.pathogen`, pointing at the workspace's blobs. An unchanged file costs a snapshot nothing. D1's `code_bytes` is the total size. Restoring one makes a new workspace and copies the blobs it needs.
- **The detail page and `source.json`.** The Pages worker has no R2 binding on purpose (`wrangler.toml:26-29`). Both get the approval's files from a new API Worker route, `GET /approval-source/:id`, as the page already gets its SVG from `/approval-svg/:id`. That route serves the source listing, the line count and forks.

## 5. Names

Per your answer, no spaces. Note 47's list of forbidden characters becomes a shorter list of allowed ones:

- **Letters a–z and A–Z, digits, `-`, `_` and `.`,** starting with a letter or a digit. That rules out spaces, `/` inside a name, everything Windows forbids, and `.` and `..`.
- **ASCII only.** Some accented letters, `é` among them, can be stored two ways, and macOS and Windows don't always keep the way you typed. After an export, an `import` path could then stop matching its file. Wider character sets can come later with their own rule.
- Unchanged from note 47:
  - 1–100 characters per name, 255 per path;
  - not Windows' reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`);
  - unique without case in a folder;
  - `pathogen.json` reserved in every folder;
  - `.pathogen` files only in phase 2.

## 6. Limits, set by data files and fonts

The largest real program is post 16's complete radial chart: 587 lines and 21.7 KB, data included (`website/blog/samples/post16/radial-chart-complete.pathogen`). As you said, programs won't be what sets the limits.

| | Per file | Why |
|---|---|---|
| `.pathogen` | 1 MB | 45 times the largest real program. It only catches accidents, such as generated data pasted into a program |
| Data: `.json`, `.csv`, `.tsv`, `.txt`, `.svg` (later) | 5 MB | A loop stops at 32,000 iterations (`MAX_ITERATIONS`, `src/evaluator/index.ts:83`), so one loop can't walk more than 32,000 rows. At about 100 bytes a row, that's about 3 MB of CSV. 5 MB leaves room for wider rows and for JSON's extra punctuation |
| Fonts: `.ttf`, `.otf`, `.woff`, `.woff2` (later) | 20 MB | Most fonts are under 1 MB, and variable fonts a few MB. Fonts that cover Chinese, Japanese or Korean run to about 5–20 MB |

| | Per workspace | Why |
|---|---|---|
| Total size | 50 MB | It all loads into the browser tab and its compile worker: room for two large fonts and a handful of data files |
| Files | 500 | The manifest stays under about 50 KB in KV, and the tree is windowed |
| Folder depth | 8 | |

The server enforces each limit with a message that names it. The playground checks first, so a save or an upload never fails without saying why. These sit well inside the platform's own limits: 100 MB per request to a Worker, 128 MB of Worker memory to hash a 20 MB font, and 25 MiB per KV value for a manifest of about 50 KB.

## 7. The hash, and what regenerating costs

**The rule:** `contentHash` is `hashContent` of a canonical form of the manifest:
- files sorted by path, each as `[path, sha256]`;
- then `entryPoints` in its order;
- then `folders`, sorted.

It's one rule for every workspace. The client imports the same module the server uses (note 47).

**What regenerating every hash costs.** You asked; here it is.

- **The work is small.** The migration rewrites every workspace, approval and queue record anyway, for the new shape. Recomputing `contentHash` and `codeHash` happens in the same pass, as both earlier migrations did (`migrate-style-opener-kv.ts`, `migrate-builtin-names-kv.ts`).
- **The real risk is false re-reviews.**
  - Every save compares the new `contentHash` with `approval.codeHash` and queues a re-review when they differ (`router.ts:529-534`). If the two were recomputed by different code, or from different records, all 20 approved workspaces would land in re-review at their next save.
  - **Mitigation:** one function computes both, in the same pass. The dry run then checks that every approved workspace that hasn't been edited since its approval still matches.
- **D1's history mixes formats, harmlessly.** `workspace_publication_states.code_hash` is append-only, so old rows keep old-format hashes. Nothing compares them; they're only shown in the admin audit trail (`moderation.ts:88-123`).
- **Open tabs:** a tab open across the change holds an old hash. At worst it sends one save that the server finds unchanged. `rev` isn't bumped, so no conflict banner appears.

**Recommendation: regenerate.** With blobs the rule changes anyway. Keeping old hashes would need note 47's special case, a second formula kept for good, to save a few lines of migration that's being written regardless.

## 8. Migration

It follows note 47 (the `migrate-builtin-names-kv.ts` pattern, dry run by default, production behind your go-ahead), with these changes:

- **Workspaces:** each `code` becomes a blob at `files/{id}/{sha256}`. The record becomes a manifest with `"main.pathogen"`, `folders: []` and `entryPoints: ["main.pathogen"]`. `contentHash` is regenerated; `rev` isn't bumped.
- **Approvals:** the frozen code becomes a blob under the workspace's prefix (often the same blob as the live one), and the record becomes a manifest. `codeHash` is regenerated.
- **Queues:** `code` is dropped and `codeHash` regenerated.
- **Snapshots:** each `code.pathogen` becomes a blob plus `manifest.json`. `code_bytes` is unchanged.
- **R2 writes** go through `wrangler r2 object put --remote`, one per blob: about 250 objects, judging by the last count of records.
- **The dry run's report** lists each record before and after, and runs the false-re-review check from section 7.
- **At shipping:**
  1. The new API reads both shapes: a record without `files` is read as just `main.pathogen`, so the push is safe before the migration.
  2. The migration runs.
  3. A later cleanup removes the old-shape reader.

## Questions

1. **The blob design** in sections 1–4: keyed per workspace, `.pathogen` text inlined in the load response, the detail page reading through an API Worker route, and saves that never delete, with a sweep script?
2. **Regenerate every hash** (recommended), or keep note 47's special case?
3. **Names:** ASCII letters, digits, `-`, `_` and `.` (recommended), or a wider set?
4. **The limits** in section 6?
