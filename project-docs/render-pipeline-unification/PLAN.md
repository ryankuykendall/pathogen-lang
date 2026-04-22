# Plan: Unify SVG render pipeline into a shared tree + thin adapters

## Context

Pathogen has three independent implementations that walk the same `CompileResult` shape and produce SVG:

- `src/svg-generator.ts` (247 lines) — CLI string emitter. Also consumed by the VS Code preview via `SvgPathExtended.generateSvg()` (bundled library) — `packages/vscode-pathogen/src/preview.ts` line 715 calls it, parses with DOMParser, imports defs + visual elements into the webview.
- `playground/components/svg-preview-pane.ts` (1,358 lines, ~490 of which are render-overlap) — playground DOM emitter via `createElementNS`.
- `playground/utils/svg-builder.ts` (366 lines) — latent DOM-based string builder, extracted from the preview pane for future BBWP/server use, not currently wired.

That's roughly **1,100 duplicated lines** across three files interpreting the same `CompileResult`. Two problems compound here:

1. **Code duplication** is a direct maintenance tax even when all three copies are correct today. A semantic change (new attribute, new default, new defs type) requires three synchronized edits, three rounds of review, and three places for subtle divergence to creep in later.
2. **Silent drift** turns duplication into user-visible regressions. The Marker feature demonstrated this twice this session — once in the five-file playground wire-up (fixed in `560b32c`), once in `evaluateWithContext` forgetting to forward `markers` (fixed in `efb63c0`). Both slipped past tests that only exercised the CLI path.

The Three-Surface Parity policy (commit `c4d38dc`) named drift as the primary failure mode but left enforcement as a manual checklist. Collapsing the duplication is the structural fix: a single source of truth for "interpret CompileResult into an SVG tree," with thin adapters for string output (CLI and VS Code) and DOM output (playground). The playground's chrome (grid, navigator, zoom/pan, GPU gradient pre-render) is unaffected and stays in the preview pane.

**Intended outcomes:**

- **Collapse ~1,100 lines of duplicated render logic to one shared module** (~500 lines) + two thin adapters (<100 lines each). Less code, less review surface, fewer places a subtle bug can hide.
- **The next defs-producing constructor is added in exactly one place** — the shared render module plus its tests. CLI, playground, and VS Code preview inherit it automatically.
- **Replace the manual three-surface parity checklist with an automated parity test** that fails CI on divergence.
- **Update stale documentation** — `packages/vscode-pathogen/CLAUDE.md` Readiness Status currently describes the preview as a non-functional placeholder; the file is 997 lines of working code. That doc gets corrected as part of this work.

## Project doc

Create `project-docs/render-pipeline-unification/` with:

- `PLAN.md` — this document (mirror the plan here so it persists across sessions)
- `DESIGN.md` — `VNode` shape, API surface of `src/render/`, GPU-gradient decorator pattern, data-attribute preservation table
- `RATIONALE.md` — history of the drift (Marker incident) + link to `cross-system-feature-lifecycle.md` Three-Surface Parity section
- `snapshots/` — representative `.pathogen` programs used as byte-pinning fixtures (one per defs type + combinations)

Per project convention, do not modify existing `project-docs/svg-markers/` or `project-docs/developer-experience/` — this is a new feature directory.

## Approach

Single shared renderer in `src/render/` that produces an abstract tree. Two thin adapters:

```
CompileResult ──▶ src/render/build-tree.ts ──▶ VNode
                                                 │
                          ┌──────────────────────┴──────────────────────┐
                          ▼                                             ▼
                  serialize(vnode)                              mount(vnode, el)
                  → string                                      → live DOM
                  │                                             │
                  ▼                            ┌────────────────┴────────────────┐
               CLI stdout                      ▼                                 ▼
               (src/cli.ts)               Playground preview             VS Code preview
                                          (after GPU gradient            (webview; consumes
                                           decoration pass)                mountInto from bundle)
```

`VNode = { tag: string; attrs: Record<string, string>; children: VNode[] | string }` — minimal, no diffing, no dependencies. ~200 lines hand-rolled.

**Two-step migration for the VS Code preview:**
- **After Phase 2** (CLI migrated): VS Code preview keeps calling `generateSvg()` → parses with DOMParser → imports nodes. No extension code changes; inherits the refactor via the bundled library.
- **After Phase 5** (VS Code aligned): VS Code preview calls `buildSvgTree()` + `mountInto()` directly — skipping the string+DOMParser round-trip and matching the playground's architectural pattern. This is the structural alignment that makes the "three surfaces, one renderer" model real.

