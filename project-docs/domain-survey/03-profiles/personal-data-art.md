# Personal Data Art

**Tier:** data-driven · **Rubric:** Pop 4 · Pain 3 · Fit 4 · GapCost 2 · Adopters 3 = **288** · Longlist E1

## Snapshot
"The night sky when we met," GPS-route prints, soundwave art — a proven
Etsy personalization economy where every product is a *computation over
customer data* rendered beautifully; sellers run exactly this pipeline with
ad-hoc tools.

## Description
Etsy/Shopify sellers producing personalized prints: star maps for a
date+location (computed via astronomy software), running/cycling route maps
from GPS files (Strava-linked), city street-grid posters, soundwave art
from audio clips, coordinates/skyline prints. Variants: paper, wood, LED
lamps, ornaments. The buyer is a gift-giver; the seller operates a
computed-art production line.

## Problems Pathogen could address
Sellers glue together astronomy libraries, map APIs, and Illustrator
templates per order — a fragile manual pipeline for what is one
parameterized program per product line: data in (date/location, GPX file,
audio), styled render out at print spec. Pathogen's determinism +
PDF-at-size is the production half; the entire domain gates on data
import/HTTP for the input half. Style differentiation (the seller's moat)
is exactly expression-first design.

## Commercial value
One of the strongest commercial stories on the longlist: established
high-volume gift market, per-order pricing ($30–100+), sellers actively
seeking production efficiency. A "product line as program" seller tool has
direct value.

## Missing features
### Domain-specific [D]
- Star-position computation or catalog rendering (shares D3's gate)
- GPX/route rendering with simplification + style (needs file import)
- Audio-waveform ingestion (heaviest lift; lowest priority)
- Print-product presets (common frame sizes, wood-print safe areas)
### General [G]
- **Data import + HTTP (the domain IS this gate)**; CLI batch (order
  queues); number formatting (coordinates)

## User base
Buyer market mass-scale (top Etsy personalization category); seller tier
est. tens of thousands · confidence **M, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Etsy seller forums/Facebook groups, print-on-demand
  communities, r/EtsySellers, Strava-art niche (GPS-drawing subculture).
- **Talking about right now:** the category is mature and saturated at the
  template level — differentiation pressure favors sellers who can offer
  styles competitors can't copy from a Canva template; product variants
  (wood, LED) expanding. (etsy.com markets, listing ecosystems)
- **Obsessed with:** order turnaround automation, style uniqueness, review
  velocity.
- **Blog content angles:** (1) a route-map product line as one program
  (when GPX import lands); (2) generative style moats — art competitors
  can't template; (3) the star-map pipeline demystified.

## Pathogen fit today
Rendering, style, print output: ready. Inputs: fully gated. This is the
flagship *motivating use case* for the data-import/HTTP General
requirement — flag it as such in synthesis.

## Proposed validation project
(Post data-import) A GPX route print: file in, simplified styled route +
labels + frame-size preset out — produced as a real print order end-to-end.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Coordinates print** — A minimalist print of a latitude and longitude, set
  large above a place name and a date, sells steadily as a wedding and
  new-home gift. With the coordinates typed in as text there is no data gate
  at all: it is typography, spacing and print output, which the profile rates
  ready. It makes a useful first product template because the buyer's inputs
  are three strings.
- **Birth-stats poster** — New-baby prints set a name, date, time, weight and
  length as a typographic composition, often around a simple shape. Every
  value is typed from the order form, text-to-path gives exact control of the
  lettering, and colourways are a single style change. The same source
  rendered at several frame proportions is what a seller would otherwise
  rebuild by hand per listing.
- **Moon-phase print for a date** — Prints showing the moon as it looked on a
  birthday or wedding night are a widely sold cousin of the star map. If the
  seller looks up the illuminated fraction and types it in, the crescent is a
  circle cut by an ellipse and the rest is caption text. It shows honestly
  where Pathogen is today: rendering ready, the lookup still manual.

### Intermediate — several features, or one gap
- **Hand-keyed race-route print** — Marathon and cycling route prints draw the
  course as a single bold line with start, finish and a finish time beneath. A
  seller can type a few dozen points for a well-known course as an array,
  smooth them into a curve and style the stroke. That uses several shipped
  features and avoids file import, at the cost of data entry no one would
  repeat per customer.
- **Degrees-minutes-seconds coordinates print** — The more elegant coordinates
  prints show degrees, minutes and seconds with hemisphere letters, computed
  from the decimal pair a customer pastes from a map. The arithmetic is simple
  in-language. The one gap is number formatting [G], listed in the profile for
  coordinates: zero-padding and fixed decimals currently take manual string
  assembly, which is fragile across many orders.
- **Order-queue batch of prints** — A shop with thirty open orders runs the
  same template thirty times with different names, dates and sizes. The
  template is a parameterised file that already works for one order. CLI batch
  for order queues [G] is the single gap between a designer's tool and a
  fulfilment pipeline, and it is the feature a seller would notice first.

### Advanced — depends on a named gap
- **Night-sky star map** — "The stars when we met" is the category's flagship
  product: the sky above a place at a moment, as a circular chart with a
  dedication. Vendors render it from the Hipparcos catalogue. Star-position
  computation or catalog rendering [D], shared with the astronomy profile, is
  the dependency, and it is the clearest single demonstration of a computation
  over customer data.
- **Soundwave print** — First-dance songs, a baby's heartbeat or a spoken "I
  love you" are sold as waveform prints, sometimes as a radial ring. The bars
  are trivial to draw once amplitudes exist. Audio-waveform ingestion [D] is
  the gap, which the profile ranks as the heaviest lift and lowest priority,
  so this is a showpiece to plan for rather than build next.
- **Linked-places street-map print** — Prints joining two cities, or showing
  the street grid around a first home, need map geometry fetched for whatever
  location the customer names. That is the domain's defining dependency: data
  import and HTTP [G]. With it, Pathogen's style system could render street
  networks consistently across a shop's whole range; without it, sellers keep
  exporting from separate map tools.

Sources: etsy.com, thenightsky.com, visualcinnamon.substack.com

## Top YouTube channels (as of 2026-08-31)
- [Cassiy Johnson](https://www.youtube.com/results?search_query=cassiy+johnson+print+on+demand) (search link) — behind-the-scenes of a real Etsy print-on-demand business: shop audits, marketing, honest what-works reviews.
- [Money With Mak](https://www.youtube.com/results?search_query=money+with+mak+etsy) (search link) — step-by-step Etsy digital-product/POD guides from product research to listing setup and Etsy SEO.
- [RJ Martinez](https://www.youtube.com/results?search_query=rj+martinez+print+on+demand) (search link) — well-regarded POD educator across Amazon Merch, Etsy, and Redbubble; the seller-economics view of design products.
