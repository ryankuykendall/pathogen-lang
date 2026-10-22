# Blog synopsis v1 — the Font namespace (post57)

**Title:** "What's in the Font? Reading the Packing List"

**Synopsis (~250 words).** A font file is a box of drawings with a packing list taped inside the lid, and until now Pathogen only let you reach in for a drawing you already knew the name of: `PathBlock.fromGlyph("A", styles)`. This post introduces the three `Font` functions that read the packing list. It opens with the smallest possible question — `Font.characters(styles, "digit")` answers "which digits does this font have?" with a ten-character string — then climbs one idea at a time: `Font.info` turns the list into numbers (Raleway Bold has 936 characters: 481 Latin, 238 Cyrillic, 187 shared punctuation and digits), selections narrow it by writing system, chart block or kind of character, and `Font.glyphs` hands back drawable glyphs that already know their script, category and name. Along the way it translates the vocabulary the API leans on — code point, script vs block, the em — with one concrete picture each, and it is honest about the edges: glyphs without a character (ligatures, alternates) are counted but not drawable yet, Google's web copy of a font can differ from the file on your disk, and a Chinese font is 13,000+ glyphs. It ends with a shippable piece: a one-page type specimen generated entirely from the font — name and metrics drawn as labelled guide lines, every Latin-1 letter in a grid, and a coverage bar per script — that redraws itself for any family you swap in.

**Audience:** people who build things with code; assumes `@font` / `fromGlyph` (Prerequisites callout linking Font Integration and docs/fonts.md). Standalone — not part of a series, no snapshots tie-in.

**Samples (website/blog/samples/post57/, Raleway Bold from the repo's fonts/):**
1. `digits.pathogen` — `Font.characters(styles, "digit")` drawn as one row (the bare mechanism).
2. `coverage-bars.pathogen` — `Font.info(...).scripts` as labelled horizontal bars.
3. `two-alphabets.pathogen` — Latin vs Cyrillic capitals from one font, rows selected with `{ script, category }`.
4. `kinds-of-character.pathogen` — punctuation and symbols grid via `isPunctuation` / `isSymbol`.
5. `specimen.pathogen` — the finished specimen page (metrics guides from `capHeight` / `xHeight` / `ascender` / `descender`, Latin-1 letter grid, script coverage bars).
