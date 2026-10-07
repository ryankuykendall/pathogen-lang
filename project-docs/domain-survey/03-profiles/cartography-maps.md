# Cartography & Trail Maps

**Tier:** data-driven (real-world) / physical-output (fantasy) · **Rubric:** Pop 3 · Pain 3 · Fit 3 · GapCost 1 · Adopters 4 = **108** · Longlist D6

## Snapshot
Research reveals this is two domains: real-world maps (trail/orienteering —
gated hard on GIS import) and **fantasy maps** — a large, tool-buying RPG
worldbuilding market that needs *no* external data and deserves a re-score.

## Description
Real-world side: hiking/orienteering/event maps from GIS data (OSM,
elevation) — blocked on data import, deferred. Fantasy side: D&D dungeon
masters and worldbuilders using Inkarnate, Wonderdraft, Dungeondraft,
Azgaar's generator, ProFantasy CC3+ (CC4 Kickstarter pending) — a mature
paid-tool market with active asset-creator communities, hand-drawn
aesthetics, and high-res print export as a selling point.

## Problems Pathogen could address
Fantasy cartography is procedural geography without ground truth:
coastlines (noise-driven), mountain-range hatching, river networks obeying
terrain logic, settlement icons, region labels on curved paths, hex/square
grid overlays for game use. Azgaar's (free, procedural) proves the
generative appetite; the paid tools are asset-stampers with limited
parametric power. Style consistency across a campaign's maps — one style
definition, many maps — is exactly the identity-propagation story.

## Commercial value
Proven: multiple sustained paid tools, asset marketplaces, Patreon map
creators, publisher commissions. Fantasy-map creators sell on
DriveThruRPG/Patreon at scale.

## Missing features
### Domain-specific [D]
- Terrain-feature generators (coastline noise, ridge hatching, river
  networks with flow logic)
- Map-icon libraries + label-on-path conventions with halos
- Hex/square game-grid overlays with numbering
- Hand-drawn stroke aesthetics (roughen/jitter filters on paths)
### General [G]
- Fantasy: modules + parameter sliders; almost no data gate. Real-world:
  **GIS import (GeoJSON/OSM)** — the entire gate; defer.

## User base
D&D is tens of millions of players; active map-*makers* est. 500k+
(Inkarnate alone claims millions of users) · confidence **M, unverified**.
Adopters: worldbuilders skew tool-curious.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** r/mapmaking, r/wonderdraft, r/inkarnate,
  Cartographers' Guild forums, ProFantasy community, worldbuilding Discords.
- **Talking about right now:** AI map generation entering the discourse
  (terrain-aware generators as "creative collaborators"); ProFantasy CC4
  Kickstarter anticipation; tool-abundance comparisons a constant genre.
  (summonworlds.com, rpgpub.com 2026 roundup, profantasy.com)
- **Obsessed with:** hand-drawn aesthetic authenticity, river/mountain
  realism rules ("rivers don't split!"), asset-pack collecting.
- **Blog content angles:** (1) a procedural island chain with honest river
  logic; (2) one campaign style, five maps — identity propagation; (3)
  hex-crawl map with numbered overlay.

## Pathogen fit today
Noise, layers, labels, text-on-path, deterministic seeds — the fantasy core
is strong now; hand-drawn stroke styling is the main [D] gap.
**Recommendation for synthesis: split D6 → "fantasy maps" (re-score ~Pop 3
Pain 3 Fit 4 Gap 3 Adopt 4 = 432, top-tier) and "real-world cartography"
(deferred on GIS import).**

## Proposed validation project
A hex-crawl campaign map: seeded coastline + ridge hatching + river network
+ numbered hex overlay in one style definition, regenerated at player and
DM variants — shared to r/mapmaking for reception.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Seeded island map** — The first map most worldbuilders draw is a lone
  island with a wobbly coast and a name. A closed outline displaced by
  deterministic noise gives the coastline, a few inward offsets give the
  classic shoreline ripple rings, and text-on-path curves the sea's name
  around the bay. A different seed is a different island, which makes the idea
  of generated maps tangible.
- **Compass rose** — Mapmaking books devote whole tutorials to the compass
  rose, and every map wants one. It is pure radial geometry: long and short
  points alternating around a centre, each split into a light and a dark half,
  with cardinal letters as text. Point counts and lengths are parameters, so a
  simple four-point rose and an ornate thirty-two-point one share a source.
- **Border and scale-bar frame** — A map reads as finished once it has a ruled
  neatline, an alternating black-and-white border band, a scale bar and a
  title cartouche. All of these are repeated rectangles, offsets of the page
  edge and a few text labels. Built once with the page size as a parameter,
  the frame goes around every later map on its own layer.

### Intermediate — several features, or one gap
- **Dungeon floor plan** — Old-school dungeon maps are rooms and corridors on
  a square grid with thick walls and hatched solid rock. Rooms unioned with
  boolean operations give the floor, an outward offset gives the walls, a Grid
  supplies the squares, and layers hold secret doors and room keys for a
  referee's copy. It uses several shipped features and needs no terrain
  generators at all.
- **Labelled regional map** — A campaign's regional map carries rivers, roads,
  borders and place names, with river and mountain-range names curving along
  the features. Noise shapes the coast and the river courses, text-on-path
  sets the curved names, and layers keep political borders separate from
  terrain. Drawing rivers by hand rather than from flow logic keeps this
  inside what is shipped today.
- **Tunable island generator** — Worldbuilders like to drag controls until a
  landmass looks right: roughness, number of bays, island count. The program
  is the seeded island with more parameters exposed. The one gap is parameter
  sliders in the playground [G], which the profile lists for the fantasy side;
  until then the values are edited as numbers in the source, which works but
  loses the playful loop.

### Advanced — depends on a named gap
- **Hand-inked parchment map** — The look the community prizes is
  Tolkien-style inked linework, where coasts and mountain strokes wobble
  slightly as if drawn with a dip pen. Pathogen's lines are mechanically
  clean. Hand-drawn stroke aesthetics [D], roughen and jitter filters on
  paths, is what the profile calls the main gap, and it largely decides
  whether r/mapmaking sees output as a map or as a diagram.
- **Illustrated town map** — Town maps crowd hundreds of small house, tree and
  tower symbols along streets, with labels that stay legible over the detail.
  Placing the symbols is easy with Grid and hash; drawing them and haloing the
  labels is not provided. Map-icon libraries and label-on-path conventions
  with halos [D] is the gap, and a shared icon set is what makes a
  recognisable house style.
- **Real trail map from OpenStreetMap** — Hiking clubs and race organisers
  want a printable map of their own route with contours, paths and waypoints
  from open data. The styling, labelling and print output suit Pathogen well;
  the data cannot get in. GIS import of GeoJSON or OSM [G] is, in the
  profile's words, the entire gate, which is why the real-world half is
  deferred.

Sources: forbiddenplanet.com, tabletopbookshelf.com, divisionplus.itch.io

## Top YouTube channels (as of 2026-08-31)
- [WASD20](https://www.youtube.com/results?search_query=wasd20+fantasy+maps) (search link) — Nate's hand-drawn fantasy-map tutorial series (search results cite 278k subscribers); the standard entry point for D&D map making.
- [Deven Rue](https://www.youtube.com/results?search_query=deven+rue+cartography) (search link) — professional fantasy cartographer (Middle-earth, Skyrim, campaign-world commissions) showing her drawing process.
- [Dyson Logos](https://www.youtube.com/results?search_query=dyson+logos+maps) (search link) — the signature cross-hatched dungeon-map style much of the hobby imitates; smaller YouTube presence alongside his prolific map blog.