The playground keeps its `<rect id="preview-bg">`, `<rect id="preview-grid">`, `<g id="preview-layers">`, navigator, and zoom/pan chrome. Only the "interpret defs + layers" section swaps to `mount(buildTree(result), defsEl)` with a pre-mount decoration pass for GPU gradient URLs.

## Phased rollout

Each phase is independently reviewable and revertable.

### Phase 0 — Safety net (precondition for every subsequent phase)

**Goal:** pin current output so the refactor can be proven non-regressive.

- Add `tests/render-snapshots.test.ts` using Vitest `toMatchFileSnapshot`. One test per representative program (mask, clipPath, each gradient type, pattern, marker, multi-layer with groups, text, combinations). Programs live in `project-docs/render-pipeline-unification/snapshots/*.pathogen`.
- Each snapshot pins the CLI string output via `generateSvg(compile(source), options)`.
- Passes on current code — becomes the regression baseline for Phases 2–5.

**Note on DOM snapshots:** Initially planned a second `tests/render-dom-snapshots.test.ts` driving the live preview-pane custom element. Dropped in favor of the Phase 4 parity test (which structurally compares `toSvgString(tree)` vs `mountInto(tree, el).outerHTML` for every fixture). The parity test is cheaper, more durable, and tests the output contract instead of a specific web-component method. Decided 2026-04-21 while starting Phase 0.

### Phase 1 — Shared render module

**Goal:** build `src/render/` and its adapters; no call-site changes yet.

- `src/render/types.ts` — `VNode`, `VNodeChild`.
- `src/render/build-defs.ts` — `buildDefs(result: CompileResult): VNode[]`. One branch per defs type; mirror existing attribute semantics precisely including default-elision (e.g. `markerUnits !== 'strokeWidth'`).
- `src/render/build-layers.ts` — `buildLayers(layers: LayerOutput[], opts): VNode[]`. Handles path/text/group/fragment branches.
- `src/render/build-tree.ts` — top-level `buildSvgTree(result, options): VNode` wrapping defs + layers in the `<svg>` envelope.
- `src/render/serialize.ts` — `toSvgString(vnode): string`. Deterministic attribute order (alphabetical? or preserve insertion? — match current `svg-generator.ts` ordering exactly to keep byte identity).
- `src/render/mount.ts` — `mountInto(parent, vnodes)` uses `createElementNS(SVG_NS, tag)` + `setAttribute`.
- Unit tests in `tests/render/` for each builder and adapter in isolation.

At the end of Phase 1 the module exists but nothing calls it. Existing renderers untouched.

### Phase 2 — CLI migration

**Goal:** `src/svg-generator.ts` becomes a thin wrapper over the shared module.

- Rewrite `generateSvg()` to: `buildSvgTree(result, options) → toSvgString(vnode)`. Wrap in the same `<?xml?>`-free envelope it produces today.
- Phase 0 snapshots must pass unchanged (byte-identical). If any diverge, fix the serializer until they match — don't update the snapshot.
- Delete the old emission code from `svg-generator.ts`.

### Phase 3 — Playground migration

**Goal:** `svg-preview-pane.ts` defs + layer injection uses the shared module.

- In `setLayersWithTiming`, replace the ~490 overlap lines with:
  1. `tree = buildSvgTree(resultLike, options)`
  2. Pre-mount decoration: walk `tree.children[defs]`, for each conic/mesh/freeform/topo gradient, if `defsData.gpuGradientUrls` has a url for its id, swap the gradient's children with the existing pre-rendered `<image href="...">` node. Single pass.
  3. `mountInto(defsEl, tree.defs)` and `mountInto(layersGroup, tree.layers)`.
- Preserve all `data-mask-def`, `data-clippath-def`, `data-gradient-def`, `data-pattern-def`, `data-marker-def`, `data-fragment-layer`, `data-layer-name`, `data-has-layer-stroke`, `data-has-layer-stroke-width`, `data-orig-mask`, `data-orig-clip-path` attributes — they're used by cleanup, layer-visibility toggle, and inspector. `build-defs.ts` and `build-layers.ts` must emit them.
- Keep playground-only chrome untouched: grid, preview-bg, navigator, zoom-navigator, preview-path (single-layer fallback), `@property` styles, fullscreen button, zoom controls.
- Preserve timing methods' interfaces.
- Phase 0 DOM snapshots must pass.

### Phase 4 — Unify the third latent path + enforcement

**Goal:** remove the latent third renderer and add a parity test so drift can't return.

