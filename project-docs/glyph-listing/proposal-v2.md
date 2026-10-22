# Glyph listing — proposal v2 (2026-10-19)

Supersedes the API shape in [proposal-v1.md](proposal-v1.md) after the user's answers:

- **Font namespace** ("the more intuitive direction") — not `PathBlock.fromFont`.
- **`isLetter` / `isDigit` / `isPunctuation` / `isSymbol`** booleans on glyph PathBlocks.
- **VS Code font gap → separate follow-up** (pre-existing: the preview loads no fonts).
- **Warn above 5,000 glyphs** returned by one call.
- Open: "what other metadata is available or could be available … such that they
  could request latin-1 vs. cyrillic, etc. What else should we expose?"

## Ground rule: everything comes from the font file

Each surface parses the same TTF with opentype.js, so only data in the file (or
derived from its code points with Unicode tables we ship) behaves the same in
CLI, playground and VS Code. Google's subset names (`latin`, `latin-ext`,
`cyrillic`, …) are *not* in the font — they're labels in the playground's
download — so the API uses **Unicode scripts and blocks**, which every surface
can compute identically. (Verified data sources: `../font-glyph-metadata/PRIMER.md`.)

## What's available

### Coverage — the "Latin-1 vs Cyrillic" question
| Data | Source | Example |
|---|---|---|
| Characters the font maps | `cmap` | 936 characters in Raleway |
| **Unicode scripts** covered, with counts | code points × Unicode Script property (JS `\p{Script=…}`) | `Latin 369 · Cyrillic 273 · Greek 74` (Roboto) |
| **Unicode blocks** covered, with counts and the block's size | code points × the Unicode block table (~330 named ranges; small table to ship) | `Basic Latin 95/95 · Latin-1 Supplement 96/96 · Cyrillic 255/256 · Latin Extended-A 128/128` |
| Glyphs with no character | glyph count − mapped | 82 in Raleway (alternates, ligatures, contextual forms) |

### Names and identity (`name`, `OS/2`, `post` tables)
family, style ("Bold Italic"), full name, version, designer, designer URL,
license text/URL, weight class (100–900), italic, monospace (fixed pitch).

### Metrics (`head`, `hhea`, `OS/2`) — in user units at the styles' font-size
unitsPerEm, ascender, descender, line gap, cap height, x-height.
(TextBlock's "Font Metrics" section already exposes some of these per text
value; the font-level object would be the canonical home.)

### Variable fonts (`fvar`)
axes with min / default / max (e.g. `wght 100–900`, `wdth 75–125`) and named
instances ("Light", "Bold Condensed"). Useful for knowing which weights exist.

### OpenType features (`GSUB` / `GPOS`)
feature tags present: `liga`, `kern`, `smcp`, `onum`, `ss01`… **Informational
only** — Pathogen has no shaping engine, so it can't apply them yet.

### Per glyph (beyond today's char / codePoint / is* / contours / advanceWidth)
| Property | Notes |
|---|---|
| `isLetter`, `isDigit`, `isPunctuation`, `isSymbol` | chosen |
| `script` | `"Latin"`, `"Cyrillic"`, `"Han"`, `"Common"` (punctuation/digits shared by scripts) |
| `block` | `"Latin-1 Supplement"`, `"Cyrillic"` |
| `glyphName` | PostScript name (`Aacute`, `one`); `null` in big CJK fonts that omit names |

## Proposed surface

```
@font "Roboto";
let styles = #{ font-family: Roboto; font-size: 48; };

let info = Font.info(styles);
log(info.family, info.style, info.characterCount);    // Roboto Regular 936
for (s in info.scripts) { log(s.name, s.count); }      // Latin 369, Cyrillic 273, Greek 74
for (b in info.blocks)  { log(b.name, b.count, b.size); }

let latin1   = Font.glyphs(styles, "Latin-1 Supplement");   // a block…
let cyrillic = Font.glyphs(styles, "Cyrillic");             // …or a script…
let digits   = Font.glyphs(styles, (48..57));               // …or code points
let chars    = Font.characters(styles, "Greek");            // the same selection as a string

for (g in cyrillic.filter((g) => g.isLetter)) { … }
```

- `Font.glyphs(styles, selection?)` → glyph PathBlocks in code-point order,
  identical to `PathBlock.fromGlyph` for those characters (same properties).
- `Font.characters(styles, selection?)` → string, for `fromGlyph`, TextBlocks, logs.
- `Font.info(styles)` → object: names, metrics, counts, scripts, blocks
  (+ axes and features if chosen).
- `selection` = a script name, a block name, or an array of code points.
  Unknown names are an error listing close matches. Only characters the font
  has are returned.
- Playground: a script/block/code-point selection tells the host which
  Google slices to fetch (only those whose `unicode-range` overlaps); no
  selection or `Font.info` on a split family fetches all slices, reported in
  the warning banner. CLI reads the full file.

## Open questions

1. Which metadata groups go in v1? (coverage + names + metrics recommended;
   variable axes and feature tags optional)
2. Per-glyph `script` / `block` / `glyphName` — include?
3. Unmapped glyphs (alternates, ligature glyphs): still out of v1?

## Decisions (user, 2026-10-19)

1. `Font.info()` v1 groups: **coverage, names & identity, metrics.** Variable axes and OpenType feature tags: not in v1.
2. Per-glyph properties: **`script`, `block`, `glyphName`** (plus the chosen `isLetter` / `isDigit` / `isPunctuation` / `isSymbol`).
3. Unmapped glyphs: **left out of v1** (`Font.info` reports how many there are).
4. Mid-turn addition: **"we should allow the user to get the list of categories available in a font."** → `Font.info(...).categories` lists the character categories present with counts (letter, digit, punctuation, symbol, mark, whitespace, other), and a category name is a valid `selection` (`Font.glyphs(styles, "digit")`).
