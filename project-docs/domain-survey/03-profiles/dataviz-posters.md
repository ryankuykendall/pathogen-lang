# Data-Viz Posters & Infographics

**Tier:** data-driven · **Rubric:** Pop 3 · Pain 2 · Fit 3 · GapCost 2 · Adopters 4 = **144** · Longlist E6

## Snapshot
Print-quality data art — annual-report graphics, by-the-numbers posters,
personal-data prints — sits between d3's interactivity and Illustrator's
handwork; a crowded incumbent field where Pathogen's niche is the *printed*
artifact, deliberately scored modest.

## Description
Designers producing infographic posters, "by the numbers" report graphics,
and data-art prints (year-in-review visualizations, marathon/weather
posters). Incumbents are strong: d3/Observable (interactive web), Flourish/
Infogram (templates), matplotlib (science), Illustrator (polish). 2026
trend discourse centers on interactivity, AI-assisted charting, and
"experiential reporting" (reports as microsites) — i.e., the industry is
moving *away* from static, which is precisely the print-artifact space
left open.

## Problems Pathogen could address
The print slice: poster-scale typography + exact physical output + chart
geometry in one source, versionable and regenerable when data updates.
Bespoke chart forms (radial year calendars, stream posters, small-multiple
grids) that template tools can't express and d3-to-print handoffs mangle.
Honest caveat: without data import the domain doesn't start, and with it we
still compete against mature free tools — hence Fit 3, Pain 2.

## Commercial value
Personal-data print sellers (overlaps E1), studio infographic work,
conference/education posters. Real but contested space.

## Missing features
### Domain-specific [D]
- Chart primitives (axes, scales, ticks — deliberately minimal, print-
  oriented)
- Radial/calendar layout kits; small-multiples composition
- Number/date formatting for labels (shared)
### General [G]
- **Data import (absolute gate)**; multi-page/poster-size PDF; testing
  (chart regression)

## User base
Designer/data-journalist population large but incumbent-served · realistic
early adopters: the print-poster and personal-data-art overlap ·
confidence **L, unverified**.

## Community & current conversation (as of 2026-08-30)
- **Where they gather:** Observable/d3 community, r/dataisbeautiful (mass
  scale), data-viz Slack/Discord groups, design-tool blogs.
- **Talking about right now:** 2026 trend lists emphasize AI chart
  assistance, personalization, accessibility, and experiential/interactive
  reporting over static PDFs — static print is explicitly the counter-
  positioning. (infogram.com, theinkorporated.com, visme.co)
- **Obsessed with:** chart-junk debates, accessibility, tool-of-the-week
  churn.
- **Blog content angles:** (1) a year-in-weather radial poster at print
  scale (when import lands); (2) "charts that are artifacts" — the anti-
  dashboard essay.

## Pathogen fit today
Typography, layout, geometry, PDF-at-size: ready. No data path; minimal
chart kit. Recommendation: serve this domain *through* E1/E2 wins rather
than head-on.

## Proposed validation project
(Post data-import) A marathon-splits poster: GPX + splits CSV in, radial
pace ring + typographic stats out at 18×24" print spec.

## Project ideas (as of 2026-10-07)
Tiered by Pathogen skill and readiness. Web-researched; a dated snapshot.

### Beginner — buildable today
- **By-the-numbers typographic poster** — The report-graphic staple: six to
  ten big numerals with short captions, a few proportional bars or circles
  beside them. The figures are typed straight into the source, so no data path
  is needed. Poster-scale typography, exact layout and PDF at size are what
  Pathogen has ready, and next year's edition is the same file with new
  numbers.
- **Dear Data-style postcard** — In the tradition of Lupi and Posavec's
  hand-drawn postcards, record one week of small personal counts and invent a
  visual mark for them. A week is a few dozen values, easily typed inline, and
  each mark is a small parametric shape whose size, angle or color encodes a
  value. Pathogen's geometry suits bespoke encodings that template tools
  cannot express.
- **Unit-dot proportion poster** — A poster that shows a population as
  individual dots, one hundred or one thousand of them, colored by category
  from a few typed percentages. It is a grid of circles, a palette, a
  typographic legend and a title, exported at print size. It makes a clean
  first poster because the only data is a short list of proportions.

### Intermediate — several features, or one gap
- **Personal year-in-review print** — Books read, films watched or concerts
  attended across a year, drawn as a timeline of bespoke marks with a
  typographic summary: a popular gift and shop item. A few dozen records can
  be typed inline and laid out with shipped geometry and text. Beyond that,
  hand entry stops scaling, which is the one general gap, data import.
- **Conference research poster** — Academic and education posters at A0 or
  36×48 inches mix columns of text with a few figures and a strong title band.
  Typography, layout and hand-built figures are shipped, and the source is
  versionable where slide-software posters are not. The one general gap is
  poster-size PDF output, which the profile lists beside multi-page export.
- **Annual-report graphic family** — Studios produce a set of matching stat
  graphics for a report, then redo them every year. One Pathogen file holding
  shared palette, type scale and figure functions regenerates the set when the
  typed numbers change. The combination is shipped; trusting a regenerated set
  without eyeballing every graphic needs chart regression testing, the one
  general gap.

### Advanced — depends on a named gap
- **Weather Radials city poster** — The well-known A1 print draws a year of
  daily temperature ranges for a city as a ring starting at twelve o'clock,
  with circles for precipitation. It depends on data import, the absolute
  gate, and on the radial/calendar layout kit. With both, a buyer's own city
  and year become a regenerable print, which is the artifact space d3-to-print
  handoffs mangle.
- **Small-multiples comparison poster** — Thirty-five cities, fifty states or
  twelve months, each a small identical chart, arranged in a grid so the eye
  compares shapes: a staple of state-level data art. It depends on the
  small-multiples composition gap and on print-oriented chart primitives for
  shared scales and ticks. Consistent scales across every panel at poster size
  is the craft Pathogen could own.
- **Daily-habit calendar print** — A year of runs, steps or sleep drawn as a
  calendar grid of shaded days with month labels and totals, sold as
  personal-data wall art. It depends on data import for the daily log and on
  the number/date formatting gap for labels and month boundaries. A calendar
  that re-lays itself for any year or start day is the regenerable artifact
  sellers want.

Sources: stefanieposavec.com, visualisingdata.com,
  informationisbeautifulawards.com, c82.net, shortlist.com, stack.amcharts.com

## Top YouTube channels (as of 2026-08-31)
- [Curran Kelleher](https://www.youtube.com/results?search_query=curran+kelleher+d3) (search link) — one of the top D3.js instructors; his 17-hour freeCodeCamp D3 course is the standard on-ramp to code-driven dataviz.
- [Storytelling with Data](https://www.youtube.com/results?search_query=storytelling+with+data) (search link) — Cole Nussbaumer Knaflic's chart-design and communication channel; the design-judgment side of the craft.
- [Tableau Tim](https://www.youtube.com/results?search_query=tableau+tim) (search link) — tool-focused dashboard and chart tutorials; representative of the practitioner segment of dataviz YouTube.
