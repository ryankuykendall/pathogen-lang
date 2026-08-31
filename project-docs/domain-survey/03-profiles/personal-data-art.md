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

## Top YouTube channels (as of 2026-08-31)
- [Cassiy Johnson](https://www.youtube.com/results?search_query=cassiy+johnson+print+on+demand) (search link) — behind-the-scenes of a real Etsy print-on-demand business: shop audits, marketing, honest what-works reviews.
- [Money With Mak](https://www.youtube.com/results?search_query=money+with+mak+etsy) (search link) — step-by-step Etsy digital-product/POD guides from product research to listing setup and Etsy SEO.
- [RJ Martinez](https://www.youtube.com/results?search_query=rj+martinez+print+on+demand) (search link) — well-regarded POD educator across Amazon Merch, Etsy, and Redbubble; the seller-economics view of design products.
