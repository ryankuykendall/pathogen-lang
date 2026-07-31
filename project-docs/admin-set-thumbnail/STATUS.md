# Admin "Set thumbnail" from moderation workflows — STATUS

**Date:** 2026-07-31
**State:** Implemented; unit tests + full suite green; agentic review complete (2 warnings fixed in-session); manual E2E pending.

## What shipped

Admins can now enter the interactive Set Thumbnail crop workflow from the
**Approved** and **Featured** tabs of `/admin/moderation`, targeting
workspaces they don't own. The modal renders the **frozen approval code**
(same source as "Regenerate preview") and saves as `kind=manual`, which
takes precedence over the auto layer on all public reads. Auth rides the
session cookie via the existing session-admin bypass in `uploadThumbnail`
(`website/api/router.ts`) — **no API changes**.

### Changes

- `playground/components/thumbnail-crop-modal.ts`
  - `open(svgElement, storeState, options?)` — new optional
    `{ workspaceId, context: 'owner'|'admin', title }`; 100% backward
    compatible (owner call site unchanged).
  - Admin context: Clear button hidden (DELETE is owner-only), no
    `workspaceManualThumbnailAt` store write, admin toast copy. Targeting
    resets in `close()`. New `isOpen` getter. Header shows the target
    workspace name via `title`.
- `playground/components/views/admin-moderation-view.ts`
  - **Bug fix:** `_toast` dispatched `'toast'`, which nothing listens to —
    every moderation toast was a silent no-op. Now dispatches `show-toast`
    (app-toast's actual event) with error styling on failure toasts.
  - Crop modal body-mounted once (render() wipes the shadow root every
    state change, which would destroy an in-shadow modal mid-crop); closed
    on SPA navigation via the `currentView` subscription (views persist,
    disconnectedCallback never fires on navigation).
  - "Set thumbnail" button on Approved/Featured cards;
    `_fetchAndCompileApproval` extracted from `_regenerate` (pure
    refactor); `_openSetThumbnail` handler with a race guard so two cards
    can't clobber the shared modal instance.
  - Compiled SVG is origin-normalized (crop modal assumes viewBox origin
    0,0; `define ViewBox` allows any origin) and gets an injected white
    `#preview-bg` rect so the crop preview is WYSIWYG with the
    white-filled PNG output.
  - `thumbnail-updated` listener + `?v=<thumbnailAt>` cache-busting on
    card thumbnails (also fixes pre-existing stale cards after
    Regenerate).
- `playground/utils/svg-origin.ts` — new pure `computeOriginNormalization`
  helper.
- `tests/playground-svg-origin.test.ts` — 8 tests (zero/negative/positive/
  mixed origins, fractional, comma separators, malformed fallback).

### Verification done

- Full Vitest suite: 4290 passed / 0 failed.
- Playground typecheck: 0 errors in touched files (pre-existing errors in
  untouched files remain).
- Agentic code review: no criticals; both warnings (modal surviving SPA
  navigation; shared-modal race + missing workspace identity in header)
  fixed in-session.

### Manual E2E still to run (needs an admin browser session)

Per plan (`~/.claude/plans/in-the-moderation-workflows-eager-creek.md`):
`npm run dev:stack`, sign in as an `ADMIN_EMAILS` account, seed approved
workspaces (square, wide, and one with `define ViewBox(-100,-100,200,200)`),
exercise Set thumbnail on both tabs, verify manual-over-auto precedence
via `GET /thumbnail/:id/256` after a Regenerate, verify hero, and regression-
check the owner-path Set Thumbnail (Clear button, store sync, toast copy).

## Follow-ups (deferred)

1. **Owner-path non-zero-origin miscrop** — the owner's own Set Thumbnail
   flow (and `uploadHeroRender`'s hardcoded `0 0 w h`) has the same origin
   bug fixed here for the admin path. `computeOriginNormalization` is
   ready to reuse at that call site (`workspace-view.ts` `set-thumbnail`
   handler).
2. **Admin Clear** — DELETE `/workspace/:id/thumbnail` has no admin
   bypass, so admins can overwrite but not remove a manual thumbnail. Add
   the bypass (mirroring upload's) if overwrite-only proves insufficient.
3. **Legacy `/admin/featured` drift** (found during exploration, unrelated
   to this feature): the legacy token-only featured endpoints
   (`router.ts` ~1873+) write `featured:workspaces` without stamping
   `approval.featuredAt`, so `adminReconcileIndexes` silently reverts
   anything (un)featured through them.
