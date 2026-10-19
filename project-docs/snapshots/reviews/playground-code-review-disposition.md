# Code review — Phase 3 snapshots playground UI, 2026-10-19

Reviewer: `code-reviewer` agent (read-only). Scope: capture service + controller, popover / tray / filmstrip, snapshots view, breadcrumb, preview pane, workspace view, landing delete, api client, sanitizer, raster extraction, docs/snapshots.md accuracy.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | Critical | Closing the popover while saving discarded the capture: revoked card URL went to the tray; a failed upload was swallowed | **Fixed.** Uploading captures are never discarded on close; success with the popover closed → toast with "View snapshots"; failure → popover re-opens at its anchor with Retry and the typed note. Card kept as a Blob; popover / tray / toast each get their own object URL. e2e: close-mid-upload toast + live tray URL; forced upload failure → Retry → saved |
| 2 | Critical | Outside-click used element identity; breadcrumb re-renders replace the button, so toggle-shut broke and typed text was lost | **Fixed.** Snapshot buttons matched by id. e2e: re-render the breadcrumb, press Snapshot → popover closes |
| 3 | Warn | Scratch retry after the workspace was created mislabelled the snapshot and never navigated | **Fixed.** `isScratch` and `createdWorkspace` fixed on the capture; retry reuses the workspace and navigates on success |
| 4 | Warn | Scratch path saves live editor text as workspace code without a stale hint | **Fixed** by showing the edited-line note in the scratch state too (the workspace keeps the latest edits; the snapshot keeps the rendered code — wording says so) |
| 5 | Warn | `_save`/`_undo` could touch the next workspace's state after a switch | **Fixed.** Generation token bumped on workspace switch / teardown; late results report by toast only |
| 6 | Warn | Snapshots view actions mutate state after navigating away | **Fixed.** Load-token guards on rename, delete, note commit, start-workspace |
| 7 | Warn | Route loose ends: `:n` dropped during load; failed load never retried; bare `/snapshots` didn't write `/n` | **Fixed.** URL re-read when the load lands; `_workspaceId` cleared on failure; bare `/snapshots` selects newest and writes `/n` (replace) |
| S | Sugg | Sanitizer: `<style>` @import / external url(); header lists `<use>` | **Fixed.** @import and non-fragment/non-data `url()` stripped from `<style>` and `style=""` (quoted fragments kept — test added); header corrected |
| S | Sugg | Tray cardUrl unescaped; popover's own escapeHtml | **Fixed** (shared `escapeHtml`) |
| S | Sugg | Landing delete awaits the count before confirm() | **Fixed** — 1.5 s cap, then confirms without a count |
| S | Sugg | thumbnail-service refactor | Reviewer confirmed behaviour-identical; no change |

Result: typecheck shows only the 8 pre-existing errors; full suite 6872 passed; e2e 42/42 on the local stack (light + dark).