- `playground/utils/svg-builder.ts` — if truly unused (audit confirmed), delete. If it has a future BBWP/server purpose, rewrite as a 10-line wrapper: `buildSvg(result) = toSvgString(buildSvgTree(result))`.
- Add `tests/render-channel-parity.test.ts`: for each fixture, render via CLI adapter + playground adapter; compare structurally (normalize attribute order if needed, then assert tag/attr/child equivalence). Guards against future divergence at the adapter level.
- Update `project-docs/developer-experience/cross-system-feature-lifecycle.md` → "Render-channel parity test" section to link to the new test and remove the "does not yet exist" caveat.

### Phase 5 — VS Code preview alignment

**Goal:** bring the VS Code preview into the same architectural pattern as the playground — `mount()` directly instead of `generateSvg() + DOMParser + importNode`. Correct the stale Readiness Status doc.

The extension works fine after Phase 2 alone (its `SvgPathExtended.generateSvg()` call becomes a thin wrapper over the shared module, so it inherits the refactor automatically). Phase 5 is the additional step of making the architecture match the conceptual model: three surfaces, one renderer, two output adapters, no surface built on top of another surface's output.

- `packages/vscode-pathogen/src/preview.ts` lines ~711–751 — replace the current `generateSvg() → DOMParser → importNode` chain:
  1. `const tree = SvgPathExtended.buildSvgTree(result, { viewBox, width, height })`
  2. Clean up previous injected defs/styles by class (`.injected-defs`, `.injected-style`) — same as today.
  3. `SvgPathExtended.mountInto(preview, tree.defs)` with class tagging for cleanup.
  4. `SvgPathExtended.mountInto(previewContent, tree.layers)` for visual elements.
  5. Existing panels (layer visibility, CSSVar, palette, recompile) keep working because `build-defs.ts` / `build-layers.ts` emit the same `data-*` attributes they read.
- Re-export `buildSvgTree` + `mountInto` from `src/index.ts` so the bundled library exposes them to the webview.
- Build the `.vsix` and install it in a clean VS Code instance. Verify:
  - Preview opens and renders
  - Layer visibility eye toggles work
  - CSSVar panel populates
  - Palette panel populates
  - Recompile button triggers fresh render
  - Marker feature (same repro that exposed the playground bug) renders correctly
- Update `packages/vscode-pathogen/CLAUDE.md` Readiness Status: remove the "Preview panel shows placeholder" entry (no longer true — the file is 997 lines of working code). Keep any genuinely unfinished items.
- Update the three-surface parity test from Phase 4 to also include a VS Code render-path fixture (if testable outside a live VS Code instance; otherwise note as manual checklist item in the cross-system doc).

**Decision rationale:** Today's VS Code preview treats the SVG string as the contract boundary. That's robust (compiler changes flow automatically) but costs a parse+serialize round-trip and prevents sharing defs/layer-injection patterns with the playground. Migrating to `mount()` is low-risk (internal refactor of ~40 lines in preview.ts) and unlocks future feature sharing.

## Critical files

| File | Phase | Change |
|---|---|---|
| `project-docs/render-pipeline-unification/PLAN.md` | pre-phase-0 | **new** — mirror of this plan |
| `project-docs/render-pipeline-unification/DESIGN.md` | pre-phase-0 | **new** — API surface + VNode shape |
| `project-docs/render-pipeline-unification/RATIONALE.md` | pre-phase-0 | **new** — Marker incident history |
| `project-docs/render-pipeline-unification/snapshots/*.pathogen` | 0 | **new** — fixture programs |
| `tests/render-snapshots.test.ts` | 0 | **new** — CLI string baselines (DOM baselines rolled into Phase 4 parity test) |
| `src/render/types.ts` | 1 | **new** |
| `src/render/build-defs.ts` | 1 | **new** |
| `src/render/build-layers.ts` | 1 | **new** |
| `src/render/build-tree.ts` | 1 | **new** |
| `src/render/serialize.ts` | 1 | **new** |
| `src/render/mount.ts` | 1 | **new** |
| `tests/render/*.test.ts` | 1 | **new** — unit tests per builder/adapter |
| `src/svg-generator.ts` | 2 | rewrite as thin wrapper |
| `playground/components/svg-preview-pane.ts` | 3 | replace ~490 lines with 3 calls + GPU decoration pass |
| `playground/utils/svg-builder.ts` | 4 | delete or rewrite as 10-line wrapper |
| `tests/render-channel-parity.test.ts` | 4 | **new** — structural diff between adapters |
| `project-docs/developer-experience/cross-system-feature-lifecycle.md` | 4 | mark render-channel parity test as existing |
| `packages/vscode-pathogen/src/preview.ts` | 5 | migrate render call from `generateSvg`+DOMParser to `buildSvgTree`+`mountInto` |
| `src/index.ts` | 5 | re-export `buildSvgTree` + `mountInto` so bundled library exposes them to the webview |
| `packages/vscode-pathogen/CLAUDE.md` | 5 | correct stale Readiness Status — preview is functional |

