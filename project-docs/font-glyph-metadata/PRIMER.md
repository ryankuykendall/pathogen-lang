# Font Glyph Metadata Primer

*Research session, 2026-07-26. Question: what metadata do our web fonts carry —
per file and per glyph — and can we iterate every glyph in a font (and its
contours) without knowing the font's contents beforehand?*

All findings below were **empirically verified** against the project's actual
pipeline (opentype.js 1.3.4 parsing real Google Fonts binaries) using the probe
scripts in this directory.

## TL;DR

- **The font file itself is the manifest.** Blind iteration over every glyph —
  with names, Unicode assignments, metrics, and contours — works today with the
  opentype.js `Font` object we already build in `src/evaluator/font-provider.ts`.
- **Fonts contain no semantic categories** ("digits", "punctuation"). But each
  glyph's Unicode code point makes categories a one-liner via JS Unicode
  property escapes (`\p{Nd}`, `\p{P}`, `\p{Script=Han}`, …). Verified across
  Latin, Chinese, Arabic, and Cyrillic fonts.
- **Enumeration is script-agnostic; *shaping* is not.** A glyph-specimen
  feature generalizes to every script. A text-to-outlines feature is correct
  for Latin/Cyrillic/Greek/CJK but produces *wrong* (not merely degraded)
  output for Arabic/Persian without a shaping engine (HarfBuzz).
- **Landmine:** `playground/services/font-loader.ts` picks the `/* latin */`
  subset block from Google Fonts CSS. For a CJK font that block contains
  **zero Han glyphs** — the browser-visible glyph inventory is the subset, not
  the family.

## 1. The pipeline we have

Both surfaces end with a raw TTF `ArrayBuffer` parsed by opentype.js:

- **Playground**: `font-loader.ts` fetches Google Fonts css2 → picks the
  `/* latin */` `@font-face` block → fetches WOFF2 → decompresses via wawoff2
  (`vendor/woff2-decompress.js`) → TTF buffer.
- **CLI**: reads font files directly.
- **Parse**: `font-provider.ts` `getParsedFont()` → `opentype.parse(buffer)`,
  cached on `FontData._parsed`.

Current consumers use only: `getAdvanceWidth`, vertical metrics
(ascender/descender/`os2.sTypoLineGap`), and `charToGlyph(...).getPath()`
(per-character outlining for `PathBlock.fromGlyph` and the PDF text outliner).

## 2. The "manifest": sfnt tables

An OpenType/TrueType file is a keyed collection of binary tables (the sfnt
table directory); opentype.js parses them into `font.tables`. Raleway 400
(full TTF) contains: `os2, cmap, cvt, fpgm, head, hhea, maxp, post, prep,
name, gdef, gpos, gsub`.

| Table | What you get |
|---|---|
| `maxp` | `font.numGlyphs` — total glyph count, the iteration bound |
| `cmap` | `font.tables.cmap.glyphIndexMap` — code point → glyph index. Answers "what characters does this font support" |
| `head` | `font.unitsPerEm` (coordinate scale), global bbox |
| `hhea` / `os2` | ascender, descender, line gap, `usWeightClass`, `ulUnicodeRange1–4` (coarse per-font Unicode-block coverage bits) |
| `name` | family/style names, designer, license |
| `post` | per-glyph PostScript names (`Aacute`, `period`, `one`) — **absent in large CJK fonts** (post v3) |
| `glyf`/`loca` or `cff` | the outlines (quadratic vs cubic) |
| `gsub` | substitutions: ligatures, contextual forms, alternates |
| `gpos` | positioning: kerning, mark attachment |

## 3. Per-glyph metadata (blind iteration)

`font.glyphs.get(i)` for `i in [0, font.numGlyphs)` — no prior knowledge
needed. Each `Glyph` has:

| Property | Notes |
|---|---|
| `index` | glyph ID |
| `name` | PostScript name; `undefined`/absent for CJK post-v3 fonts |
| `unicode` / `unicodes` | code point(s); **`undefined` for GSUB-only glyphs** (ligatures, contextual forms, alternates) |
| `advanceWidth`, `leftSideBearing` | font units (divide by `unitsPerEm`, scale by font size) |
| `getPath(x, y, fontSize)` | M/L/C/Q/Z commands — what `glyphToPathBlockCommands` consumes; `splitContours()` in font-provider already groups per contour |
| `getContours()` | raw points with `onCurve` flags — **v1 quirk: returns `undefined` until the lazy glyph parse runs; touch `glyph.path` first** |
| `getBoundingBox()`, `getMetrics()` | tight bbox, side bearings |

Glyph #0 is always `.notdef` (the tofu box).

## 4. Categories: derive from Unicode, not the font

No font table groups glyphs semantically. The robust recipe:

```js
const ch = String.fromCodePoint(glyph.unicode);
/\p{Nd}/u.test(ch)            // digit
/\p{P}/u.test(ch)             // punctuation
/\p{Lu}/u.test(ch)            // uppercase letter
/\p{Script=Han}/u.test(ch)    // Chinese
/\p{Script=Arabic}/u.test(ch) // Arabic (incl. Persian letters)
```

