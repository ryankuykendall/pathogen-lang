# Editor Choppiness Diagnosis — Findings (2026-07-29)

**Symptom**: Choppy typing/editing in the playground editor on a workspace with ~200 ms compile time
(`Performance testing`, `IbOVX79pp7BAi7imSKXe~` — glyph-halo program that mints ~900 PathLayers, 985 preview paths).

**Verdict**: The compile is innocent (it runs in the Web Worker). The jank is a **~550 ms main-thread
long task after every debounced compile**, caused by the inspector-panel store subscription doing a
full three-panel re-render once per store key — six times per compile.

## Measurements

Tooling (all preserved in this directory / repo):
- `scripts/perf-typing-audit.ts` — puppeteer driver: loads the workspace code via `/workspace/scratch?state=`,
  types real keystroke bursts, aggregates flag-gated `pathogen:*` perf spans per phase.
- `playground/utils/perf-marks.ts` — flag-gated instrumentation (`localStorage.pathogenPerf='1'` or `?perf=1`),
  inert in production. Spans wired into cm-language-services, scope-cache, workspace-view, svg-preview-pane,
  font-loader call site, and `store.notify` (per-key `notify:<key>` spans).
- `audit-run-user-workspace.txt` — full run output on the user's actual workspace code.

Slow-typing phase (180 ms/key, 23 keys, 11.2 s window) on the user's program:

| Span | n | total | mean | verdict |
|---|---|---|---|---|
| `store-updates` (post-compile store.set cluster) | 11 | **5830 ms** | 530 ms | **the jank — 52% of wall time** |
| `compile-roundtrip` (worker) | 13 | 2194 ms | 169 ms | off-thread, fine |
| `notify:layers/masks/clipPaths/gradients/cssProperties/layerVisibility` | 6×11 | ~5700 ms | ~90 ms each | the contents of store-updates |
| `layer-build-mount` + `getbbox-reflow-loop` + `defs` + `iframe-fonts-css` | 11 | ~110 ms | ~10 ms | fine |
| `signature-help` | 31 | 1 ms | 0.03 ms | exonerated |
| `analyze-scopes` | 31 | 43 ms | 1.4 ms | fine |

Input-latency evidence: every compile is followed by one ~555–575 ms long task; keystrokes queued behind it
show `keydown duration=440ms`, `keyup inputDelay=545ms`.

## Root cause chain

1. `workspace-view.ts` `updatePreview()` finishes a compile and calls `store.set()` **sequentially** for
   `layers`, `masks`, `clipPaths`, `gradients`, `patterns`, `markers`, `filters`, `cssProperties`,
   `layerVisibility` (workspace-view.ts:~935-960).
2. `workspace-view.ts:734-747` subscribes **one callback to seven of those keys**; each notify calls
   `inspectorPanel.setData({ ...everything })`.
3. `inspector-panel.ts:46-67` `setData` unconditionally reassigns `layers`/`gradients`/etc. to **all three
   child panels** (layers-panel, palette-panel, cssvar-panel); each property setter re-renders that panel.
   With ~900 layers that's ~90 ms per notify × 6 notified keys ≈ **540 ms per compile**, synchronously.
4. While typing, the 150 ms debounce fires a compile on every natural pause → a 550 ms freeze lands
   mid-typing over and over.

## Secondary findings (bench: scratchpad parse-bench-targeted.ts, generated 8-layer/2200-loop program)

- **`getDiagnostics` costs the same as a full compile** (~120 ms at 120 ms compile weight; it parses
  *and evaluates* — `src/language-services/diagnostics.ts` Phase 2). The playground calls it on the
  main thread in `showError()` after every failed compile. Typing through invalid states (constant
  during real editing) pays a main-thread compile-equivalent per errored attempt. Not the dominant cost
  in this session's happy-path measurement, but it scales 1:1 with compile time and will freeze the
  editor on error-heavy typing in exactly the same way.
- **Signature help is NOT a problem** (0.03 ms/keystroke) — the earlier static suspicion is refuted;
  it early-bails cheaply and never full-parses. `analyzeScopes` (1.4 ms, memoized) also fine.
- Render tick is healthy even at 985 paths: layer mount ~5 ms, getBBox loop ~4 ms, font CSS ~0.6 ms.
- Worker gate confirmed working (compiles genuinely off-thread in the built site).

