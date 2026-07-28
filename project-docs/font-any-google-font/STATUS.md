# Any Google Font via `@font` — probe instead of whitelist (2026-07-28)

## What changed

The playground previously hard-failed `@font "Family";` for any family outside the
curated ~103-entry list (`CURATED_FONTS` in `playground/utils/google-fonts.ts`).
Motivating case: `@font "Gravitas One";` → `Unknown Google Font` compile error.

New behavior: **the fetch is the probe.** Unknown `@font` families flow into the
normal css2 fetch path:

- Google serves the family → compile succeeds; non-fatal dismissible banner:
  `"Gravitas One" is not in the curated font list; loaded directly from Google Fonts.`
- Requested weight rejected (css2 errors are CORS-opaque) → retry without
  `:wght@` so css2 serves the family default; substitution warning:
  `Gravitas One does not provide weight 700 on Google Fonts; using its default weight 400`
- Both attempts fail → compile error:
  `Could not load "X" from Google Fonts — the font was not found, or the network
  request failed. Check the spelling against fonts.google.com, …`
- Unknown-family failures are negative-cached for 60 s (TTL, not permanent —
  a network blip recovers) to stop per-keystroke refetch storms.

Unchanged by design:
- Style-block `font-family:` values keep the `isKnownGoogleFont` gate
  (per-keystroke typing policy; the picker is authoritative there).
- Curated families: pre-fetch nearest-weight snapping, failures never cached.
- Unresolvable-identifier `@font` errors.
- The font picker still shows only the curated list.
- CLI / VS Code never enforced the whitelist; nothing to change there.

## Files

- `docs/path-blocks.md` — Font Integration section rewritten (docs-first).
- `playground/services/font-loader.ts` — directive gates removed in
  `extractFontReferences`; `fetchFontBinaryUncached(family, weight|null)` returns
  `{buffer, cssWeight}`; retry + `fontFailureCache` (60 s TTL) +
  `defaultWeightServed` map (cache hits keep reporting the substitution);
  `available: []` sentinel for catalog-unknown substitutions.
- `playground/services/compiler-worker.ts` — `resolveFontsForSource` returns
  `notices`; uncurated failures get the rewritten message; `attachFontDiagnostics`
  sets `result.fontNotices`.
- `playground/components/workspace-view.ts` — `fontNotices` merged into the
  existing `fontWarnings` banner.
- `tests/font-loader.test.ts` — 3 old-policy tests inverted; new tests for
  retry fallback, empty-`available` phrasing, negative cache (fake timers),
  curated-no-negative-cache counter-test.

`playground/utils/google-fonts.ts` needed **no changes** — only call sites.

## Verification

- `npx vitest run tests/font-loader.test.ts tests/google-fonts.test.ts` — 81 pass.
- `npm run typecheck:playground` — no new errors (all reported errors pre-exist,
  confirmed by stash/re-run).
- `npm run build:docs` + `npm run check-links` — 981 links, 0 broken.
- Puppeteer E2E against `npm run dev:website` (script:
  session scratchpad `verify-font-probe.cjs`): 4/4 scenarios pass —
  Gravitas One notice, Gravitas One 700 default-weight fallback,
  nonexistent-font probe error, Baumans 900 curated snap regression.
  Re-run after review fixes: still 4/4.
- Banner screenshots both themes: `banner-light.png`, `banner-dark.png` (this folder).
- Full suite (test-runner agent): 100 files, 4176 passed, 0 failed.

## Agentic review outcomes (both applied in-session)

**Code review** (8 findings, 0 critical). Fixed before commit:
1. (Warning, blocking) `defaultWeightServed` was keyed per family → could
   misattribute a fallback to a sibling weight served exactly as requested.
   Re-keyed per `family:weight` like the sibling caches; regression test added.
2. (Warning) Per-keystroke cost comment was wrong on both claims (2 requests
   per probe, caches don't help mid-typing). Rewritten.
3. (Warning) `fontNotices` added to `playground/types/compiler.d.ts` CompileResult.
4. (Warning) Notice/rewrite logic extracted as exported
   `annotateUncuratedResolution()` + new `tests/compiler-worker-fonts.test.ts` (6 tests).
5. (Suggestion) Generic-family failures now carry structured `code: 'generic-family'`
   instead of substring-matched reasons.
7. (Suggestion) Strict `variants !== null` at the snap site to match sibling gates.

Deferred (follow-ups, not blocking):
- #6: concurrent retries for two invalid weights of the same uncurated family
  aren't deduped against each other (minor duplicate fetch).
- #8: notices and substitutions share one banner with no visual distinction.
- C3 (from content review): an uncurated family referenced ONLY via style-block
  `font-family` loads through the post-compile pass with no notice (directive-only
  notice is intentional, but worth a docs/product decision later).
- C4: "Font loading by environment" docs list two environments; VS Code preview
  font behavior is undocumented (pre-existing gap).

**Content review** (4-persona). Found the first docs draft claimed "Only a family
Google Fonts cannot serve produces a compile error" (false — generic families,
unresolvable identifiers, malformed directives, curated CDN failures also error)
and used "its only weight" for non-curated families (the system only knows the
*default* weight, not the variant list). Section rewritten per the synthesis:
two-tier comparison table (curated vs not), exact runtime strings quoted
verbatim, "curated list" defined on first use, network-ambiguity caveat scoped
to non-curated names, banner location named. `build:docs` + `check-links` clean
after revision.
