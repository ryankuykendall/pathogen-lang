# Workspace-switch data loss: undo isolation + autosave flush

**Status: shipped (2026-08-07).**

## The report

User-reported (2026-08-06): while undoing edits in a workspace, one Cmd+Z past
the extent of that visit's changes replaced the entire document with the code
of the *previously visited* workspace — which autosave then persisted,
destroying the workspace.

## Root causes (two bugs, one code path)

1. **Undo bleed.** `<code-editor-pane>`'s CodeMirror `EditorView` is a per-tab
   singleton (app-shell renders all views once, toggles `.active`). A
   workspace switch loaded the new doc via `set initialCode` → an ordinary
   undoable `dispatch({changes})`. History was never cleared, so it retained
   "replace A's doc with B's" as one undoable step. Cmd+Z restored A's full
   text in B; the update listener treated it as typing; autosave persisted it
   into B.
2. **Stale autosave binding.** The workspace→workspace branch of
   `handleRouteChange` never called `autosave.flush()`/`stop()` (only the
   leaving-the-view branch did). So while B's code streamed into the editor,
   autosave was still bound to A. Normally defused by `autosave.init(B)`
   microseconds later — but three branches never call `init()` (`?state=`
   share links, non-owned workspaces, 404/defaultCode fallback), leaving a
   live 5s debounce timer *and* the beforeunload/visibility keepalive save
   aimed at A holding the new route's code. Reproduced: visiting a share link
   from a workspace persisted the shared code into that workspace on tab
   close. Also: switching within the debounce window silently dropped A's
   pending edits.

## The fix

- `playground/components/code-editor-pane.ts` — `set initialCode`/`set code`
  route through `_resetDocument()`, which installs a **fresh `EditorState`**
  (`EditorView.setState`) instead of dispatching a change. Fresh state ⇒
  empty undo history; `setState` fires no ViewUpdate ⇒ programmatic loads no
  longer emit `code-change`/`isModified`/autosave signals (all call sites set
  `store('code')` explicitly). Extensions hoisted to `_buildExtensions()`;
  `_languageExtensions` (error-highlight StateField identity) built once and
  `_themeCompartment` reused so diagnostics + theme toggling survive resets.
- `playground/components/workspace-view.ts` — `handleRouteChange` calls
  `autosave.flush()` at switch time (captures the old id + pending code
  synchronously); `initialize()` captures route identity, awaits
  `autosave.awaitPendingFlush()`, calls `autosave.stop()` unconditionally,
  and bails if superseded by a newer navigation while awaiting (rapid A→B→C
  guard, from pre-commit review).

## Verification

- `scripts/debug-workspace-switch-undo.ts` — Puppeteer, 4 scenarios /
  15 checks. **Pre-fix: 10/15 FAIL** (incl. server-side destruction of B via
  the teardown keepalive save — the exact user report). Post-fix: 15/15 PASS
  in both fast and `--slow` (34s observation, past MIN_INTERVAL) modes.
- `tests/playground-workspace-switch-autosave.test.ts` — 6 service-level
  tests pinning the flush/stop/init ordering contract. Full suite: 4665.
- Spot-check probe (scratchpad, not preserved): post-switch redo, error
  highlighting, and theme toggle all work in the fresh state.

## Deferred follow-ups (from pre-commit code review)

1. **Away-and-back disarms autosave permanently (pre-existing).** Navigating
   workspace → landing/preferences → back to the *same* workspace never
   re-runs `initialize()` (`!this._initialized || _currentWorkspaceId !==
   workspaceId` guard), so `autosave.init()` never re-fires after the
   leave-view `flush()` stopped it — autosave stays disarmed for the rest of
   the session. Same failure class as this fix; predates it. Needs a
   re-init (or re-arm) on the returning branch.
2. **Keystroke window during the flush await.** Between the switch-time
   `flush()` and the doc swap, the editor still accepts input for the old
   workspace; an edit landing exactly in the flush's network round-trip is
   dropped (flush already captured older code; stop() clears the newer
   pending). Strictly narrower than the pre-fix behavior (which dropped every
   debounce-window edit); would need a flush-then-recheck loop to close.
3. **Rapid-switch double flush can 409 against itself** — two overlapping
   flushes for the same workspace race; loser trips the multi-tab conflict
   banner transiently. Self-heals on next `init()`. Note only.
4. **Wiring-level test gap.** The unit tests pin the autosave service
   contract, not workspace-view's call ordering (deleting the
   `handleRouteChange` flush wouldn't fail them). Option: extract an
   `autosave.handoff()` (await-flush + stop) so the ordering lives in the
   tested unit, or add a workspace-view test with mocked services.
5. **Switch-time thumbnail gap (pre-existing).** The leave-view branch runs
   `thumbnailService.generateIfDirty(previousId, …)`; the switch branch does
   not, so the previous workspace's thumbnail can stay stale after an in-app
   switch.
