# E-Ink & Ambient Dashboards

**Tier:** data-driven · **Rubric:** Pop 2 · Pain 3 · Fit 4 · GapCost 1 · Adopters 5 = **120** · Longlist E7

## Snapshot
TRMNL's exploding plugin ecosystem (300 → 905+ plugins in about a year),
Kindle-dashboard hacks, and Home Assistant e-ink projects form a fully
code-native niche whose entire product is "render data beautifully on a
low-power screen" — the strongest possible match for Pathogen's rendering,
behind the hardest possible gate (HTTP).

## Description
Self-hosters and tinkerers building glanceable displays: TRMNL ($139
device + open firmware, community marketplace, jailbroken-Kindle client,
Seeed DIY kit with ESP32), Home Assistant e-ink integrations, Raspberry Pi
dashboards. Screens show calendars, weather, transit, server stats —
server-rendered images pushed to dumb displays. Plugin authors write HTML/
image generators today.

## Problems Pathogen could address
Dashboard rendering wants exactly what Pathogen has: crisp 1-bit-friendly
vector output at fixed resolutions (800×480), typography control,
deterministic layout — and what it lacks: fetching the data. A Pathogen
program as a TRMNL plugin (data in via HTTP, dithered PNG out) is a
complete story the moment HTTP + image export at device specs exist.
Layout-kit needs (tile grids, big-number displays, sparklines) are small.

## Commercial value
Near-zero direct revenue; maximal developer-audience credibility. TRMNL's
"hackers welcome" open ecosystem is an unusually low-friction integration
target — one good plugin is distribution among exactly the people who
evangelize tools.

## Missing features
### Domain-specific [D]
- E-ink render profiles (1-bit dithering, device resolutions, safe fonts)
- Dashboard layout kit (tile grid, big-number, sparkline primitives)
- TRMNL plugin packaging (their framework is documented and open)
### General [G]
- **HTTP client (the domain IS this gate)**; data import; CLI/server
  rendering mode (headless compile on a schedule)

## User base
Est. 20–100k across TRMNL owners, Kindle-dashboard builders, and HA e-ink
projects · proxy: 905+ marketplace plugins (Mar 2026), 1,000+ listed apps,
active HA community threads, 336-star Kindle client · confidence **M for
trajectory, L for headcount**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** TRMNL's GitHub/marketplace community, Home
  Assistant forums (multiple active TRMNL threads), Hackaday/Hackster
  project culture, r/eink and self-hosting subreddits.
- **Talking about right now:** TRMNL's ecosystem growth is the story —
  marketplace tripled in a year, Seeed co-branded DIY kit (Sep 2025),
  mainstream tech-blog coverage (Boing Boing, Jul 2026), jailbroken-Kindle
  client adoption; "3 ways to build a Kindle dashboard in 2026" is a
  genre. (trmnl.com, github.com/usetrmnl, community.home-assistant.io,
  boingboing.net)
- **Obsessed with:** battery life, refresh ghosting, information density
  vs glanceability, self-hosting everything.
- **Blog content angles:** (1) a Pathogen-rendered TRMNL plugin (when HTTP
  lands) — shipped to their marketplace, not just blogged; (2) designing
  for 1-bit: dithering and typography on e-ink; (3) the weather tile as a
  20-line program.

## Pathogen fit today
Rendering/typography/layout: excellent. HTTP, headless scheduling, and
1-bit export: absent (GapCost 1). Flag alongside E1 as the second flagship
motivator for the HTTP/data General requirement.

## Proposed validation project
(Post HTTP) A TRMNL weather+calendar plugin rendered by Pathogen, published
to their community marketplace — adoption metrics as the validation signal.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **Static month-calendar screen** — A month grid with large day numerals and
  a title, composed at 800×480 in black and white. It is the layout half of
  the most common dashboard plugin with the dates typed in. Typography and
  deterministic layout are Pathogen's strengths here; the result is a vector
  mock-up to rasterize by other means, since 1-bit export is absent.
- **Family chore and status board** — Reviews of the TRMNL describe it as a
  family status board: who does what, this week's activities, house reminders.
  A fixed board with typed names and tasks is a tile layout of rules and text
  at device resolution. It is buildable today as a design, and shows how crisp
  vector type reads against the HTML screenshots most builders push.

### Intermediate — several features, or one gap
- **Server-stats tile mock-up** — Self-hosters want uptime, disk and container
  counts at a glance. Laying out a tile grid with big numbers, labels and
  small trend lines from hard-coded sample values combines text, layout and
  path geometry that are all shipped. Replacing the samples with real numbers
  from a file meets one general gap, data import, short of the larger HTTP
  gate.
- **Daily generative art frame** — Photo and art slideshows are among the
  popular plugins, and a generative piece suits a slow screen. Deterministic
  hash and noise make a pattern from a typed seed, in pure black strokes that
  need no dithering. Rendering a fresh one each morning without a person
  pressing the button meets one general gap: a headless compile on a schedule.

### Advanced — depends on a named gap
- **One-bit typography test card** — Builders care about legibility and
  ghosting, so a test card is a useful early file: one typeface at a ladder of
  sizes, hairlines at stepped widths, and line-pattern fills standing in for
  grays. Text, strokes and loops draw it. Its known dependency is e-ink render
  profiles, specifically 1-bit output at device resolution; until then the
  card is rasterized and thresholded outside Pathogen, which changes the very
  edges being tested.
- **Transit departures board** — Next buses or trains from the nearest stop is
  a classic glanceable screen for a hallway display. It depends on the HTTP
  client, the gap the profile says the domain is, because departures are only
  useful when fetched minutes ago. With it, a short Pathogen program becomes a
  complete plugin: fetch, lay out big times and route names, emit an image.
- **Home Assistant energy panel** — Home Assistant users push sensor summaries
  to e-ink: solar production, room temperatures, a day's power curve. Most
  screenshot a web dashboard through headless Chromium. Drawing it natively
  depends on the dashboard layout kit, tiles, big numbers and sparklines, plus
  HTTP for sensor values. The opportunity is replacing a
  browser-in-a-container with one small deterministic render.
- **Jailbroken Kindle dashboard** — Turning an old Kindle into a wall display
  is a genre of its own, with guides listing several ways to do it in 2026.
  Each model has its own resolution and grayscale depth, so it depends on
  e-ink render profiles: 1-bit dithering, device resolutions and safe fonts.
  One program targeting TRMNL and three Kindle models by profile is the pitch.

Sources: trmnl.com, terminalbytes.com, hometechhacker.com, the-diy-life.com,
  cnx-software.com

## Top YouTube channels (as of 2026-08-31)
- [Simon Says HA](https://www.youtube.com/results?search_query=simon+says+ha+trmnl) (search link) — Home Assistant content including TRMNL X e-ink dashboard builds — the closest channel to this profile's exact stack.
- [Smart Home Junkie](https://www.youtube.com/results?search_query=smart+home+junkie+home+assistant) (search link) — Home Assistant tutorial channel with companion example code on GitHub; where dashboard builders learn the HA side.
- [Techmoan](https://www.youtube.com/results?search_query=techmoan+trmnl) (search link) — mainstream gadget reviewer who covered the TRMNL e-ink display; signals the device class crossing into general-audience visibility.
