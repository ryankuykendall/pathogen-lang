---
title: "What's in the Font? Reading the Packing List"
slug: whats-in-the-font
date: 2026-10-20
description: "Font.info, Font.characters and Font.glyphs ask a font what it contains — its writing systems, its kinds of character, its metrics — and hand back glyphs that know what they are."
---

> **Prerequisites:** This post assumes you have loaded a font with
> [`@font`](/docs#path-blocks-font-directive) and drawn a glyph with
> `PathBlock.fromGlyph`. If not, start with
> [From Fonts to Paths](/blog/pathblock-glyph-extraction). The full
> reference for everything below is the [Fonts](/docs#fonts-fonts) page.

A font file is a box of drawings with a packing list taped inside the
lid. Each drawing, a **glyph**, is the shape of one character, and the
packing list says which character each glyph is for. Until now, Pathogen
let you reach into the box only for a drawing you could already name:
`PathBlock.fromGlyph("A", styles)` works when you know to ask for `A`.

Three functions read the packing list itself. `Font.characters` returns
the characters a font has, as a string. `Font.glyphs` returns them as
drawable glyphs. `Font.info` describes the whole box: names, sizes, and
counts by writing system. That's what you need to check that a font
covers your readers' languages before you commit to it, to build a
character picker, or to make a generative piece out of every glyph a
font has. This post climbs from a ten-character string
to a type specimen that reads everything it shows from the font.

## What to know first

- **The numbers here come from one file.** Every sample uses Raleway
  Bold, compiled in the CLI from the font file in this project's
  `fonts/` folder. Open a sample in the playground and Google Fonts
  serves its own current release of Raleway, which lists 856 characters
  rather than 936. Same functions, different box.
- **Some glyphs aren't on the packing list.** A font can hold drawings no
  single character points to: ligatures such as a joined `fi`, alternate
  shapes, letters that join differently mid-word. Raleway Bold has 81 of
  them, plus one every font carries: the empty box drawn for a character
  it doesn't have. That's why 936 characters and 81 extras come to 1,018
  glyphs. `Font.info` counts them as `unmappedCount`, but none of the three
  functions can hand them to you yet.
- **Big fonts are big.** A Chinese font such as Noto Sans SC maps more
  than 13,000 characters, and `Font.glyphs` warns past 5,000. In the
  playground, where Google delivers a large font in pieces, `Font.info`
  and any category selection (such as `"digit"`) read the whole font:
  about 4 MB for Noto Sans SC. A script, block or code-point selection
  downloads only the pieces it touches.
- **The VS Code preview doesn't load fonts yet**, so `Font` calls, like
  `fromGlyph`, work in the CLI and the playground but not there.

## The font writes the string

`fromGlyph` takes a string of characters and returns one glyph per
character. In the top row below, you typed that string. In the bottom
row, the font wrote it: `Font.characters(styles, "digit")` returns every
digit the font has, as an ordinary string, and the string goes into
`fromGlyph` in exactly the same place.

<mini-workspace src="samples/post57/01-digits.pathogen" caption="Top: ten digits typed by hand. Bottom: the same call, with the string supplied by Font.characters(styles, &quot;digit&quot;). The result is an ordinary ten-character string." code-open></mini-workspace>

The two rows match, and that is the point: nothing downstream of the
string changed. The difference is who knew which characters exist. For
digits you could have typed them yourself. For a font's Cyrillic, or
every accented capital it carries, you couldn't, and that is where the
font's own list earns its place.

"digit" is a **category**, the kind of character something is. There are
eight: letter, mark (a combining accent), digit, number (other numerals
such as ½ or ²), punctuation, symbol, whitespace and other. The
categories come from Unicode, not from the font, which is why every font
answers the same question the same way.

(The digits dip and rise because Raleway's figures are *old-style*:
some sit below the line and some climb above it, like lowercase letters.
That's the design, not a layout bug.)

## Reading the packing list

`Font.info(styles)` returns an object describing the font. Its
`scripts` property lists the **writing systems** the font covers, Latin,
Cyrillic, Greek and so on, each with a count, most characters first.

<mini-workspace src="samples/post57/02-coverage-bars.pathogen" caption="Font.info(styles).scripts for Raleway Bold, one bar per script, with the first few glyphs of each drawn beside it. Accents (Inherited) are drawn over an o, since they have no width of their own." code-open></mini-workspace>

Three of those names aren't writing systems. **Common** holds characters
many scripts share: most punctuation, the digits 0–9, currency signs.
**Inherited** holds combining accents, which take on the script of
whatever letter they sit on. **Unknown** holds characters Unicode gives
no meaning to: Raleway's single one sits at a *private-use* code point,
one Unicode leaves free for a font to use as it likes, and holds a
helper glyph its designer named `commaaccent`.

Look twice at the Cyrillic row, too. Its first characters, Ѐ and Ё, are
drawn exactly like Latin È and Ë, and Ѕ like S. Same shape, different
character, which is why a font lists them separately.

A count tells you a script is present, not that it is complete. Raleway's
five Greek characters aren't an alphabet. They are Δ, π, μ and two
different Ω, the Greek letter and the ohm sign, kept for mathematics and
units. When completeness matters, look at `blocks` instead. A **block**
is a fixed, named stretch of the Unicode chart, so each entry can say how
much of it the font fills:

```pathogen
@font "Raleway" 700;
let info = Font.info(#{ font-family: Raleway; font-weight: 700; });
for (block in info.blocks) {
  log(`${block.name}: ${block.count} of ${block.size}`);
}
// Basic Latin: 97 of 128, Latin-1 Supplement: 96 of 128, …
```

Read `size` with care: it counts every code point in the block, including
invisible control codes no font draws. Latin-1 Supplement's first 32 are
controls, so 96 of 128 means Raleway has every printable character in
the block (the next sample shows all 96), and Basic Latin's 97 is every
printable character there too.

## Asking for part of the list

Both `Font.characters` and `Font.glyphs` take an optional second
argument, a **selection**, that narrows the answer. A name selects a
script (`"Cyrillic"`), a block (`"Latin-1 Supplement"`) or a category
(`"punctuation"`). Misspell one and the error suggests the closest real
name.

A selection can also be a list of **code points**. A code point is the
number Unicode gives every character: `A` is 65, `ж` is 1078. Capitals
aren't one of the eight categories, but within one alphabet they are
usually a run of numbers, so a range selects them. *Usually*: Russian's
Ё sits apart at 1025, so the А–Я range below draws 32 of its 33
capitals. To include it, list code points yourself: any array of them,
such as `[1025, 1040, 1041]`, works as a selection.

<mini-workspace src="samples/post57/03-two-alphabets.pathogen" caption="Capitals by code-point range: A–Z is 65 to 90, А–Я is 1040 to 1071. Each glyph is centred in its cell over its code point." code-open></mini-workspace>

To combine conditions, pass an object. Every key must match, so this asks
for the letters in the Latin-1 Supplement block, leaving out its
punctuation, symbols and fractions (65 of Raleway's 96; the specimen at
the end uses exactly this):

```pathogen
let accentedLetters = Font.glyphs(styles, { block: "Latin-1 Supplement", category: "letter" });
```

The keys are `script`, `block`, `category` and `codePoints`. The
[Selections](/docs#fonts-selections) reference has the full rules.

## Glyphs that know what they are

Every glyph `Font.glyphs` returns, and every glyph from `fromGlyph`,
now carries what Unicode says about its character: `script`, `block`,
`category`, `isLetter`, `isDigit`, `isPunctuation`, `isSymbol`, and the
`glyphName` the designer gave it, alongside the older `char`,
`codePoint`, `isMark` and `isEmpty`. So code can sort glyphs by kind
without a hand-made table of which character is which.

Below, the whole Latin-1 Supplement block is laid out like a code chart,
one cell per code point, and each glyph picks its layer, and so its
colour, from its own properties.

<mini-workspace src="samples/post57/04-kinds-of-character.pathogen" caption="Font.glyphs(styles, &quot;Latin-1 Supplement&quot;) in code-point order, sixteen to a row, tinted by what each glyph says about itself. The legend counts are gathered in the same loop." code-open></mini-workspace>

A few cells are worth a second look. ª and º are letters, not symbols:
Spanish and Portuguese use them in ordinals such as 1º. The superscript
digits ¹ ² ³ and the fractions are *numbers*, not digits, because
`digit` means the ten plain digits of a script. µ is a letter in the
Common script: the micro sign is a different character from the Greek μ in
the Greek block, and a font draws the two separately. The first cell,
160, is the no-break space, which draws nothing, and the dash marked O is
the soft hyphen, an invisible line-break hint that this font gives a
visible shape.

## A specimen that reads itself

A type specimen is the sheet a foundry (the company that makes and
sells a typeface) prints to show off a font: its
name, its proportions, its characters, its reach. Here is one where every
part comes from the font, so nothing on it was typed in from a
datasheet.

<mini-workspace src="samples/post57/05-specimen.pathogen" caption="Raleway Bold's specimen: the name set in the font itself, vertical metrics drawn as guide lines, every Latin-1 letter, and up to five of its scripts. Change the family line at the top and it redraws." code-open></mini-workspace>

From the top:

- **The name** is `info.fullName`, drawn with `fromGlyph` in the font it
  names. It is measured first, by adding up its glyphs' `advanceWidth`,
  and set smaller if it wouldn't fit across the page.
- **The guide lines** come from `Font.info`'s metrics. Type designers
  draw each letter on a square grid called the *em*; Raleway's is 1,000
  units on a side, and `font-size` sets how big that square comes out.
  `Font.info` has already scaled each metric to the style's font-size,
  so `capHeight` is how tall an `H` will be in your drawing, and the
  guide line goes exactly there. The *x-height* is the height of a
  lowercase x; the *ascender* and *descender* are the room the font
  reserves above and below the baseline for tall letters and for the
  tails of g and p. The labels are in those same drawing
  units, at the font-size the eyebrow names. The baseline sits as low as
  this font's ascender needs, so a tall font gets a taller band.
- **The letters** are one selection object:
  `{ block: "Latin-1 Supplement", category: "letter" }`, wrapped using
  each glyph's `advanceWidth`. The specimen tries sizes from 10 to 20
  and keeps the largest whose lines fit the space left over.
- **The scripts** are the same `scripts` list as before, up to five,
  pinned to the bottom edge.

Because every section measures the font before taking its room, you can
change the `family` line at the top without touching the layout. It holds up for
a wide display face like Unbounded or Syncopate, for Bebas Neue, which
has only capitals (so its x-height line lands on its cap height, and
the labels stack instead of colliding), and for Noto Sans SC, where Han
tops the script list. In the playground, any Google Fonts family works;
one without a bold weight is drawn at its nearest weight, and the name
on the page says which (Bebas Neue comes out "Regular"). In the CLI the
font file needs to be on your disk; the
[`@font` reference](/docs#path-blocks-font-directive) says where it
looks.

## Where to go next

Open the specimen in the playground and set `family` to the font you're
considering. The [Fonts](/docs#fonts-fonts) page covers everything `Font.info` returns,
including the names (designer, license, version) and the full metrics
table, along with every selection rule and error message. If you'd rather
shape the glyphs than list them, [From Fonts to
Paths](/blog/pathblock-glyph-extraction) cuts, offsets and rearranges
them.
