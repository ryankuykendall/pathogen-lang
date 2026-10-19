# Workspace Snapshots — primer

Status (2026-10-19): **Phases 0–2 done** — mockups accepted, `docs/snapshots.md` written + reviewed ([reviews/docs-snapshots-disposition.md](reviews/docs-snapshots-disposition.md)), API built + reviewed ([reviews/api-code-review-disposition.md](reviews/api-code-review-disposition.md)). **Next: Phase 3 (playground).**

Phase 2 notes for Phase 3:
- API: `POST/GET /workspace/:id/snapshots`, `GET /snapshot/:sid[/svg|/code|/card]`, `PUT/DELETE /snapshot/:sid`, `POST /snapshot/:sid/workspace`. Both POSTs need header `X-Pathogen-Snapshot: 1`. `GET /workspace/:id` returns `snapshotCount` to the owner. Error codes: `snapshot-sign-in-required` (401), `snapshot-quota-reached` (409), `snapshot-svg-too-large` / `snapshot-code-too-large` (413), `snapshots-unavailable` (503).
- Snapshot files are **owner-only behind the session cookie** (`credentials: 'include'`). `<mini-workspace svg-src>` must fetch with credentials (check how it fetches) or the viewer must fetch and pass the SVG in. The export path parses the SVG into the app's DOM — sanitize first (e.g. `sanitizeSVGFragment`) since the server doesn't.
- Local dev: the local D1 had 0001/0002 applied by hand (empty `d1_migrations`), so 0003 was applied with `wrangler d1 execute --local --file migrations/0003_snapshots.sql`. **Production: run `wrangler d1 migrations apply svg-path-extended-users --remote` (or execute 0003) before the playground UI ships.** The API is safe to deploy without it (count → 0, cascade no-op, snapshot routes → 503).