## Time estimate

~2–2.5 days of focused work:
- Phase 0: ~3–4h (fixtures + snapshots + jsdom setup)
- Phase 1: ~4–6h (module + unit tests)
- Phase 2: ~3–4h (CLI migration, chase byte identity)
- Phase 3: ~4–6h (playground migration, GPU decoration, preserve all data-attrs)
- Phase 4: ~2–3h (parity test + cleanup)
- Phase 5: ~3–4h (VS Code migration + .vsix install verify + CLAUDE.md correction)

## Out of scope

- **New VS Code preview features.** Phase 5 is a structural migration only — same functionality as today, just routed through the shared renderer. Any new preview capabilities (live defs visibility toggling, collaboration features, etc.) are separate work.
- **Changing output semantics.** Byte-identical CLI output is a constraint, not a goal to deviate from. No attribute-order reorganizing, no "while we're in here" prettification.
- **GPU gradient internals.** The GPU pre-render pipeline stays untouched; only the decoration point (where urls get spliced into the tree) moves from the preview pane into a dedicated pre-mount pass.
- **Dependency additions.** No vdom library, no JSX. Hand-rolled `VNode` stays ~200 lines.
- **CHANGELOG.** Will propose a CHANGELOG entry at the end covering all phases; not updating it mid-phase.

## Verification

**Per-phase:**
- Phase 0: `npm run test:run` passes with new snapshot tests green on unmodified code.
- Phase 1: `npm run build` + new unit tests pass; no call sites changed.
- Phase 2: CLI snapshots from Phase 0 pass **unchanged**. If any diverge, the serializer is wrong — fix the adapter, not the snapshot.
- Phase 3: Run Puppeteer check against `npm run dev:website` with the same user code that exposed the Marker bug — marker renders in shadow DOM `<defs>`. (No DOM snapshot baseline — Phase 4 parity test covers this after both adapters are testable.)
- Phase 4: parity test catches a deliberately-seeded divergence (verify the safety net works), then verifies real code is in parity.
- Phase 5: `npm run build:vscode:install` builds and installs the `.vsix`; preview command works end-to-end; Marker repro renders; all panels (layers, CSSVar, palette) populate; `packages/vscode-pathogen/CLAUDE.md` Readiness Status reflects current reality.

**End-to-end (before declaring done):**
- Full test suite: `npm run test:run`
- Byte identity: `npm run build && npx tsx src/cli.ts project-docs/svg-markers/basic-arrow.pathogen --output-svg-file=/tmp/new.svg` — diff against a pre-refactor capture
- **Three-surface live check**, running the same Marker repro program through each surface and diffing the output:
  - **CLI**: `npx tsx src/cli.ts <repro>.pathogen --output-svg-file=/tmp/cli.svg`
  - **Playground**: `npm run dev:website` → paste into new workspace → inspect `<svg>` outerHTML
  - **VS Code**: install `.vsix`, open repro file, run preview command, inspect webview DOM
- No regression in any of the other defs types (gradients, masks, clipPaths, patterns) by running the existing `tests/gradients.test.ts`, `tests/layers.test.ts`, etc.

## Risks and mitigations

- **Attribute-order drift breaks byte identity.** Mitigate: serializer iterates attributes in a stable order matching `svg-generator.ts`'s current insertion order. Snapshot tests catch any slip immediately.
- **Playground incremental rendering regresses in perceived speed.** Current code does `createElementNS` + `appendChild` per compile; new code does the same via `mount`. No expected regression. If one appears, profile before reverting.
- **Data attributes accidentally dropped.** Mitigate: Phase 3 DOM snapshot covers every `data-*` attribute. Test fails if any go missing.
- **`svg-builder.ts` turns out to have a caller I missed.** Mitigate: `grep -rn "svg-builder" playground/ scripts/ website/ packages/` before deletion; if any hit, migrate it rather than delete.
- **VS Code webview can't access `buildSvgTree` / `mountInto`.** The webview loads the bundled library via `<script src="${compilerUri}">` which exposes `window.SvgPathExtended`. Phase 5 requires re-exporting the new functions from `src/index.ts` so they appear on that global. Mitigate: verify the bundled library exposes them by inspecting `dist/index.global.js` before touching the extension code.
- **Stale `packages/vscode-pathogen/CLAUDE.md` could have other wrong claims beyond the preview Readiness Status.** Mitigate: in Phase 5, read the file top-to-bottom against the current code and flag any other stale entries, not just the Readiness Status.

