# Astronomy Charts & Sundials

**Tier:** physical-output · **Rubric:** Pop 2 · Pain 4 · Fit 4 · GapCost 2 · Adopters 4 = **256** · Longlist D3

## Snapshot
Planispheres are latitude-parameterized rotating charts (DIY star wheels are
an established education genre) and sundials are latitude-driven projection
geometry — both gloriously parametric, both gated on ephemeris/catalog data.

## Description
Amateur astronomers, science educators, and makers producing: planispheres
(two-part rotating star wheels, sold per latitude band), printed star
charts, analemmatic and horizontal sundials (garden installations, laser-cut
kits), moon-phase and analemma diagrams. DIY culture is established
(Lawrence Hall of Science downloadable star wheels; cardstock assembly).
Tools: astronomy software (Stellarium) for charts, spreadsheets + hand
drafting for sundials.

## Problems Pathogen could address
Latitude is *the* parameter: planisphere horizon masks, sundial hour-line
angles (closed-form trigonometry), and analemmatic layouts all re-derive
from it — makers currently redo the math per location. Star charts from a
catalog (magnitude-scaled dots, constellation lines) are data-driven
rendering. A "your-latitude kit" generator (star wheel + garden sundial,
personalized) is a compelling maker product; overlaps personal data art
(E1) on the commercial side.

## Commercial value
Etsy sundial kits and custom-latitude products; education kit publishers;
planetarium shops. Niche with a personalization premium.

## Missing features
### Domain-specific [D]
- Sundial solvers (horizontal/vertical/analemmatic hour-line math, EoT
  correction table)
- Planisphere projection kit (stereographic charts + horizon mask per
  latitude, rotation calibration)
- Star-catalog rendering (magnitude ladder, constellation stick figures)
### General [G]
- **Data import (star catalogs — the gate)**; physical units; number
  formatting (degree/minute output)

## User base
Amateur astronomy is large (Sky & Telescope-class circulation, huge
r/Astronomy) but the maker/chart subset est. 50–200k · confidence **L,
unverified**. Adopters high — overlaps STEM/maker crowd.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/Astronomy and r/telescopes, cloudynights forums,
  astronomy clubs/outreach programs, science-museum maker programs, NASS
  (sundial society).
- **Talking about right now:** signal this pass was thin — established DIY
  star-wheel resources and commercial planispheres (David Chandler's Night
  Sky) dominate; no live controversy surfaced. Re-verify at Stage 5 if
  pursued. (afh.sonoma.edu, davidchandler.com)
- **Obsessed with:** light pollution, outreach events, instrument-making
  craft pride.
- **Blog content angles:** (1) a sundial for *your* garden — latitude in,
  laser-cut kit out; (2) the analemma explained by drawing it; (3) star
  wheel from a catalog (when import lands).

## Pathogen fit today
The trig is trivial in-language; rotation/projection geometry and exact-
scale PDF work now. Sundials are buildable *today* (closed-form); charts
wait on catalog import (GapCost 2 overall).

## Proposed validation project
An analemmatic garden sundial kit: latitude in, hour markers + date-scale
gnomon positions out with EoT table, as print + laser files — verified
against NASS calculator output.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Equatorial card sundial** — The simplest accurate dial, and the usual
  first classroom build: a disc with hour lines every 15°, pierced by a straw
  or knitting needle tilted to the local latitude. The face is a loop over
  twenty-four angles with numerals as text. It introduces rotation and
  labelling, and the same file prints the reverse face needed for the winter
  half of the year.
- **Moon-phase wheel** — A common primary-school make is a two-layer wheel: a
  disc showing the eight named phases around its rim under a cover with a
  viewing window. Each phase is a circle cut by an ellipse, which boolean
  operations draw as clean shapes, and rotation places them. No ephemeris data
  is involved because the phases are illustrative, not dated.

### Intermediate — several features, or one gap
- **Cut-and-fold paper sundial** — Sky & Telescope style kits print the dial,
  the gnomon and its glue tabs on one sheet, to be cut, folded and mounted on
  card. That means cut lines, fold lines and printed markings on separate
  layers, a gnomon triangle whose angle equals the latitude, and labels that
  survive folding. It combines several shipped features and rewards
  exact-scale PDF output.
- **Equation-of-time correction card** — Sundials differ from clock time by up
  to sixteen minutes through the year, so serious dials carry a small
  correction graph or table. The curve comes from a standard approximation
  formula computed in-language. The single gap is number formatting [G]: axis
  and table values need tidy minute and degree output, which today takes
  manual rounding and string assembly.
- **Laser-engraved hardwood dial** — Makers move from paper to an engraved
  plywood or hardwood dial plate with a slotted gnomon. Hour lines and
  numerals go on an engrave layer and the outline and slot on a cut layer. The
  one gap is physical units [G]: the gnomon slot must match the stock
  thickness and the plate must fit the bed, and both are still set by hand.

### Advanced — depends on a named gap
- **Horizontal garden-dial face** — The familiar garden sundial has unevenly
  spaced hour lines whose angles depend on latitude. One latitude parameter
  should yield a face that is right for the maker's own town, printed and
  glued to card under a triangular gnomon. Sundial solvers [D] are the known
  dependency: until a tested horizontal solver ships, the maker types the
  hour-angle formula in and checks the result against a published calculator.
- **Latitude-specific planisphere** — The star wheel is the established DIY
  astronomy project: a rotating star disc under a horizon mask cut for one
  latitude band. The mask geometry is computable now, but the disc needs
  several hundred stars. Data import of star catalogs [G], which the profile
  calls the gate, is the dependency; once it lands, one latitude parameter
  yields a wheel for any classroom.
- **Constellation flash cards** — Astronomy clubs and teachers print card sets
  showing each constellation's stick figure with stars sized by brightness.
  This is star-catalog rendering [D] in its plainest form: a magnitude ladder
  mapped to dot radius and line lists joining named stars. Pathogen's layout
  and text handle the cards themselves; the catalog rendering kit is the
  missing piece that would supply the content.
- **Dial with solstice and equinox lines** — Showpiece sundials add
  declination curves that the shadow tip follows on the solstices and
  equinoxes, and often decline from due south on a wall. Each variant has its
  own solution, and getting them wrong is easy. Sundial solvers [D] for
  horizontal and vertical dials is the gap; a tested solver would let makers
  attempt designs they would otherwise copy from tables.

Sources: skyandtelescope.org, skyatnightmagazine.com, sundials.co.uk,
  blocklayer.com, in-the-sky.org, afh.sonoma.edu

## Top YouTube channels (as of 2026-08-31)
- [AstroBackyard](https://www.youtube.com/results?search_query=astrobackyard) (search link) — Trevor Jones' deep-sky imaging tutorials; the mainstream center of backyard astrophotography YouTube.
- [Astrobiscuit](https://www.youtube.com/results?search_query=astrobiscuit) (search link) — budget/DIY ethos (rebuilt a 14-inch Dobsonian, strapping cheap cameras to makeshift rigs); "space is for everyone" instrument-building spirit closest to our DIY-instrument angle.
- [Cuiv, the Lazy Geek](https://www.youtube.com/results?search_query=cuiv+lazy+geek) (search link) — Tokyo-based urban astrophotography under heavy light pollution; deep gear, filter, and software walkthroughs.
