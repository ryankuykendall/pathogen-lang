# Glyph listing — proposal v1 (2026-10-19)

Request (user): "If I am downloading a font from Google Fonts, do we have a way to
iterate over each of the available glyphs in the font?" → "Let's add the
glyph-listing API."

Background research: [`../font-glyph-metadata/PRIMER.md`](../font-glyph-metadata/PRIMER.md)
(2026-07-26). The parsed opentype.js `Font` the evaluator already holds can
enumerate every glyph (`numGlyphs`, `glyphs.get(i)`, unicode, contours).

## What existing members already say

| Today | What it gives |
|---|---|
| `@font "Inter";` | Host loads the font before compile (CLI: file on disk, full font; playground: Google Fonts, Latin slice first, more slices fetched when text needs them) |
| `PathBlock.fromGlyph(text, styles)` | One glyph PathBlock **per character you name** |
| glyph props `char`, `codePoint`, `isWhitespace`, `isSpace`, `isTab`, `isNewline`, `isMark`, `isEmpty`, `contours`, `advanceWidth` | Provenance and classification of each glyph |
| `(a..b)` | Range as an array of numbers — usable as a list of code points |

Missing: a way to ask the font **which characters it has**.

## Proposed API (recommended shape)

```
@font "Inter";
let styles = #{ font-family: Inter; font-size: 48; };

let all = PathBlock.fromFont(styles);                 // every character Inter has a glyph for
let cyrillic = PathBlock.fromFont(styles, (1024..1279)); // only these code points (those the font has)

for (g in all.filter((g) => g.isDigit)) { … }
```

- Name parallels `fromGlyph` and takes the **same `styles` argument** (family, weight, size).
- Returns glyph PathBlocks in code-point order — identical to what `fromGlyph`
  returns for the same characters, so every existing glyph property works.
- Optional second argument: an array of code points (a range value). Only code
  points the font actually maps are returned — no placeholder boxes, no
  missing-glyph warnings.
- New classification properties on every glyph PathBlock (fromGlyph too), in the
  style of the existing `is*` family: `isLetter`, `isDigit`, `isPunctuation`,
  `isSymbol` (from Unicode general categories), so filtering doesn't need regex.
- v1 lists **mapped glyphs only** (glyphs with a Unicode code point). Unmapped
  glyphs — stylistic alternates, ligature glyphs, `.notdef` — have no `char`
  and can't round-trip through `fromGlyph`; left out.

## Surfaces

| Surface | How it gets the whole inventory |
|---|---|
| CLI | Reads the full font file — works as is |
| Playground | Split Google families (CJK ≈ 100 slices) only have the slices fetched so far. The evaluator records the code points a `fromFont` call asked for; the host fetches the slices whose `unicode-range` covers them and recompiles (the existing missing-glyph loop, ≤ 2 passes). With no range argument it fetches every slice and says so in the warning banner (size + count). |
| VS Code preview | **Pre-existing gap: the preview loads no fonts at all**, so `fromGlyph` / `toPathBlock` already fail there. `fromFont` would inherit it. |

## Open questions for the user

1. API shape: `PathBlock.fromFont(styles, codePoints?)` (recommended) vs. a
   separate `Font` namespace (`Font.glyphs(styles)`, `Font.characters(styles)`).
2. Add `isLetter / isDigit / isPunctuation / isSymbol` (recommended), a single
   `category` string (`"Lu"`, `"Nd"`, …), both, or neither.
3. VS Code font gap: fix font loading in the VS Code preview as part of this
   work (parity rule says yes), or file it separately.
4. Large fonts: a CJK family has 20 000+ glyphs. Cap / warn above some count,
   or no limit.
