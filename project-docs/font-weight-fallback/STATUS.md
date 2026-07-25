# Font Weight Fallback — STATUS

**Date:** 2026-07-25
**State:** Implemented + verified (unit tests, typecheck-clean vs baseline, live browser probe)

## Problem

Requesting a Google Font weight a family doesn't offer (repro: Baumans +
`font-weight: 900`; Baumans only ships 400) made the playground fetch
`css2?family=Baumans:wght@900`. Google returns 400 Bad Request **without CORS
headers**, so the browser only sees `TypeError: Failed to fetch` — surfaced as
a fatal red "Failed to load fonts referenced by @font directive" banner, plus a
wall of misleading CORS console errors, refetched on every keystroke (failures
are never cached). The @font variable resolution shipped just prior was working
correctly; it's what made the style-block family+weight pairing resolve at all.

Key insight: the HTTP status is unobservable cross-origin → pre-flight catalog
validation is the only workable fix.

## Fix (user chose fallback + visible diagnostic)

- `google-fonts.ts`: `getKnownVariants(family): number[] | null` (null =
  unknown → skip validation; deliberately NOT `getAvailableWeights`, whose
  `[400,700]` default for unknown families is a trap) + `nearestWeight`
  (min-abs-distance, tie toward lower). `loadGoogleFont` picker preview now
  requests only real variants (same defect class, was silently 400ing).
- `font-loader.ts`: `fetchFontBinary` snaps the weight before cache check /
  fetch; caches the buffer under both `family:requested` and `family:used`;
  outcome carries `weightUsed`. `resolveFontBinaries` registers binaries under
  the **requested** weight (critical: injected @font-face must match the
  source's font-weight on <text> or the browser faux-bolds; and
  resolvePostCompileFonts' weight match must stay stable) and returns
  `substitutions`. `formatFontSubstitutions` builds the banner strings.
- `compiler-worker.ts`: substitutions threaded through compile /
  compileWithContext / resolvePostCompileFonts → `result.fontSubstitutions`.
  Failures still throw; substitutions never do.
- `workspace-view.ts`: dismissible yellow `.warning-banner` (generalized from
  `.multi-tab-warning`) driven by new store key `fontWarnings`; idempotent DOM
  updates; dismissal remembered per message set; cleared on compile error.

## Verification

- `tests/font-loader.test.ts` — new `weight substitution` + `formatFontSubstitutions`
  describes; coverage matrix loops every curated single-variant family (not just
  Baumans). `tests/google-fonts.test.ts` — new, pins getKnownVariants null
  contract + nearestWeight tie-breaking. 76/76 pass.
- `tsc -p playground` — identical error set to baseline (all pre-existing).
- `verify-font-substitution.ts` (this dir) — puppeteer probe against the live
  dev stack: no error banner, exact warning message, network fetched only
  `wght@400`, dismiss works. Screenshot: `verify-font-substitution-banner.png`.

## Files

Plan: `plan.md` (includes both exploration reports' key findings).
