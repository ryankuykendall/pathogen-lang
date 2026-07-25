# Nearest-weight fallback + warning for unavailable Google Font weights

## Context

Requesting a Google Font weight that doesn't exist for a family (the repro:
`Baumans` + `font-weight: 900` in a style block — Baumans only ships weight 400,
`playground/utils/google-fonts.ts:82`) makes the playground fetch
`css2?family=Baumans:wght@900`. Google returns 400 Bad Request **without CORS
headers**, so the browser sees only `TypeError: Failed to fetch`; the playground
promotes it to a fatal red "Failed to load fonts referenced by @font directive"
banner, floods the console with misleading CORS errors, and (since failures are
never cached) refetches on every keystroke recompile. The new @font variable
resolution is working correctly — it's what made the style-block weight pairing
resolve at all. The HTTP status is unobservable cross-origin, so **pre-flight
catalog validation is the only workable fix**.

User chose: (1) fall back to the nearest available weight, and (2) surface a
clear non-fatal diagnostic — not silent, not a hard error.

Scope: **playground-only.** CLI loads fonts from disk/system (no Google fetch —
`src/cli.ts:729` defers it); VS Code preview loads no fonts. No parity work.

**Critical consistency constraint** (both explorations confirmed independently):
register the substituted binary under the **requested** weight. `fontBinariesToCss`
(font-loader.ts:524) emits `font-weight: ${e.weight}` and the source weight
reaches the SVG `<text>` verbatim (`src/render/build-layers.ts:144`) — a
400-stamped entry would faux-bold live text and diverge from outlined output.
`resolvePostCompileFonts` matches `b.weight === (r.weight ?? 400)`
(compiler-worker.ts:370-372) — mismatch means perpetual refetch. Registry lookup
is forgiving (`getFont` already does nearest-weight, font-provider.ts:88-112).

## Implementation

### Step 1 — `playground/utils/google-fonts.ts`: catalog lookups

Two new exported pure functions (after `getAvailableWeights` ~:188):

- `getKnownVariants(family): number[] | null` — variants from
  `cachedFonts || [...SYSTEM_FONTS, ...CURATED_FONTS]`; `null` when family
  unknown or variants empty (API path). **Do not reuse `getAvailableWeights`** —
  its `[400, 700]` default for unknown families is a trap (and the weight-picker
  UI in `cm-textlayer-editor.ts` depends on it; leave it untouched).
- `nearestWeight(requested, variants): number` — min absolute distance, tie
  toward the lower weight (documented one-line simplification of CSS
  font-matching).

Opportunistic same-class fix: `loadGoogleFont` (:164-178) currently requests
`wght@100;200;…;900` for every family (silent 400s for single-variant
families). Replace with the family's known variants, ascending-sorted,
`?? [400, 700]` fallback.

### Step 2 — `playground/services/font-loader.ts`: snap before fetch, report

- `FontFetchOutcome` success arm gains `weightUsed: number`.
- New exported `interface FontWeightSubstitution { family; requested; used; available }`.
- `FontResolutionResult` gains `substitutions: FontWeightSubstitution[]`.
- `fetchFontBinary` (:60): compute `weightUsed = variants ? nearestWeight(weight, variants) : weight`
  **before** the cache check (so cache hits still report substitution). Check
  cache under both `family:weight` and `family:weightUsed`; fetch and in-flight
  dedup key use `weightUsed`; on success cache the buffer under **both** keys
  (same ArrayBuffer ref). This fixes the refetch-per-keystroke at the root — the
  fetch now targets a valid variant and gets cached.
- `resolveFontBinaries` (:185): `binaries.push` keeps the **requested** weight;
  when `outcome.weightUsed !== weight`, push a substitution entry. Return the
  third array.
- New exported pure `formatFontSubstitutions(subs): string[]`. Message formats:
  - single-variant: `Baumans is only available at weight 400 (requested 900); using 400`
  - multi-variant: `Titillium Web is not available at weight 500; using 400 — available weights: 200, 300, 400, 600, 700, 900`
- No change to `svg-text-outliner.ts` — its `defaultLoadFont` transparently
  receives the snapped binary (its crude retry-at-400 at :232 becomes
  dead-but-harmless for cataloged families, still covers unknown ones).

### Step 3 — `playground/services/compiler-worker.ts`: thread through

- `resolveFontsForSource` (:224): all **three** early-return literals gain
  `substitutions: []`; final return passes `resolved.substitutions`.
- `compile` (:299) / `compileWithContext` (:337): failures still throw
  (unchanged policy); on success attach substitutions alongside binaries —
  extend `attachFontBinaries` (:390) to `attachFontDiagnostics(result, binaries,
  substitutions)` setting `result.fontSubstitutions`.
