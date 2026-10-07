# Entries dropped during the re-tiering (2026-10-07)

Seven entries removed from the `## Project ideas` sections to keep tiers at
2–4. Text is copied from the files as read at the start of the re-tiering
session, before the edit script ran. The copy was made from that read, not
from git, because the sections were uncommitted; it has not been diffed
against a second source. "Original tier" is where the entry stood before the
re-tiering.

One known deviation from the on-disk text: the first three lines of "Blank
chord-box sheet" in music-education.md had a broken wrap, but that entry was
kept (rewritten), so it is not listed here. All seven entries below were
wrapped normally.

## 03-profiles/sashiko-mending.md

### Original tier: Intermediate

- **Seigaiha table runner** — Seigaiha, the overlapping-wave pattern, is the
  usual choice for runners and placemats: rows of concentric arcs, each row
  offset by half a wave. Tiling, clipped arcs and dashes combine across a long
  narrow piece. Setting stitch length and wave width directly in millimetres
  needs physical units, the one general gap; until then the pitch is worked
  out by hand.
- **Nine-pattern sampler cloth** — A sampler divided into nine squares, each
  holding a different traditional pattern, is how classes and sourcebooks
  introduce the vocabulary. Grid lays out the squares and each cell calls a
  different pattern routine with a shared stitch length. It is the natural
  exercise in organising several pattern programs into one printed sheet.

## 03-profiles/music-education.md

### Original tier: Beginner (on the move list for Advanced, chord/scale diagram kit [D]; dropped instead)

- **Blank fretboard map** — Teachers hand out empty full-neck diagrams for
  students to mark scales and note names on. Strings and frets are a Grid,
  inlay markers are dots at fixed frets, and fret numbers are short text
  labels. String count and fret count are parameters, so the same source
  serves guitar, bass and ukulele, and a left-handed version is a mirrored
  copy.
- **Open-chord classroom poster** — Sets of large single-chord posters for the
  classroom wall are steady sellers. One chord box drawn large, with finger
  dots and open or muted string marks positioned by hand as string and fret
  numbers, plus a chord name in a display font, is a complete product. Colour
  per finger is an enum lookup. No theory helpers are needed for one fixed
  chord.

## 03-profiles/robotics-team-plates.md

### Original tier: Intermediate

- **Electronics belly pan** — The belly pan is the large sheet under the robot
  that carries the controller, power distribution and motor controllers,
  drilled on a regular grid. It is Grid and transform work on a big rectangle,
  well within reach. The one gap is DXF export, the absolute gate in this
  domain, because the team's router software reads nothing else.

## 03-profiles/cnc-plasma-work.md

### Original tier: Beginner (on the move list for Intermediate, DXF export; dropped instead)

- **Monogram sign proof** — Metal monograms, an initial inside a ring with a
  family name across it, are a staple of personalized-sign shops. Text, a
  border and a motif are all ready in Pathogen, so a short program produces
  the customer's proof. Cutting still goes through the Inkscape-to-DXF route
  these shops already use, since direct DXF export is the gap.

### Original tier: Intermediate

- **Cribbage board** — Cribbage boards are a popular router project, valued as
  practice for drilling many holes accurately: three tracks of 121 holes plus
  engraved numbers. Laying out the tracks is loop work that Pathogen does
  easily, with text for the numbers. The gap is DXF export, the format the
  drilling toolpath is built from.
