# Showcase Pages — Design Explorations

**Date:** 2026-05-15
**Companion to:** `2026-05-15-roundtable-synthesis.md`

This document proposes five named design explorations that elevate `/u/:handle/:slug`, `/explore`, and `/featured` from directory listings into proper showcases. Each exploration is concrete enough to inform implementation; explorations are explicitly designed to compose. A recommended sequencing is at the bottom.

The persona-level critique is in the synthesis on disk — this document refers to it rather than restating it.

---

## Exploration 1 — "Plate" (detail page hero, retire the embed)

A detail page redesign that treats every approved workspace as a curated *plate* in a gallery: the artwork is presented at scale on a generous mat, with all editorial scaffolding (byline, metadata, source, CTAs) arranged around it as supporting type. The interactive editor is no longer the page's centerpiece — it's a clearly-marked outbound link.

### Layout (full width, desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│                     [Home › @ryan-kuykendall]                    │  ← thin breadcrumb, 13px DM Sans, muted
│                                                                  │
│                                                                  │
│        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │
│        ▓                                          ▓              │
│        ▓                                          ▓              │
│        ▓        (rendered SVG on white mat,       ▓              │
│        ▓         max-width ~880px, padded by      ▓              │
│        ▓         the page bg color)               ▓              │
│        ▓                                          ▓              │
│        ▓                                          ▓              │
│        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │
│                                                                  │
│                                                                  │
│        More Awesome Pattern                                      │  ← H1, DM Serif Display, ~3rem, normal weight
│        by @ryan-kuykendall · Published May 14, 2026              │  ← byline, DM Sans, .9rem, accent-lavender
│                                                                  │
│        Where we are now hahaha — exploring conic gradients       │  ← description, DM Sans, 1.1rem, normal
│        on layered paths with a deliberate offset.                │
│                                                                  │
│        [ ConicGradient ] [ PathBlocks ] [ for-loops ]            │  ← auto-derived feature chips
│                                                                  │
│   ────────────────────────────────────────────────────────────   │
│                                                                  │
│        ▸ View source (127 lines)                                 │  ← collapsed by default
│                                                                  │
│        [ Open in playground ↗ ]  [ Fork ]  [ Copy source ]       │  ← CTA row, primary then secondary
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Treatment notes