Unicode *blocks* (Latin-1 Supplement = U+00A0–00FF, …) are plain ranges.
Glyphs with `unicode === undefined` are GSUB-only — skip or bucket separately.

Glyph-*name* conventions (AGL: `one`, `period`, `Aacute`) work as a secondary
signal for Latin fonts but die on CJK (no names) — always prefer the code point.

(Per-*family* category — serif/sans-serif/monospace — lives in our curated
list at `playground/utils/google-fonts.ts`, not in the font.)

### Verified histograms

**Raleway 400** (full TTF, 1,018 glyphs, 936 encoded): 354 uppercase,
366 lowercase, 10 digits, 50 punctuation, 71 symbols, 8 spaces, 77 other
(mostly combining marks), 82 unencoded.

**Noto Sans SC** (10.3 MB, 30,796 glyphs, glyf outlines): 27,835 Han,
298 Katakana, 90 Hiragana, 157 Hangul, 345 Latin, 66 Cyrillic, 50 Greek,
1,072 symbols, 403 unencoded. Glyph names absent (`post` v3).

**Noto Naskh Arabic** (193 KB, 1,712 glyphs): 1,093 Arabic, 16 Arabic-Indic
digits (distinguished from 10 European digits), 219 Latin, 249 unencoded —
the unencoded ones are the contextual forms: `uni066E.init`, `uni066E.medi`,
`uni066E.fina`, `uni0627.fina.rlig`, …

**Roboto** (121 KB, 1,036 glyphs): 369 Latin, 273 Cyrillic, 74 Greek —
Cyrillic/Greek behave exactly like Latin.

## 5. Enumeration vs shaping — where the can of worms lives

Two different operations with opposite difficulty profiles:

**"Show me every glyph in this font"** (specimen grid, iterate-and-outline):
script-agnostic, works today. A Han glyph is just contours + metrics like `a`.

**"Turn this *text* into glyphs"** (shaping):

| Script | Per-char `charToGlyph` correctness |
|---|---|
| Latin / Cyrillic / Greek | Correct. Optional ligatures (fi, fl) skipped — cosmetic only |
| CJK | Correct. No joining; one code point → one glyph. Problems are logistical (size, subsetting) |
| Arabic / Persian | **Wrong output.** Verified: `charToGlyph` on محمد returns four *isolated* forms. Correct rendering needs GSUB contextual forms (init/medi/fina), *mandatory* ligatures (`rlig`, lam-alef), RTL ordering, GPOS mark positioning |
| Indic (Devanagari, …) | Harder still — glyph reordering |

**opentype.js has no shaping engine** — it parses GSUB/GPOS but does not apply
them. The standard fix is HarfBuzz via WASM (`harfbuzzjs`, ~1 MB): text →
positioned glyph IDs, then opentype.js extracts outlines by glyph index.
Browser dodge: SVG `<text>` is shaped by the browser, so Arabic renders fine
until a code path *outlines* text via opentype.js — `playground/utils/
svg-text-outliner.ts` (PDF export) and `PathBlock.fromGlyph` are per-char and
would both break on Arabic today.

## 6. The subsetting landmine (project-specific)

Google Fonts serves browsers per-Unicode-block subsets via `unicode-range`.
Verified with a Chrome UA: **Noto Sans SC css2 response = 101 `@font-face`
blocks**, each a ~300-glyph slice — and it *does* include a `/* latin */`
block, which is the one `font-loader.ts` `extractFontUrlFromGoogleFontsCss`
picks. Consequences:

- In the playground, "iterate this font's glyphs" on a CJK font would
  enumerate a latin slice with **no Han glyphs at all**.
- Arabic families ship a handful of blocks; the latin-preferring picker still
  grabs the wrong one for Arabic text.
- Node/CLI with a non-browser UA receives the **full unsubsetted TTF**
  (that's how the probes here got complete inventories) — so CLI and
  playground can silently disagree about a font's glyph inventory.

Supporting CJK/Arabic in the playground means fetching the right slice(s) on
demand (what browsers do via `unicode-range`) or accepting multi-MB downloads.

## 7. Recommended feature boundary

A glyph-inventory/specimen feature needs no new data source:
`font.numGlyphs` + `font.glyphs.get(i)` + Unicode-property classifier, from
the buffer already in `FontRegistry`. It generalizes to every script (mind the
CJK no-names caveat). A text-rendering feature generalizes to Cyrillic/Greek
and CJK nearly for free; **Arabic/Persian require HarfBuzz** — draw the
feature boundary there. Either way, the subset picker in `font-loader.ts` is
the first thing that needs work for non-Latin support.

## Probe scripts (runnable)

- `glyph-probe.mjs` — font-level metadata, blind glyph iteration, category histogram (Raleway)
- `contour-probe.mjs` — the `getContours()` lazy-parse quirk + raw contour points
- `script-probe.mjs` — CJK/Arabic/Cyrillic histograms, Arabic shaping failure demo, browser-UA subsetting count

Run with `node project-docs/font-glyph-metadata/<script>` from the repo root
(they resolve opentype.js out of the project's node_modules via
`createRequire`, and fetch fonts live from Google Fonts with a curl UA to get
full unsubsetted TTFs).