## Fixes implemented (2026-07-29, same session)

1. **Coalesced inspector subscription** — `workspace-view.ts`: the 7-key subscription now schedules one
   `setData` per microtask (`_inspectorSyncScheduled` flag), so the post-compile store.set cluster
   produces a single inspector sync instead of six.
2. **Differential `setData`** — `inspector-panel.ts` caches the last-forwarded references and only
   reassigns fields whose identity changed (e.g. a layerVisibility-only update no longer re-renders the
   layers list three panels wide).
3. **Panel render overhaul** — `layers-panel.ts`, `palette-panel.ts`, `cssvar-panel.ts`: setters batch
   `updateList` into one microtask per panel; layers-panel and palette-panel build the row list as one
   HTML string assigned via a single `innerHTML` (one parse instead of ~900), with click handling moved
   to event delegation (`data-layer-name` / `data-def-key` / `data-group` attributes) and an
   `escapeHtml` helper for interpolated names/values (the old code interpolated unescaped).

### Measured result (same audit, same workspace code)

| Metric | Before | After |
|---|---|---|
| `store-updates` per compile | ~530 ms | **~2.4 ms** |
| Long task per compile while typing | 555–575 ms | **~52 ms** (panel microtask render, 4 total in run) |
| Slow keystrokes (>50 ms) during sustained typing | every compile, 440–560 ms queues | **0** |
| Slow-typing phase wall time frozen | 52% | ~0 (compiles stay off-thread) |

Full after-run: `audit-run-user-workspace-after-fixes.txt`. Remaining early-load paint stall (~500 ms,
inputDelay=0) is compositor raster of the 985-path drop-shadowed artwork on first render — not
main-thread work.

Regression tests: `tests/playground-inspector-coalescing.test.ts` (coalescing, differential setData,
delegated eye/group/defs clicks, HTML escaping, style-attribute injection guard).

Code-review hardening (same session, from the code-reviewer agent's findings): shared
`playground/utils/html-escape.ts` with a `cssValueForStyleAttr` guard (defense-in-depth so the
innerHTML-interpolated `style="…"` attributes don't depend solely on the evaluator's
`validateCSSValue` allow-list), `InspectorPanel._last` reset in `render()` (identity cache must not
outlive recreated child panels), lint fixes, and the script registered as `npm run perf:typing`.

## Error-state benchmark (2026-07-29, after fixes 1–3)

Audit extended with Phase 4 (enter a parse-clean eval-error state: `let zz = nosuchvariable;` at doc
end) and Phase 5 (sustained typing while broken). `get-diagnostics` span added around the
`showError()` call. Runs: `audit-run-error-state-heavy.txt` (generated 8×2200 program),
`audit-run-error-state-user.txt` (user's glyph program).

| Program | compile (worker) | get-diagnostics (MAIN thread) per errored compile | long task per keystroke pause |
|---|---|---|---|
| Generated loop-heavy (8×2200) | ~69 ms | **~64 ms (n=23)** — 1.47 s frozen in a 5.7 s window | ~67 ms every pause |
| User glyph program | ~150 ms | **~2 ms** | none |

Interpretation: `getDiagnostics` re-evaluates on the main thread **without fonts**, so
`PathBlock.fromGlyph` yields no glyphs and the user's heavy glyph loops are skipped — their program
gets diagnostics almost free (and still reports the right error, since the undefined-variable line is
outside the glyph loop). But for any non-font-heavy program (loops/grids), an error state costs a full
compile-equivalent main-thread freeze per keystroke pause, scaling 1:1 with compile time. A
400 ms-compile program in an error state = 400 ms UI freeze per pause.

Caveat: the fonts-absent evaluation is also a latent **correctness** hazard — a program whose real
error sits *inside* a glyph loop would get different (missing) diagnostics on main than the worker saw.

## Still open (deferred)

4. **`getDiagnostics` on the main thread** — confirmed cost above. Fix: add a `getDiagnostics` message
   type to `src/worker.ts` (fonts can be threaded through like compile), await it in `showError()`,
   keep the sync path as the worker-unavailable fallback. VS Code is unaffected (diagnostics already
   run in the LSP server process).
5. **Mid-expression debounce heuristic** checks the last char of the whole document, not the caret
   (`workspace-view.ts` `debouncedUpdate`).
