# Observable / reactive paths — STATUS (2026-09-16)

## Shipped on `main`
- **M1 path queries** `query()`/`queryAll()` — c558cd0 (2026-09-14); contract `docs/path-queries.md`.
- **M2 subscriptions** `layer.subscribe(selector) {|match, i, sub| …}` — dfac50d (2026-09-15); contract `docs/subscriptions.md`.
- **ISSUE-021** arc length honours sweep flags — b488822.
- Friction fixes from the blog samples: draw-idiom recording 51d5ec3, walker case + subPath moves f2a5595, leading move 0eb03a0, labels through draw() 726ccfc, validator real-geometry + formatter lossy-recovery guard 4d46032, TextLayer transform reaches `<text>` — 3332c6a; validator divider rule + call-provenance docs caveat — e7d78bb.

## Blog series "Drawing Without Bookkeeping" (`website/blog/`, samples `post52`–`post56`)
| Part | Slug | Samples | State |
|---|---|---|---|
| 1 | ask-the-path | post52 | committed 55fa9d8 (reviewed) |
| 2 | thinking-and-drawing-in-parallel | post53 | committed 55fa9d8 (reviewed) |
| 3 | a-linkage-that-dimensions-itself | post54 | reviewed (23 items applied); committed with parts 4–5 |
| 4 | the-panel-prints-its-own-drill-schedule | post55 | reviewed (19 items applied); committed with parts 3 and 5 |
| 5 | the-fretboard-is-a-formula | post56 | reviewed (19 items applied); committed with parts 3–4 |

All 30 samples validate clean (`npm run validate:samples`), BBWPs compiled, blog builds warning-free. Dates run 2026-09-16 … 2026-09-20. Series TOCs in every part link all five.

## Paper trail
- Design: `discussion-01-*.md`, `plan-01-query-language-m1.md`, `discussion-02-push-model-proposal-v1.md`, `plan-02-blog-series.md`, `blog-synopsis-v1.md`, `blog-synopsis-v2-domains.md`, `series-design-decisions.md`.
- Friction: `FRICTION-LOG.md` (entries 1–26; RESOLVED entries name their commit and tests).
- Reviews: `reviews/part1-…` through `reviews/part5-…` dispositions.

## Publishing
All five posts and the language candidates are on `main` and pushed (e06ccca..913e5a6, 2026-09-18); Pages auto-deployed. `npm run build:blog` is warning-free; `validate:samples` is clean for post52–post56; the `public/` output was rebuilt with `PATHOGEN_API_BASE=http://localhost:8787` so Ryan's running `dev:stack` serves the series. Verified against production after the push (2026-09-18): the deploy served part 5 within two minutes, all five posts render six mini-workspaces each, and `npm run check-links -- --base https://pathogen.studio` reported 54 pages, 1479 links, 0 broken.

## Language candidates — LANDED 2026-09-18
Written up with friction, pseudo code and cost in `language-candidates-v1.md`, which now ends with a status table (commits per item). Landed: (1) `Endpoint.outward`/`arriving`/`leaving` and `Command.startHeading`/`endHeading`; (2) `circleCircle()` and exact intersections; (3) `toFixed(x, n)`; (4) per-subpath markers (`marker-scope: subpath`); (5) per-text styles — exists, now documented — and tab stops on a text layer; (6) `:nth` with a list value / interpolated selectors; (7) a parser hint or grammar fix for `A.x` in path position; (8) smaller items and tooling (formatter `z` padding, the `c.x` residual, validator containment).