- **Hero**: the rendered SVG (or 1024 thumbnail when SVG unavailable) at fill width with a soft white mat. No glass bar, no header chevron, no editor chrome. The artwork *is* the page.
- **Typography pivot**: H1 in DM Serif Display, not in the body face. This is the brand's editorial gesture (matching the wordmark's serif energy) showing up where it belongs.
- **Byline**: small, with the lavender accent on the handle (echoes the wordmark's lavender "Studio").
- **Feature chips**: derived statically from the source via `api-surface.ts` analysis, surfaced as small pill buttons that link to `/explore?tag=ConicGradient` (the filter UI from Exploration 4 is the consumer).
- **Source disclosure**: collapsed `<details>` element with a syntax-highlighted `<pre>` inside (TextMate-on-build, not CodeMirror — matches the blog's static treatment). The author wrote this code; reading it is the *teaching* value. Defaulting to collapsed keeps the page calm; the line count in the disclosure label tells the reader the cost of opening it.
- **CTA row**: `Open in playground ↗` (primary), `Fork` (creates a new copy in the visitor's account; signed-out routes through sign-in), `Copy source` (clipboard write, no auth needed — the lowest-friction CTA).

### What it consumes

- `approval.svg` (preferred) → `approval.manualThumbnailAt || autoThumbnailAt` (fallback, with size `1024`) → branded placeholder (last resort).
- `approval.code` (for `<pre>` rendering, syntax highlighted at build time).
- `approval.name`, `approval.description`, `approval.ownerHandle`, `approval.approvedAt`.
- New: auto-derived feature tags (see Exploration 4 for the pipeline).

### What it adds / retires

- **Adds**: server-side syntax highlighting for the `<pre>` (reuse the blog pipeline).
- **Adds**: feature-tag computation step in the moderation approval handler (cached on the approval record so detail page doesn't recompute on every render).
- **Adds**: `Fork` endpoint server-side (`POST /workspace/fork/:approvalId` → creates a new workspace with frozen code under the visitor's account; redirects into the editor).
- **Retires**: the `<mini-workspace>` embed on this surface. (It stays on the blog where it belongs.)
- **Retires**: the "preview unavailable" chip from the recent fix — replaced by the layered fallback chain.

### Problems it solves

- The broken-first-impression problem on legacy approvals (the embedded `<mini-workspace>` rendering empty).
- The "this destination URL is a dead end" funnel problem.
- The "DM Serif Display is loaded but unused" typography critique.
- The instructional-content gap — source is now first-class and reachable in one click.

### Cost

- Engineering: medium. New SSR template, syntax-highlight step on the approval record (one-time at approval; idempotent backfill for existing approvals), Fork endpoint.
- Content: low — no new editorial copy required.

### Hardest call

- **Hero size on mobile**. Desktop hero is generous (max-width 880px, full-bleed mat). On mobile the SVG fills viewport width, but the page becomes a long scroll with the byline below the fold. Decision: accept the long scroll on mobile; the artwork-first hero is the point. Don't shrink the hero to keep the byline above the fold.

---

## Exploration 2 — "Editor's Shelf" (featured page redesign)

A `/featured` redesign that treats the page as a curator's space, not a smaller `/explore`. Single hero pick on top with a curator note, secondary picks in a 2-up, past picks below as a tighter grid. The page reads like a magazine column — the curation we just shipped becomes visible.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│         Featured                                                 │  ← H1, DM Serif Display 3rem,
│         this week                                                │     lavender-gradient on "Featured"
│                                                                  │     (echoes the wordmark treatment)
│         Curated by Pathogen Studio                               │  ← .85rem caption, muted
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│        ╔════════════════════════════════════════╗                │
│        ║                                        ║                │
│        ║                                        ║                │
│        ║         (hero featured render,         ║                │
│        ║          full mat, 16:10ish)           ║                │
│        ║                                        ║                │
│        ║                                        ║                │
│        ╚════════════════════════════════════════╝                │
│                                                                  │
│        Pathogen of the Week                                      │  ← small caps, accent-lavender
│        More Awesome Pattern                                      │  ← DM Serif Display H2
│        by @ryan-kuykendall                                       │  ← byline, accent on handle
│                                                                  │
│        ❝ Ryan's pattern is the cleanest demonstration we've     │  ← curator note in a generous serif
│          seen of `.boundingBox()` composing with `.drawTo()`     │     pull-quote, italic
│          — the kind of layout move we want everyone to ❞        │
│          discover.                                               │
│                                                                  │
│                                                              [→] │  ← link to detail
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│        Also picked                                               │  ← H2, DM Serif Display 1.75rem
│                                                                  │
│        ┌──────────────────────┐    ┌──────────────────────┐      │
│        │                      │    │                      │      │
│        │     (rendered)       │    │     (rendered)       │      │
│        │                      │    │                      │      │
│        │  Name                │    │  Name                │      │
│        │  by @handle          │    │  by @handle          │      │
│        │  ❝ short note ❞      │    │  ❝ short note ❞      │      │
│        └──────────────────────┘    └──────────────────────┘      │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│        Past picks                                                │  ← H2
│                                                                  │
│        ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│        │      │ │      │ │      │ │      │ │      │ │      │    │  ← tighter grid, less generous
│        └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │     no curator notes shown
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Treatment notes

- **H1 treatment**: `Featured` rendered with the same lavender-gradient text effect used on "Studio" in the wordmark; `this week` in plain DM Serif Display. Reuses the brand's existing editorial gesture.
- **Hero**: SVG rendering at full mat, with `Pathogen of the Week` small-cap label above the H2 (acts like a magazine column kicker). The curator note is a real pull-quote — generous quotation marks, serif italic, longer than the page can show on `/explore`.
- **"Also picked"**: 2-up grid for the next 2–4 featured items, each with its own one-line curator note (much shorter — a tagline, not a paragraph).
- **"Past picks"**: a denser 6+ column grid for items previously featured but no longer in the active rotation. No notes. Smaller cards. Lets the page accumulate without becoming a flat wall.

### What it consumes

- `featured:workspaces` ordered by `featuredAt` descending — top entry = hero, next 2–4 = "Also picked", remainder = "Past picks".
- New per-approval fields: `curatorNote: string` (longer, for hero) and `curatorTagline: string` (one-liner for "Also picked"). Either can be empty.
- Existing `approval.svg` / thumbnail.

### What it adds / retires

- **Adds**: `curatorNote` and `curatorTagline` fields on the approval record. Admin moderation modal gains two text inputs when approving with "Feature".
- **Adds**: a "rotate to past picks" admin action (moves an item from the active featured set to the archive without unfeaturing). Practically: a `featured:active` and `featured:past` index split, or a `featuredRotatedAt` field on the approval.
- **Retires**: the existing flat featured grid.

### Problems it solves

- The synthesis's single biggest miss: "curation is invisible." This is the page where the team teaches; this layout puts the teaching front and center.
- The editorial-typography critique — DM Serif Display gets a flagship presentation with the lavender treatment.
- The "featured looks like a smaller explore" critique — the layouts are now structurally different.

### Cost

- Engineering: medium. New SSR template, admin moderation UI gains two new fields, "rotate" action requires a tiny index change.
- Content: medium-high. Someone has to write curator notes. This is the *point* — featured isn't featured without commentary.

### Hardest call

- **Publishing cadence.** "this week" implies a weekly cycle; if we feature on a rolling cadence, the kicker is dishonest. Either commit to a weekly editorial drop (real cost, real value) or use a date-agnostic label like `Editor's pick`. Lean: commit to weekly. The weekly cadence creates a reason to visit.

---

## Exploration 3 — "Creator-credited Cards" (explore + featured cards)

A cross-page card redesign that puts the creator front and center on every gallery card. Solves the synthesis's anonymized-makers critique while staying composable with the other explorations.

### Card anatomy

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│                                     │
│       (thumbnail or render)         │  ← 16:10 area
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  ⬢ Featured                         │  ← optional badge slot, top-right of metadata block
│                                     │
│  More Awesome Pattern               │  ← title, DM Serif Display 1.25rem
│  Where we are now hahaha …          │  ← description, 2 lines max, body face
│                                     │
│  (◯) @ryan-kuykendall · 2d          │  ← creator chip — avatar/initial + handle + relative date
│                                     │
└─────────────────────────────────────┘
```

### Treatment notes

- **Creator chip**: rendered as the card's footer row. The avatar slot uses the first letter of the handle on a colored chip (deterministic hash of handle → hue) until a real avatar service exists. The handle is the only clickable element inside the chip; clicking it routes to `/u/:handle` and stops propagation (the rest of the card routes to the work).
- **Badges**: a single badge slot above the title. Possible badges: `Featured`, `New`, `Editor's pick`. Cards on `/explore` only show `Featured` when the workspace is also in `featured:workspaces`. Cards on `/featured` don't show the badge (the page itself is the badge).
- **Relative date**: `2d`, `3w`, `Apr 14` — fades into absolute date after ~30 days. Driven by `approvedAt` (renamed to "Published" copy per the synthesis must-fix).
- **Empty thumbnail fallback**: instead of the peach `--bg-tertiary` bleed, use a deterministic palette-derived swatch (hash the workspace ID → pick two oklch colors → a soft conic gradient). The page never looks broken; absent thumbnails look intentional.
- **Card hover**: gentle lift, slight border-color shift to `--accent-lavender`. Subtle. The grid is busy by nature; hover affordance shouldn't compound it.

### What it consumes

- `PublicIndexEntry` (already has `ownerHandle` post-Phase 4).
- One extra string per card: `approvedAt` formatted as relative.
- For the featured-overlap badge: a `Set<string>` of featured IDs computed once at the top of `renderExplorePage` and looked up per card.

### What it adds / retires

- **Adds**: avatar/initial chip render helper (server-rendered SVG circle with letter, or HTML+CSS — either is cheap).
- **Adds**: deterministic palette function for empty thumbnails (hash → oklch → conic gradient inline SVG).
- **Adds**: relative-date helper (already exists in `playground/utils/`; just import).
- **Retires**: the empty `--bg-tertiary` thumbnail placeholder.
- **Retires**: the bare title-only card layout.

### Problems it solves

- Anonymized-makers (synthesis must-fix #3).
- "This is not a community" signal (PM critique).
- Empty-thumbnail-as-broken visual bug (UXD critique).
- Adds the curation-visibility signal to `/explore` (the Featured badge tells visitors "this got picked").

### Cost

- Engineering: low. Card template changes + two new helpers. No new data dependencies after Phase 4.
- Content: zero. Pulls from data we already have.

### Hardest call

- **Whether the creator chip on the card should route to the creator's profile (`/u/:handle`) or to the work.** Decision in the design: card body routes to the work; the handle text in the footer chip is the only escape hatch to the profile. This matches Observable / CodePen conventions and keeps the primary CTA unambiguous.

---

## Exploration 4 — "Feature-Tag Navigation" (explore page)

A filter layer on `/explore` driven by auto-derived tags computed from the source via `api-surface.ts` analysis. Converts the gallery from a wall into a learning catalog.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│        Explore                                                   │  ← H1 with lavender-gradient
│        community-approved Pathogen workspaces                    │  ← caption
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [ All 87 ]  [ Gradients 22 ]  [ Paths 41 ]  [ Text 14 ]         │  ← filter chips, one row
│  [ Animation 9 ]  [ Masks 6 ]  [ Patterns 11 ]                   │     count = items in that tag
│                                                                  │
│  Sort: ⌄ Recently published                                      │  ← sort dropdown to the right
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ card │ │ card │ │ card │ │ card │   ← (creator-credited per   │
│  └──────┘ └──────┘ └──────┘ └──────┘     Exploration 3)          │
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ card │ │ card │ │ card │ │ card │                            │
│  └──────┘ └──────┘ └──────┘ └──────┘                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Treatment notes

- **Tag taxonomy**: derived from a coarse grouping over `api-surface.ts` (gradients = ConicGradient/LinearGradient/RadialGradient/MeshGradient/FreeformGradient/TopoGradient; paths = Path/PathBlocks/`.drawTo`; text = Text/Tspan; animation = `@keyframes`-emitting helpers; masks = Mask/ClipPath; patterns = Pattern/Marker). Six to eight buckets total. Keep the chip row to one wrappable line.
- **Filter state**: URL-driven (`?tag=gradients`) so links to filtered views are share-able and back-button-friendly. No client JS state; the page re-renders SSR.
- **Sort options**: `Recently published` (default), `Featured first`, `Most-used construct` (groups by primary tag). All cheap given data we already have.
- **All chip**: shows the unfiltered count and acts as a "clear filter" affordance.

### What it consumes

- Per-approval `featureTags: string[]` field (new). Computed at approval time by feeding `approval.code` to the existing `api-surface.ts`-style static analysis already shipped in the compiler.
- `public:workspaces` index gains an index-by-tag denormalization: `public:workspaces:tag:gradients`, etc. (Or compute at render time from the single index — `public:workspaces` has 100 entries max, filtering in the worker is fine.)

### What it adds / retires

- **Adds**: tag computation step in `adminReviewDecision` (one-time per approval; idempotent backfill script for existing approvals).
- **Adds**: filter chip row and sort dropdown in `renderExplorePage`.
- **Adds**: filter parameter routing in the worker.
- **Retires**: nothing — purely additive.

### Problems it solves

- Gallery-as-catalog gap (ID critique).
- "I want to find ConicGradient examples" user story (no entry point today).
- Sets up `/featured` page tags as well (Exploration 2's "Pathogen of the Week" can carry a primary tag).

### Cost

- Engineering: medium. Tag derivation + backfill + SSR filter UI + URL routing.
- Content: zero.

### Hardest call

- **Tag granularity.** Six coarse buckets vs. twenty fine-grained tags. Coarse wins for `/explore` (visitors browse by intent, not by API method) — but the per-card chips in Exploration 1 can show fine-grained tags so the detail page becomes an API reference *in situ*. Resolve: store fine-grained tags on the approval, render coarse buckets on the filter chip row, render fine-grained chips on the detail page. One data field, two presentations.

---

## Exploration 5 — "Thumbnail Pipeline Gate" (moderation workflow)

Not a visual redesign — a structural change to the approval pipeline that makes every other exploration in this document possible. Currently `approval.svg` may be empty (legacy approvals) and `og:image` falls back to `/og-default.png`. This exploration requires a successful render before an approval can advance.

### How it works

1. Admin opens a card in `/admin/moderation`. The modal compiles the queued code in the admin's browser (already does this — Phase 4).
2. On Approve, the admin's browser captures three artifacts:
   - The inline SVG string (already captured today).
   - A 1024px PNG raster via canvas (the *primary* contribution of this exploration).
   - The fine-grained feature-tag list from `api-surface.ts` analysis (Exploration 4's data dependency).
3. POST `/admin/review/:id` includes `{ svg, thumbnailPng, featureTags }`. Server stores SVG in the approval, uploads the PNG to R2 at `thumbnail/{id}/1024`, and writes `featureTags` and `autoThumbnailAt` on the approval.
4. If compile fails or PNG capture fails, the Approve button is disabled with a `Cannot approve: render failed` message. The admin can still Reject (the queue entry is preserved for the owner to fix and re-submit).
5. Re-review pipeline runs the same gate.

### What it consumes

- Existing compile + render path in the admin moderation view.
- A new client-side `svgToPng(svgString, size: 1024)` helper (Canvas2D rasterization). Already partially exists in the playground (thumbnail capture for personal workspaces).

### What it adds / retires

- **Adds**: client-side PNG capture step in the admin Approve flow.
- **Adds**: server-side R2 write at approval time (currently thumbnails are generated lazily on read).
- **Adds**: feature-tag derivation step.
- **Retires**: the lazy-thumbnail server endpoint can keep existing as a fallback but is no longer load-bearing for approved workspaces.

### Problems it solves

- Legacy-approval empty-embed (every approved workspace now has an SVG and a thumbnail).
- Generic OG card on share (every approval has a real 1024 PNG ready for `og:image`).
- Server cost of live re-render (eliminated for approved workspaces).
- Provides the data feed for Explorations 1, 2, 3, and 4.

### Cost

- Engineering: medium. The admin client gains a PNG capture step; the server gains an R2 write; the moderation flow gains a "render failed → cannot approve" branch.
- Content: zero.

### Hardest call

- **What to do with workspaces whose render fails server-side but admin can render in their browser.** The admin's browser has WebGPU (for conic-gradient rasterization); the SSR worker doesn't. The captured PNG carries the admin's render — which is what we want — but the captured SVG, if it references CSS or WebGPU-rasterized layers, may not render identically on the visitor's browser. Acceptable trade: the captured PNG is the *guaranteed* hero (Exploration 1's fallback chain), and the captured SVG is a progressive enhancement.

---

## Composition map

The explorations are not alternatives — they're a stack. Which ones reinforce which:

| If you do | It strengthens | It depends on |
|-----------|----------------|---------------|
| **1 (Plate)** | 3 (cards link to a real destination), 4 (chips have somewhere to land), 5 (uses the PNG fallback) | nothing strictly; better with 5 |
| **2 (Editor's Shelf)** | the curation narrative across the site | nothing strictly; better with 3, 5 |
| **3 (Creator Cards)** | 1 (creator chip echoes byline), 2 ("Also picked" cards reuse this), 4 (chips alongside filter) | Phase 4's `ownerHandle` (shipped) |
| **4 (Feature Tags)** | 1 (per-detail chips), 3 (badge slot reused), gallery learnability | 5 (tag derivation runs in the same pipeline) |
| **5 (Pipeline Gate)** | 1 (hero never empty), 3 (cards never empty), 4 (tags ready at moderation) | nothing — foundational |

---

## Recommended sequencing

**If we only do one** → **Exploration 5 (Pipeline Gate).** It's not the flashiest, but it's the foundation: every other exploration assumes `approval.svg` exists and `featureTags` is populated. Without 5, the detail page must keep a fallback chain, the cards must keep an empty state, and the filter chips have no data. Ship 5 first; the visual upgrades after it are pure additive value.

**If we do two** → **5 + Exploration 1 (Plate).** This is the highest user-visible impact pairing. 5 guarantees every approval has a render; 1 puts that render at the center of the share URL that every social post points at. The detail page becomes the headline showcase.

**If we do three** → add **Exploration 3 (Creator Cards).** Once detail pages are great destinations, the cards that link to them need to be worthy ramps. Creator credit is the social signal we're currently missing site-wide; this is the lowest-cost way to add it.

**If we do four** → add **Exploration 2 (Editor's Shelf).** With detail and cards both elevated, `/featured` becomes the page that's left behind. The editorial layout makes Pathogen Studio's curatorial voice visible — and the weekly cadence creates a returning-visitor habit.

**If we do all five** → add **Exploration 4 (Feature Tags)** last. Filter navigation is a power-user upgrade and pays back most when the rest of the gallery is already worth filtering. Don't ship filters on a wall of empty thumbnails; ship them on a wall of great work.

### Suggested first PR scope

If picking a single shippable PR from this set, scope: **5 + the must-fix items from the synthesis**. Specifically:
- Pipeline gate (capture SVG + PNG + tags at approval).
- Backfill script for existing approvals (re-renders + captures via headless puppeteer running the playground).
- Detail-page fallback chain: `approval.svg` → `approval.autoThumbnailAt`/`manualThumbnailAt` → branded placeholder.
- The "Published" / "Approved" copy correction (synthesis must-fix #1, trivial).

Everything else is incremental and can be sequenced behind real usage data (which page generates more inbound traffic — `/explore` or detail? — should drive whether 3 or 1 ships next).