- `resolvePostCompileFonts` (:363): merge `extra.substitutions` into the
  attached list (computed-style substitutions become visible too); failures keep
  their existing `console.debug` silent policy.

### Step 4 — Types + store

- `playground/types/compiler.d.ts` `CompileResult`: add optional
  `fontSubstitutions` next to `fontBinaries`.
- `playground/types/store.d.ts` `StoreState`: add `fontWarnings: string[]`
  (also add the missing `multiTabWarning: boolean` — pre-existing drift).
- `playground/state/store.ts`: default `fontWarnings: []` near `multiTabWarning`.

### Step 5 — `playground/components/workspace-view.ts`: warning banner

- Success path of `updatePreview` (after `hideError()` ~:906):
  `store.set('fontWarnings', formatFontSubstitutions(result.fontSubstitutions ?? []))`.
  Error path (catch ~:942): `store.set('fontWarnings', [])` — no stale warning
  atop an unrelated error.
- Render: generalize `.multi-tab-warning` CSS to a shared `.warning-banner`
  class (same `--warning-bg/border/text` styling, :1085-1114); add a sibling
  `#font-warning` div with text span (`white-space: pre-line`) + Dismiss button.
- Wiring mirrors the multi-tab pattern (:704-706, :1052-1057): subscribe to
  `fontWarnings`; update banner idempotently (only touch DOM when joined text
  changes — keystroke-recompile safe); Dismiss stores the joined text on a
  private field so the banner stays hidden until the message **set changes**
  (e.g. 900→800 re-shows; →400 clears). Unsubscribe in `disconnectedCallback`.

No changes to `svg-preview-pane.ts` or `error-panel.ts`.

### Step 6 — Docs (one line, optional)

If the playground docs mention Google Font weights, add: "If a family doesn't
offer the requested weight, the playground substitutes the nearest available
weight and shows a warning." CLI docs unaffected.

## Tests (coverage-matrix per generalize-reported-gaps rule)

**Extend `tests/font-loader.test.ts`** (existing `vi.stubGlobal('fetch', …)` idiom),
new `describe('weight substitution')`:
1. Every curated single-variant family (derived programmatically via
   `getKnownVariants`, not just Baumans): request 900 → fetch URL contains
   `wght@400`, outcome `weightUsed: 400`.
2. Multi-weight tie: Titillium Web (200…900, no 500) request 500 → `weightUsed: 400`
   (pins tie-toward-lower).
3. Available-weight passthrough: Roboto 700 → `wght@700`, no substitution.
4. Unknown-family passthrough: URL keeps `wght@900` verbatim.
5. `resolveFontBinaries` shape: Baumans 900 → `binaries[0].weight === 900`
   (locks the consistency constraint), `substitutions === [{family, requested: 900,
   used: 400, available: [400]}]`, `failures` empty.
6. Cache interplay: second `fetchFontBinary('Baumans', 900)` → zero new fetches,
   still reports `weightUsed: 400`; `('Baumans', 800)` after → zero fetches
   (dual-key cache).
7. `formatFontSubstitutions` exact message strings (both formats).

**New `tests/google-fonts.test.ts`** (pure functions; node env, no DOM):
`getKnownVariants` (Baumans → [400]; unknown → null — the trap-avoidance
contract); `nearestWeight` matrix (exact hit, 900→[400], tie 500→[400,600]=400,
100→[300,700]=300, 800→[200,900]=900).

No compiler-worker test harness — plumbing covered by the pure-function tests +
manual verification.

## Verification

1. `npm run build` → `npm run dev:website` (localhost:3000). (Respect the
   dev-stack trap: if user's dev:stack is running, coordinate before building
   website.)
2. User's repro: `let fontFamily = "Baumans"; @font fontFamily;` + style block
   with `font-family: fontFamily; font-weight: 900;` → **no** red banner, **no**
   CORS console errors, Network tab shows one `wght@400` fetch (cached after);
   text renders in Baumans; warning banner shows the substitution message.
3. Dismiss → typing keeps it dismissed; change 900→800 → re-appears; →400 → clears.
4. Compile error in unrelated code → red panel shows, font warning cleared.
5. Export with outlined text → outlined glyphs match live preview (no faux-bold).
6. Font picker on a single-weight family (e.g. Pacifico) → no 400s from the
   preview `<link>`.
7. Light + dark themes.
8. `npx vitest run tests/font-loader.test.ts tests/google-fonts.test.ts`, then
   full suite before commit; agentic review (code-reviewer) before commit.

Implementation order: 1 → 2 → 3 → 4 → 5; tests alongside 1-2. Steps 1-2 alone
fix the fatal error + refetch symptoms; 3-5 add the visible diagnostic.
