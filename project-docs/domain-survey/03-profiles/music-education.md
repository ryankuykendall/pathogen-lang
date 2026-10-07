# Music Education Diagrams

**Tier:** physical-output · **Rubric:** Pop 3 · Pain 3 · Fit 4 · GapCost 3 · Adopters 3 = **324** · Longlist D2

## Snapshot
Fretboard diagrams, chord grids, and staff worksheets are parametric
templates sold continuously on Teachers Pay Teachers — every diagram is a
few parameters (tuning, key, position) away from every other.

## Description
Music teachers (private studios, schools) and worksheet sellers producing:
chord diagrams (fret grids with finger dots), scale/fretboard maps in twelve
keys, blank TAB and staff paper, rhythm worksheets, circle-of-fifths charts,
piano keyboard diagrams. Markets: TPT (editable worksheet packs, 80+ page
workbooks), teacher-resource sites (Teach Wombat model), free-sheet blogs.
Tools: Illustrator, Word tables (really), niche chord-diagram web apps.

## Problems Pathogen could address
The twelve-keys problem: every diagram type must be produced in all keys/
positions/tunings — pure parameter sweeps done by hand today. A chord-grid
generator (tuning + fingering in, diagram out), fretboard maps with
interval colouring, and transposable worksheet sets collapse hours into
loops. Music theory is arithmetic on pitch classes — a natural enum/data fit.

## Commercial value
TPT is a proven marketplace (editable packs sell at $5–30); studio-brand
worksheet businesses; method-book authors. Sellers and teacher-creators are
the wedge; feeds the STEM-education adoption thesis (D4).

## Missing features
### Domain-specific [D]
- Pitch-class/interval arithmetic helpers (transposition as a function)
- Chord/scale diagram kit (fret grids, finger dots, barre notation, string
  labels)
- Staff/TAB paper generators; keyboard diagram kit
- Circle-of-fifths and interval-wheel constructors
### General [G]
- Modules (a "music kit" is the deliverable); multi-page PDF; data import
  (chord databases)

## User base
US music teachers ~100k+ school + large private-studio population; TPT
seller tier in the thousands · confidence **M, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** TPT marketplace + seller forums, music-teacher
  Facebook groups, r/musictheory and r/WeAreTheMusicMakers edges,
  studio-teacher blogs.
- **Talking about right now:** editable/digital dual-format worksheet packs
  are the norm; guitar-centric resources dominate (chord families, fretboard
  fluency); print + digital classroom hybrid delivery. (tpt listings,
  teachwombat.com, musictechteacher.com)
- **Obsessed with:** student engagement, pedagogical sequencing, September
  back-to-school sales cycles.
- **Blog content angles:** (1) all twelve keys from one definition — the
  transposition loop; (2) a chord-diagram kit as a module; (3) custom-tuning
  fretboard maps (the long-tail nobody serves).

## Pathogen fit today
Grids, text, enums, color — the geometry is easy now; the music-theory
helpers and diagram kit are clean [D] modules. Strong quick-win profile.

## Proposed validation project
A chord-family worksheet: tuning + chord set in, twelve-key diagram pages
with fingering dots out as a TPT-ready PDF pack — reviewed by a guitar
teacher.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Steady-beat chart** — Elementary music teachers project or print beat
  charts: rows of four identical icons, hearts or a seasonal shape, that
  children tap along to while a song plays. One icon is a short closed path
  and Grid repeats it, with rows and beats per row as parameters and colour
  marking the strong beat. Seasonal sets swap the icon. It needs no notation
  or theory helpers and is complete at any size.
- **Weekly practice log** — Private teachers send students home with a
  practice chart: seven day columns, rows for pieces or scales, a minutes box
  and a space for the week's goal. It is ruled lines and short text labels
  laid out with Grid, and the studio name and colours are parameters. The page
  is used at ordinary letter or A4 print size, so nothing depends on exact
  dimensions or on music helpers.

### Intermediate — several features, or one gap
- **Circle-of-fifths poster** — Every theory classroom has one: twelve key
  names around a ring with relative minors inside and key-signature counts
  outside. Built today it uses rotation, text placed at computed angles,
  colour by position and layered rings, with the key names typed in as an
  array. That is several shipped features working together, and the hand-typed
  array is exactly what a later theory helper would replace.
- **Multi-instrument cheat sheet** — Popular bundles put the essential chords
  for guitar, ukulele, mandolin and banjo on a single reference page each.
  Writing one chord-box function that takes string count, fret span and a list
  of dot positions, then calling it per instrument, is a good exercise in
  parameterised functions and enums. Everything it needs is shipped; the chord
  shapes are still entered by hand.
- **Blank TAB and manuscript bundle** — Sellers package blank tablature, staff
  paper and chord-box pages as an eleven-page printable. Each page is simple
  ruled lines with a clef or a TAB label. The one gap is multi-page PDF [G]:
  today each page is a separate export stitched together afterwards, which is
  workable for one bundle but awkward when every page has letter and A4
  versions.

### Advanced — depends on a named gap
- **Blank chord-box sheet** — A common guitar printable is a page of empty
  chord boxes, offered in 16, 25, 36 and 49-per-page versions. One box is a
  fret grid with a thick nut line, and the page repeats it by rows and
  columns, with four-string ukulele variants. The known dependency is the
  chord/scale diagram kit [D], which owns the fret grid; until it ships each
  seller hand-builds a box that the later filled-in worksheets cannot share.
- **Scale maps in twelve keys** — The classic teaching pack shows a pentatonic
  or major-scale pattern across the neck in every key, with roots highlighted.
  Typing dot positions for twelve keys and several tunings by hand is where
  errors creep in. Pitch-class and interval arithmetic helpers [D],
  transposition as a function, is the gap; with it a tuning and a scale
  formula generate every page correctly.
- **Alternate-tuning chord book** — Players in DADGAD or open G want a full
  chord dictionary for their tuning, and few printed ones exist. Open chord
  databases already hold the fingerings. Data import of chord databases [G] is
  the dependency: read the table, filter by tuning, and lay out several
  hundred diagrams automatically, which is more than any worksheet seller
  would attempt to draw and check by hand.
- **Transposing wheel** — A two-disc cardboard wheel, turned to line up a new
  key against the old, is a favourite make-and-take for band and choir classes
  with transposing instruments. Both discs are rings of note names offset by
  an interval. Circle-of-fifths and interval-wheel constructors [D] is the
  named gap, and a constructor would guarantee the two discs agree with each
  other.

Sources: tes.com, gumroad.com, payhip.com, ko-fi.com, walmart.com,
  singplaycreate.com, blessedhomeschool.com

## Top YouTube channels (as of 2026-08-31)
- [JustinGuitar](https://www.youtube.com/results?search_query=justinguitar) (search link) — Justin Sandercoe's 1,800+ lesson structured free course; consistently cited as the best beginner-to-advanced pathway on YouTube.
- [Marty Schwartz](https://www.youtube.com/results?search_query=marty+music+guitar) (search link) — one of the longest-running guitar teachers on YouTube; song and technique lessons with an energetic style.
- [Signals Music Studio](https://www.youtube.com/results?search_query=signals+music+studio) (search link) — Jake Lizzio's theory channel that applies scales, chords, modes and harmony directly to the fretboard — the closest match to our diagram-heavy use case.