> **Read first:** [Revised plan (post-mockups)](#revised-plan-post-mockups). It supersedes the original approved plan at the bottom of this file.

- Mockup (interactive, light/dark): `mockups-v1/snapshots-mockup-v1.html`. The same file is in the BBWP index as
  `website/bbwp/2026-10-19-13:33:48--snapshots--capture-and-gallery-mockup.bbwp.html` (`npm run serve:bbwp`).
- Screenshots: `mockups-v1/*-light.png` / `*-dark.png`. Regenerate them with `node project-docs/snapshots/mockups-v1/shoot.mjs`.

## Open questions for the v1 review (answered below)

1. **Capture feedback:** A (instant save + toast with Add note / View / Undo) or B (name popover, Enter to save)?
2. **Fullscreen:** keep the "recent tray" at the bottom right after a capture, or show a toast only?
3. **Filmstrip:** expanded or collapsed by default? Its state is remembered either way.
4. **Quota:** is 500 snapshots per user right? The 12 MB per-SVG cap matches the approval-SVG limit.
5. **Scratch buffer (new idea in the mockup):** should the first snapshot from an unsaved scratch buffer create a workspace automatically, or should it ask?
6. **Toast "Undo":** delete the snapshot just taken. Keep or drop?

## v1 review feedback (user, 2026-10-19)

1. Capture: use **B, the name popover**. No accent color on the Snapshot button border or text; style it like the other toolbar buttons.
2. Fullscreen: **keep the recent tray**. The camera button must not be accent-filled; style it like Refresh.
3. Filmstrip in the workspace footer: **rejected**, it makes the workspace too busy. Rethink how users get to their snapshots.
4. `/snapshots` should be a **child of the workspace**, not a peer of Workspaces.
5. Viewer = mini-workspace on top + filmstrip below. This should be the `/workspace/:id/snapshots` page.
6. Edge states: sensible.

## Mockups v2

- `mockups-v2/snapshots-mockup-v2.html` (BBWP: `website/bbwp/2026-10-19-14:06:28--snapshots--capture-and-gallery-mockup-v2.bbwp.html`)
- Screenshots: `mockups-v2/*.png`. Regenerate with `node project-docs/snapshots/mockups-v2/shoot.mjs`.

Changes: neutral buttons everywhere; the popover is the only capture feedback (naming → saving → saved, with a "View snapshots (n) →" link); the fullscreen popover opens to the left of the camera button; three ingress options (A breadcrumb chip, B split Snapshot button with count, C ⋮ menu item); a single `/workspace/:slugId/snapshots[/:n]` page (mini-workspace + filmstrip + detail/actions row) replaces both the gallery and the viewer modal; edge states moved into the popover.

### Plan deltas implied by v2 (not yet in the plan below)
- No global `/snapshots` route. The route is `/workspace/:slugId/snapshots` (+ `/:n` deep link). `GET /snapshots?workspaceId=` becomes the main query.
- No filmstrip component inside the workspace view. The filmstrip lives only on the snapshots page.
- A per-workspace sequence number `n` (#1, #2…) is needed for URLs and labels.
- Snapshots have a user-editable `name` (default `"<workspace> #n"`) as well as a `note`.

### Open questions (v2)
1. Ingress: A (breadcrumb chip), B (split button), C (⋮ menu), or a combination?
2. Snapshots outlive their workspace (earlier decision), but the page is now a child of the workspace. Where do orphans go? Options: (a) keep them reachable at `/workspace/:deletedId/snapshots` as a read-only page, (b) ask when deleting a workspace ("keep snapshots as a new workspace" / "delete them"), (c) delete with the workspace after all.
3. Quota "Manage snapshots" now has no cross-workspace page to link to. Is a per-workspace view enough, or should the landing page show snapshot counts per workspace?
4. Is a double ⌘⇧S for "save without naming" wanted?

## v2 review answers (user, 2026-10-19)

1. Ingress: **B, the split Snapshot button** (count half opens the snapshots page).
2. Deleted workspaces: **(c) snapshots are deleted with the workspace.** Supersedes the earlier "snapshots outlive the workspace" decision.
3. Cross-workspace quota management: **deferred.**
4. Keyboard shortcut (⌘⇧S, double-press quick save): **deferred.**
5. Snapshots page: stop reinventing the mini-workspace. Remove the prev/next overlay arrows (the filmstrip does that). Move the actions into the breadcrumb header. Remove "Back to editor" (redundant with the breadcrumb). Remove "Download SVG" from the ⋯ menu (Export covers it).

## Mockups v3

- `mockups-v3/snapshots-mockup-v3.html` (BBWP: `website/bbwp/2026-10-19-14:34:17--snapshots--capture-and-gallery-mockup-v3.bbwp.html`)
- Screenshots: `mockups-v3/*.png`. Regenerate with `node project-docs/snapshots/mockups-v3/shoot.mjs`.

Changes: split button `[📷 Snapshot | 12 ›]` with the count updating on save; ingress comparison screen removed; snapshots page = stock `<mini-workspace>` (glass bar + code toggle only), no overlays; breadcrumb `Workspaces / <ws> / Snapshots / <name>` with actions on the right (Copy code · Start new workspace · Export… · ⋯ {Rename, Open in editor (replace code)…, Delete snapshot}); a quiet name/meta/note row under the viewer; filmstrip below; ←/→ steps the filmstrip. Edge states: quota message explains the limit only; new "Delete workspace" confirmation states the snapshot count.

### Plan deltas (cumulative, v2 + v3) — apply when the plan is revised
- No global `/snapshots` route; the route is `/workspace/:slugId/snapshots[/:n]`. `GET /snapshots?workspaceId=` (or `/workspace/:id/snapshots`) is the only listing.
- No filmstrip in the workspace view. The split button's count half needs a cheap snapshot count per workspace (D1 `COUNT(*)` or a counter).
- Per-workspace sequence number `n`, plus a user-editable `name` (default `"<workspace> #n"`) and `note`.
- **`deleteWorkspace` now cascades:** delete the D1 rows and the R2 objects under `snapshots/{userId}/{id}/…` (consider keying R2 by workspace: `snapshots/{workspaceId}/{snapshotId}/…` to make the cascade a prefix delete). The workspace-delete confirmation in the playground shows the count. `workspace_name` no longer needs to be frozen for orphan display.
- No ⌘⇧S shortcut in v1. No cross-workspace quota UI; the server still enforces the 500 cap.
- The snapshots page uses `<mini-workspace>` as-is (`svg-src` pointing at the API, sandboxed iframe). Any viewer chrome beyond that is out of scope.
- Snapshot actions: Copy code, Start new workspace, Export… (existing export modal on the stored SVG), Rename, Open in editor (replace code), Delete. No separate Download SVG.

### Open questions (v3)
1. "Open in editor (replace code)…" replaces the workspace's current code with the snapshot's code. Keep it (it is undoable in the editor), or drop it for v1 and rely on Copy code?

## v3 review answer (user, 2026-10-19)

- **Drop "Open in editor (replace code)…".** Users start a new workspace from a snapshot instead. The snapshots-page ⋯ menu is now just **Rename** and **Delete snapshot**. (The v3 mockup still shows the item; it was not re-rendered for this single removal.)

## Revised plan (post-mockups)

Supersedes the original plan below wherever they differ.

**Scope:** playground-only capture plus a per-workspace snapshots page. Signed-in users only. Snapshots belong to a workspace and are **deleted with it**. Random values are not seeded, so the stored SVG is the faithful record and "Start new workspace" re-rolls. No keyboard shortcut and no cross-workspace management in this version.

**Phase 1 — Docs first.** `docs/snapshots.md` (capture, naming and notes, the snapshots page, start-a-new-workspace and re-rolled randomness, export, limits: 12 MB / 500, deletion with the workspace) + `DOC_FILES` entry + `npm run build:docs`.

**Phase 2 — API.**
- `migrations/0003_snapshots.sql`: `snapshots(id PK, user_id, workspace_id, n, name, note, width, height, background, svg_bytes, code_bytes, seed NULL, created_at)`. `UNIQUE(workspace_id, n)`; index `(workspace_id, created_at DESC)`, `(user_id)`.
- R2 keys `snapshots/{workspaceId}/{snapshotId}/{image.svg|code.pathogen|card.png}`.
- `website/api/snapshots.ts` wired into `handleApiRequest`. All routes require a session and owner-only access (`requireSessionUserId` + workspace ownership).
  - `POST /workspace/:id/snapshots` (FormData + custom preflight header; 12 MB SVG / 1 MB code / 1 MB PNG with magic check; 500 per user; assigns the next `n`)
  - `GET /workspace/:id/snapshots` (list + count)
  - `GET /snapshot/:sid` and `/svg` `/code` `/card`. SVG is served with `image/svg+xml`, `CSP: script-src 'none'; sandbox`, `nosniff`.
  - `PATCH /snapshot/:sid` (name, note)
  - `DELETE /snapshot/:sid`
  - `POST /snapshot/:sid/workspace` (new workspace from the code, mirrors `copyWorkspace`)
- `deleteWorkspace` cascades: delete the D1 rows, then R2 `list({prefix})` + delete. `GET /workspace/:id` (or the list) returns `snapshotCount` for the split button and the delete confirmation.

**Phase 3 — Playground.**
- Store: `renderedCode` set only on a successful render (`workspace-view.ts` `updatePreview()`), plus `snapshotCount`.
- Capture service `services/snapshot-capture.ts`: clone the preview synchronously, then run `utils/export-svg-prep.ts` (extracted from `export-modal.ts`: prepare-clone, optimize, embed fonts), serialize, and make a 512 px card PNG via the thumbnail worker. Uploaded through `snapshotApi` in `services/api.ts`.
- Components (storybook-first in `components/shared/`):
  - `snapshot-split-button` (breadcrumb `controls-left`, replacing nothing)
  - `snapshot-popover` (naming / saving / saved / error states from mockup v3 screens 1 and 4)
  - `snapshot-tray` (fullscreen, bottom right)
  - a neutral round camera button in `svg-preview-pane.ts` `#chrome-right`
- Route `/workspace/:slugId/snapshots` and `/:n` → `components/views/workspace-snapshots-view.ts`:
  - breadcrumb with actions: Copy code · Start new workspace · Export… · ⋯ {Rename, Delete snapshot}
  - stock `<mini-workspace>` fed by `svg-src` (sandboxed iframe; verify flags) and the code
  - name / meta / note row
  - filmstrip (`snapshot-filmstrip`) with ←/→, Newest / Oldest / With-notes
- Export from a snapshot: parse the stored SVG into an element and synthesize the modal state from the record. **The legend's Source Code block must use the snapshot's code, not the editor's** (docs promise this). The grid option is unavailable for snapshots (stored SVG has no grid).
- **Start new workspace** names the workspace `<workspace> — <snapshot name>` (or just the snapshot name when it already starts with the workspace name, i.e. the default `<workspace> #n`) and navigates to it in the editor (docs review item 14; matches mockup v3 tooltip). The snapshot stays with the source workspace.
- Popover keys: **Enter** in the name field saves; in the note, Enter adds a line and **⌘/Ctrl+Enter** saves; Esc cancels (docs review item 20a).
- Copying a workspace (`copyWorkspace`) does **not** copy snapshots.
- Snapshot button is **disabled on any compile error** (docs review item 7, option A, matches mockup) as well as while compiling/rendering.
- Workspace delete confirmation (landing page kebab + any other delete path) states "This also deletes its N snapshots."

**Phase 4 — Tests and verification.** API tests (`tests/api/snapshots.test.ts`): auth, ownership, limits, CSP headers, `n` sequencing, cascade on workspace delete, new-workspace-from-snapshot. Playground tests: `renderedCode` pairing, capture SVG == export SVG. End-to-end on `dev:stack`, with light/dark screenshots in `project-docs/snapshots/verify/`, then code-reviewer and content-reviewer. Deploy: apply D1 migration `0003` remotely before the API deploy.

## Approved plan (original, copied from the plan-mode file)

# Workspace Snapshots — plan

## Context

While making art, the user's loop is: tweak code → wait for render → (refresh to re-roll `random()`) → Export modal ×3 (SVG/PNG/PDF) → back to the workspace → repeat. Exporting is the only way to keep a variation, and it is slow and loses the code that produced it.

**Goal:** one button (normal toolbar + fullscreen chrome) captures the rendered SVG **plus the exact code that produced it** into Cloudflare. A gallery (workspace filmstrip + `/snapshots` page) previews snapshots in `<mini-workspace>` **without recompiling**. From a snapshot the user can export (SVG/PNG/PDF), copy code, or start a new workspace.

**Decisions (from the user):**
- No seed exists (`random` = `Math.random()`, `src/stdlib/math.ts:185`). **The stored SVG is the faithful record.** "Start workspace from snapshot" copies the code, and random parts re-roll. Seeded random is a separate later language feature. The snapshot record reserves a nullable `seed` field so it can slot in.
- Gallery = **both** a collapsible filmstrip inside the workspace and a global `/snapshots` route.
- **Signed-in users only.** Snapshots **outlive** their workspace: they store `workspaceName` at capture time, and `workspaceId` may dangle.
- Snapshot button in **both** the breadcrumb controls and the fullscreen `#chrome-right`. Post-click behavior defaults to **instant save + toast** ("Snapshot saved · Add note · View"). The mockups show a name-popover variant for comparison.

**Scope:** playground-only. The CLI and VS Code have no cloud workspaces, so this is not three-surface drift. No language/compiler change, so no `docs/` language page. A user-facing `docs/snapshots.md` (how to capture/browse/fork, limits) is still written first and registered in `DOC_FILES`.

## Phase 0 — Mockups (review gate, no code)

HTML mockups in `website/bbwp/snapshots-mockups.html` (light + dark), copied to `project-docs/snapshots/mockups-v1/`, with PNG captures:
1. Workspace toolbar with Snapshot button (camera icon, `⌘⇧S`). Capture moment: toast variant A vs name-popover variant B.
2. Fullscreen chrome with Snapshot button + toast.
3. Workspace filmstrip (collapsed / expanded, newest first, count badge, "View all →").
4. `/snapshots` page: card grid (thumbnail, workspace name, note, relative time), workspace filter, empty state.
5. Snapshot detail modal: `<mini-workspace>` (code toggle), prev/next arrows + ←/→ keys, actions: Export…, Copy code, Start new workspace, Edit note, Delete.
6. Quota-reached and signed-out states.

Save `project-docs/snapshots/primer.md` (this plan + decisions). **Get user sign-off before Phase 1.**

## Phase 1 — Docs first
- `docs/snapshots.md` + register in `scripts/build-docs.ts` `DOC_FILES`; `npm run build:docs`.

## Phase 2 — API (Worker)

**Storage**
- D1 migration `migrations/0003_snapshots.sql`: `snapshots(id TEXT PK, user_id FK, workspace_id, workspace_name, note, width, height, background, svg_bytes, code_bytes, seed NULL, created_at)`, index `(user_id, created_at DESC)` and `(user_id, workspace_id, created_at DESC)`.
- R2 (`THUMBNAILS` bucket, prefix `snapshots/{userId}/{id}/`): `image.svg`, `code.pathogen`, `card.png` (512px).

**Endpoints** — new `website/api/snapshots.ts`, wired into `handleApiRequest` (`website/api/router.ts:1738`) before the admin block. All use `requireSessionUserId` (`website/auth/handlers.ts:297`) and are owner-only.
- `POST /snapshots` — FormData `svg`, `code`, `card` + JSON `meta`. **Requires a custom header** (e.g. `X-Pathogen-Snapshot: 1`, added to `api/src/cors.ts` allowed headers) to force a CORS preflight, because FormData is otherwise a "simple" request. Limits: SVG ≤ 12 MB (reuse the `SVG_MAX_BYTES` pattern, checked on bytes), code ≤ 1 MB, card PNG ≤ 1 MB with magic-byte check, **per-user cap (e.g. 500 snapshots)** → 409 with a clear message.
- `GET /snapshots?workspaceId=&cursor=&limit=` — paginated metadata from D1.
- `GET /snapshot/:id` (meta), `GET /snapshot/:id/svg`, `/code`, `/card`. The SVG is served with `Content-Type: image/svg+xml`, `Content-Security-Policy: script-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, private cache.
- `PATCH /snapshot/:id` (note), `DELETE /snapshot/:id` (D1 row + 3 R2 objects).
- `POST /snapshot/:id/workspace` — create a workspace from the snapshot code. Mirrors `copyWorkspace` (`router.ts:582`), with the name `"<workspaceName> (from snapshot)"`.
- `deleteWorkspace` is **not** changed (snapshots outlive it).

## Phase 3 — Playground

**Correct pairing of code ↔ SVG (critical)**
- Add `renderedCode: string` (+ `renderedCompilationId`) to `types/store.d.ts` / `state/store.ts`. Set it in `workspace-view.ts` `updatePreview()` (`:1060`) only on a **successful** render, using the code string that was compiled, not the live editor text.
- Snapshot button is disabled while `compilationStatus` is `compiling|rendering|error`. Tooltip explains why. If `code !== renderedCode` (unsaved edits since render), still capture the **rendered** code and note it in the toast.

**Capture pipeline** — new `playground/services/snapshot-capture.ts` (avoid clashing with existing `utils/svg-snapshot.ts` / `createSvgSnapshot`):
1. **Synchronously** clone `previewPane.preview` via `createSvgSnapshot(...)` and read `store.getAll()` (preview is cleared in place on workspace switch; same constraint as `buildRenderSnapshots` in `services/thumbnail-service.ts`).
2. Extract `_prepareExportClone` (and `_embedFonts`, `_optimizeArtworkPaths`) out of `components/export-modal.ts` into `playground/utils/export-svg-prep.ts`. Export modal calls the util (behavior unchanged); capture reuses it so stored SVG == exported SVG.
3. Async on the clone: embed fonts → serialize → rasterize a 512px card PNG via the existing thumbnail worker (`workers/thumbnail.worker.ts`).
4. Upload via new `snapshotApi` in `services/api.ts` (credentials + custom header). Toast on success/failure (no silent failures; quota and auth errors spelled out).

**UI**
- Shared components, storybook-first (`utils/storybook-registry.ts` entries as spec): `components/shared/snapshot-card.ts`, `snapshot-strip.ts`, `snapshot-viewer.ts` (modal wrapping `<mini-workspace>`, prev/next).
- Buttons: `#snapshot-btn` in `app-breadcrumb.ts` `controls-left` (always visible when signed in, next to Refresh), plus `svg-preview-pane.ts` `#chrome-right`. Both dispatch `capture-snapshot`, handled in `workspace-view.ts` like `_handleOpenExport`. Shortcut `⌘/Ctrl+⇧+S` in `_handleKeydown`.
- Filmstrip below the preview in `workspace-view.ts`, collapsible, state remembered in preferences.
- Route `/snapshots` in `utils/router.ts` → `components/views/snapshots-view.ts`. Register in `app-shell.ts` (render + `isViewActive` map). Grid styling follows `landing-view.css` `.workspace-list.grid`. Link from the landing page and the workspace overflow menu.
- **Preview safety:** never string-concatenate user SVG into markup (the admin-moderation pattern). The viewer feeds `<mini-workspace>` via `svg-src` pointing at the API URL, rendered in `<mini-preview>`'s sandboxed iframe. Verify its sandbox flags (no `allow-scripts` + `allow-same-origin` together). Card thumbnails are `<img>` PNGs.
- **Export from a snapshot:** `export-modal.open(svgEl, state)` takes a live element + store. The viewer parses the fetched SVG into an element and synthesizes `{background, gridEnabled:false, gridColor, width, height, …}` from the snapshot record (the record stores exactly the fields the modal reads). SVG/PNG/PDF then work unchanged.

## Phase 4 — Tests
- `tests/api/snapshots.test.ts` (pattern: `tests/api/approval-svg.test.ts` with in-memory `MemoryR2`, `tests/auth/helpers.ts` `MemoryKV`/`MemoryD1`): auth required, owner-only access, size limits, PNG magic check, quota, CSP headers, delete removes R2 objects, survives workspace delete, create-workspace-from-snapshot.
- Playground unit tests: `renderedCode` only updates on successful render; capture util output equals export-modal SVG output for the same input (guards the extraction).
- `npm run typecheck:playground`, `npm run test:run`.

## Verification (end-to-end)
1. `wrangler d1 migrations apply svg-path-extended-users --local`; `npm run dev:stack`; `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`.
2. Signed in at localhost:3000: open a random-using workspace → Snapshot, Refresh, Snapshot (button + fullscreen + shortcut) → filmstrip shows both, different images.
3. Edit code without letting it render → snapshot stores the rendered code (verify via `/snapshot/:id/code`).
4. Open the viewer: no network compile, code toggle works, ←/→ navigates, Export produces SVG/PNG/PDF identical to exporting from the workspace.
5. Start new workspace from snapshot → opens with the snapshot code. Delete the original workspace → snapshots still listed on `/snapshots`.
6. Upload an SVG containing `<script>`/`onload` via curl → never executes (CSP + sandbox).
7. Light + dark theme screenshots into `project-docs/snapshots/verify/`.
8. code-reviewer + content-reviewer (docs) before commit.

**Deploy note:** D1 migrations are manual. Run `wrangler d1 migrations apply svg-path-extended-users --remote` **before** the API deploy reaches production.

## Follow-ups (not in v1)
- Seeded `random()` (language feature: docs, all three surfaces) → fill `seed`, making fork reproduce the image exactly.
- Batch export of selected snapshots (zip).
