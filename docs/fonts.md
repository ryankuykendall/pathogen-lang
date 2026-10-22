# Fonts

The `Font` namespace answers questions about a font you've loaded with [`@font`](#path-blocks-font-directive): which characters it has, which alphabets and kinds of character those are, what the font is called, and how big its letters are. It also hands you the glyphs themselves (the drawn shape of each character), so you can draw every character a font has without typing them out.

> **Prerequisites:** this page builds on [Font Integration](#path-blocks-font-integration): the `@font` directive and `PathBlock.fromGlyph`, which turns characters you name into glyph PathBlocks. `Font.glyphs` returns exactly the same kind of glyph.

```
@font "Raleway" 700;
let styles = #{ font-family: Raleway; font-weight: 700; font-size: 48; };

let info = Font.info(styles);
log(info.family, info.characterCount);      // Raleway 936

for (script in info.scripts) {
  log(script.name, script.count);           // Latin 481, Cyrillic 238, Common 187, …
}

let cyrillic = Font.glyphs(styles, "Cyrillic");
```

The numbers in this page's comments come from the CLI with the Raleway Bold file in this project's `fonts/` folder. The playground loads Google's current release of Raleway, so expect different counts there: 856 characters rather than 936 (see the next section).

Every `Font` function takes the same style block as `fromGlyph`: `font-family` is required, `font-weight` picks which loaded weight to read (default 400; if that weight isn't loaded, the nearest one is used — write it as a number, since `bold` isn't understood), and `font-size` (default 16) scales the glyphs and the metrics.

## Before you start: what the font file knows

Everything here is read from the font file itself, so the same font file gives the same answers in the CLI and the playground. The CLI reads the file on your disk and the playground reads the one Google Fonts serves, and those can be different releases of the same family: Raleway Bold from Google has 856 characters, while an older download of it has 936.

- **Only characters with their own glyph are listed.** Fonts also contain glyphs that no single character maps to: stylistic alternates, ligatures such as `fi`, and the joined forms Arabic letters take inside a word. `Font.info` counts them (`unmappedCount`), but `Font.glyphs` and `Font.characters` leave them out, because Pathogen has no way yet to ask for them.
- **Scripts, blocks and categories come from Unicode, not from the font.** A font doesn't label its characters as "Cyrillic" or "punctuation". Pathogen looks up each character's *code point* — the number Unicode gives every character: `A` is 65, `ж` is 1078 — in the Unicode tables and groups it from there.
- **Big fonts are big.** A Chinese font such as Noto Sans SC maps more than 13,000 characters (the version Google Fonts serves; the complete file has about 30,000). `Font.glyphs` returns them all if you ask, and logs a warning when one call returns more than 5,000 glyphs. Pass a [selection](#fonts-selections) to draw fewer.
- **The VS Code preview doesn't load fonts yet**, so `Font` functions, like `PathBlock.fromGlyph`, work in the CLI and the playground but not in the VS Code preview. There, a `Font` call stops with the "no fonts were loaded" error listed below.

## Font.info(styles)

Returns an object describing the font.

```
@font "Raleway" 700;
let info = Font.info(#{ font-family: Raleway; font-weight: 700; font-size: 48; });

log(info.style);             // Bold
log(info.capHeight);         // 34.08  (in the units of your drawing, at font-size 48)
for (category in info.categories) {
  log(category.name, category.count);   // letter 739, mark 24, digit 10, number 29, …
}
```

**Names and identity**

| Property | Type | Description |
|---|---|---|
| `family` | string | Family name, e.g. `"Raleway"` |
| `style` | string | Style name, e.g. `"Regular"`, `"Bold Italic"` |
| `fullName` | string | Full name, e.g. `"Raleway Bold"` |
| `version` | string | The font's version string |
| `designer` | string or `null` | Designer, when the font records one |
| `designerUrl` | string or `null` | Designer's website |
| `license` | string or `null` | License description |
| `licenseUrl` | string or `null` | Link to the license |
| `weight` | number | Weight class, 100–900 |
| `isItalic` | boolean | `true` for italic and oblique styles |
| `isMonospace` | boolean | `true` when every glyph has the same width |

**Metrics.** Font designers draw each letter on a square grid called the *em*, which is `unitsPerEm` units on a side. `font-size` sets how big that square comes out, and letters sit inside it: a capital is usually around 70% of the em tall. Every metric below except `unitsPerEm` is already converted to your drawing's units at the style's `font-size`, so `capHeight` is how tall a capital letter will come out.

| Property | Type | Description |
|---|---|---|
| `unitsPerEm` | number | The font's design grid (often 1000 or 2048), unscaled |
| `ascender` | number | Height above the baseline the font reserves for tall letters |
| `descender` | number | Depth below the baseline for letters like `g` and `p` (negative) |
| `lineGap` | number | Extra space the font recommends between lines |
| `capHeight` | number | Height of a flat capital letter such as `H` |
| `xHeight` | number | Height of a lowercase `x` |

**Coverage**

| Property | Type | Description |
|---|---|---|
| `glyphCount` | number | Every glyph in the file, including unmapped ones (see the note below) |
| `characterCount` | number | Characters that have their own glyph |
| `unmappedCount` | number | Glyphs no single character maps to (alternates, ligatures, joined forms) |
| `scripts` | array | `{ name, count }` for each writing system present, most characters first |
| `blocks` | array | `{ name, count, size, start, end }` for each Unicode block present, in code-point order |
| `categories` | array | `{ name, count }` for each [category](#fonts-categories) present, in the order of the Categories table |

A **script** is a writing system: Latin, Cyrillic, Greek, Arabic, Han. Three script names aren't writing systems. `Common` holds characters many scripts share, such as most punctuation and the digits 0–9. `Inherited` holds combining accents, which take on the script of the letter they sit on. `Unknown` holds a font's private-use characters (icons and the like, which have no Unicode meaning).

A **block** is a fixed range of code points in the Unicode chart, with a name: `Basic Latin` is 0–127, `Latin-1 Supplement` is 128–255 (accented letters such as é and ñ, plus symbols such as © and £). `size` is how many code points the block holds, so `count` against `size` tells you how complete the font's coverage of that block is.

```
@font "Raleway" 700;
let info = Font.info(#{ font-family: Raleway; font-weight: 700; });
for (block in info.blocks) {
  log(`${block.name}: ${block.count} of ${block.size}`);   // Basic Latin: 97 of 128, Latin-1 Supplement: 96 of 128, …
}
```

In the playground, a large Google font arrives in slices — separate files that each cover part of the Unicode chart (see [below](#fonts-in-the-playground-loading-the-whole-font)), and the slices can repeat a few shared glyphs. `characterCount`, `scripts`, `blocks` and `categories` come out the same as from the complete font file, but `glyphCount` and `unmappedCount` can be slightly higher there.

## Font.characters(styles, selection?)

Returns the characters the font has, as a string in code-point order. Without a selection that's every character; with one, only those that match.

```
@font "Raleway" 700;
let styles = #{ font-family: Raleway; font-weight: 700; font-size: 32; };

let cyrillic = Font.characters(styles, "Cyrillic");
log(cyrillic.length);                               // 238: how many Cyrillic characters Raleway Bold has
let glyphs = PathBlock.fromGlyph(cyrillic, styles); // the same glyphs Font.glyphs(styles, "Cyrillic") returns
```

## Font.glyphs(styles, selection?)

Returns the font's glyphs as an array of glyph PathBlocks, in code-point order. `Font.glyphs(styles, sel)` gives the same glyphs as `PathBlock.fromGlyph(Font.characters(styles, sel), styles)`, so every [glyph property](#path-blocks-glyph-provenance-and-character-classes) works on them.

A specimen row of every digit the font has, ten to a row. Raleway's digits are old-style figures, so some sit below the line and some rise above it by design:

```
define ViewBox(0, 0, 440, 90);
@font "Raleway" 700;
let styles = #{ font-family: Raleway; font-weight: 700; font-size: 32; };

let digits = Font.glyphs(styles, "digit");

for ([glyph, i] in digits) {
  M calc(20 + (i % 10) * 40) calc(50 + floor(i / 10) * 50)
  glyph.draw()
}
```

Spaces and other characters with no outline are included (their `isEmpty` is `true`); filter them out if you're drawing a grid.

## Selections

The optional second argument of `Font.characters` and `Font.glyphs` narrows the result. Only characters the font actually has are returned, so asking for a block the font barely covers is fine — you get what's there, without placeholder boxes or missing-glyph warnings.

| Selection | Example | Picks |
|---|---|---|
| A script name | `"Cyrillic"` | Characters of that writing system, across all its blocks |
| A block name | `"Latin-1 Supplement"` | Characters in that range of the Unicode chart |
| A category name | `"digit"` | Characters of that kind (see below) |
| An array of code points | `(48..57)` | Exactly those characters (here the digits 0–9) |
| An object | `{ script: "Cyrillic", category: "letter" }` | Every listed condition at once |

The object form takes any of `script`, `block`, `category` and `codePoints`, and a character must match all of them. It's also how you choose between a script and a block that share a name: `"Cyrillic"` on its own means the **script** (every Cyrillic letter, including the extension blocks), and `{ block: "Cyrillic" }` means just the 256-code-point block. When a string matches more than one kind, a category wins over a script, and a script over a block.

Names are matched without regard to case. A name that matches nothing is an error that suggests the closest names, so a typo never quietly returns nothing. The names a font actually covers are the ones in `Font.info(styles).scripts`, `.blocks` and `.categories`.

### Categories

Every character falls into exactly one category, taken from its Unicode general category:

| Name | What it covers | Example |
|---|---|---|
| `letter` | Letters of any script, upper- and lowercase, plus CJK ideographs | `A`, `ж`, `中` |
| `mark` | Combining marks that sit on the previous letter | the accent in `é` written as e + ́ |
| `digit` | Decimal digits, in any script | `0`–`9`, `٣` |
| `number` | Other numerals: Roman numerals, fractions, superscripts | `Ⅻ`, `½`, `²` |
| `punctuation` | Punctuation and brackets | `.`, `«`, `(` |
| `symbol` | Math, currency, arrows and other symbols | `+`, `€`, `→` |
| `whitespace` | Spaces of every width, tabs and line breaks | space, no-break space, ideographic space |
| `other` | Everything else: control and formatting characters, private-use characters | |

`category` follows Unicode's White_Space list, so it can differ from a glyph's older `isWhitespace` / `isSpace`: the zero-width no-break space U+FEFF is `isSpace`, but its category is `other`.

`Font.info(styles).categories` lists the ones present, so you can see at a glance whether a font has, say, any symbols at all.

## Glyph properties for scripts and categories

Every glyph PathBlock — from `Font.glyphs` or from `PathBlock.fromGlyph` — also carries these properties, alongside the existing `char`, `codePoint` and `is…` ones:

| Property | Type | Description |
|---|---|---|
| `script` | string | The character's writing system, e.g. `"Latin"`, `"Cyrillic"`, `"Common"` |
| `block` | string | Its Unicode block, e.g. `"Latin-1 Supplement"` |
| `category` | string | Its [category](#fonts-categories), e.g. `"letter"` |
| `isLetter` | boolean | `category == "letter"` |
| `isDigit` | boolean | `category == "digit"` |
| `isPunctuation` | boolean | `category == "punctuation"` |
| `isSymbol` | boolean | `category == "symbol"` |
| `glyphName` | string or `null` | The name the font gives the glyph, e.g. `"Aacute"` or `"one"`. Many large fonts, Chinese ones especially, leave names out; then it's `null` |

```
@font "Raleway" 700;
let styles = #{ font-family: Raleway; font-weight: 700; font-size: 40; };

for (glyph in Font.glyphs(styles, "Latin-1 Supplement")) {
  if (glyph.isLetter) { log(glyph.char, glyph.glyphName); }    // ª ordfeminine, µ uni00B5, º ordmasculine, À Agrave, …
}
```

## In the playground: loading the whole font

Google Fonts serves large families in slices, and the playground normally downloads only the slices your text uses (see [Font Integration](#path-blocks-font-integration)). The `Font` functions need to see the characters you ask about, so the playground fetches the slices that cover them before your program's result is shown:

- A selection fetches only the slices it overlaps. `Font.glyphs(styles, "Cyrillic")` on Raleway fetches the Cyrillic slices and nothing else. A category selection such as `"digit"` can't be narrowed to a range of the chart, so it fetches every slice.
- `Font.info`, or `Font.characters` / `Font.glyphs` with no selection, needs the whole font, so every slice is fetched. For a large family that can be several megabytes; when they arrive, a note in the warning banner says how many slices were loaded. After that the slices stay loaded for the rest of your session.

The CLI reads the complete font file, so it never needs this step.

## Errors and warnings

| Condition | Message |
|---|---|
| First argument isn't a style block | `Font.glyphs(): first argument must be a style block, e.g. #{ font-family: Inter; }` |
| Wrong number of arguments | `Font.glyphs() expects 1 or 2 arguments (styles, selection?)` · `Font.info() expects 1 argument (styles)` |
| No `font-family` in the style block | `Font.glyphs() requires font-family in the style block` |
| A whole family was loaded (playground, warning banner — a note, not a problem) | `Loaded all 101 slices of "Noto Sans SC" from Google Fonts (4.4 MB) for a Font call that needs the whole font.` |
| A slice of the font couldn't be downloaded (playground, warning banner) | `2 of 18 slices of "Noto Sans SC" could not be loaded; Font results may be incomplete.` |
| The family wasn't loaded with `@font` (other fonts were) | `Font.info(): font 'Raleway' is not loaded. Add @font "Raleway";` |
| No font was loaded at all (no `@font`, a font that failed to load, or the VS Code preview) | `Font.info(): no fonts were loaded. Add @font "Raleway"; — if you already have, look for a font-loading error above.` |
| Unknown selection name | `Font.glyphs(): no script, block or category named 'Cyrilic'. Did you mean 'Cyrillic'?` |
| A selection that's not a name, array or object (e.g. a number) | `Font.glyphs(): selection must be a name, an array of code points, or an object such as { script: "Cyrillic" }` |
| Unknown category in a selection object | `Font.glyphs(): no category named 'glyph'. Categories are letter, mark, digit, number, punctuation, symbol, whitespace, other` |
| A non-string name in a selection object, e.g. `{ script: 3 }` | `Font.glyphs(): selection 'script' must be a name (a string)` |
| Selection object with an unknown key | `Font.glyphs(): selection keys are script, block, category and codePoints — got 'kind'` |
| Empty selection object `{}` | `Font.glyphs(): a selection object needs at least one of script, block, category or codePoints` |
| `codePoints` that isn't an array | `Font.glyphs(): codePoints must be an array of whole numbers, such as (48..57)` |
| A code-point array with a non-number in it | `Font.glyphs(): codePoints must be whole numbers from 0 to 1114111` |
| More than 5,000 glyphs from one call (warning) | `Font.glyphs() returned 13,633 glyphs from 'Noto Sans SC' — pass a selection to draw fewer` |
