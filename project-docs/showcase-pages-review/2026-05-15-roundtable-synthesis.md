# Showcase Pages Review — Roundtable Synthesis

**Date:** 2026-05-15
**Process:** Agentic multi-persona review (UXD / UXE / PM / ID) per `website/guidelines/agentic-review.md`.

**Surfaces reviewed**

- `/u/:handle/:slug` — workspace detail page (`renderWorkspaceDetailPage`, `website/_worker.ts` L444–L580)
- `/explore` — explore index (`renderExplorePage`, `website/_worker.ts` L138–L275)
- `/featured` — admin-curated showcase (`renderFeaturedPage`, `website/_worker.ts` L584–L735)

**Evidence base**: rendered screenshots `/tmp/showcase-explore.png`, `/tmp/showcase-featured.png`, `/tmp/regression-detail-u_seed-alice_alice-circle.png`, `/tmp/regression-detail-u_seed-bob_bob-star.png`, `/tmp/regression-detail-u_ryan-kuykendall_more-awesome-pattern.png`. `mini-workspace.ts` confirmed to have no fallback rendering when the `svg` child is missing — the empty box on detail pages is a structural gap, not a styling one.

---

## Framing (the headline finding)

All three pages currently read as **directory listings, not a gallery**. The product moment they're meant to support — "look at the things people are making with this language" — is not the dominant impression. The just-landed Phase 4 moderation workflow is invisible. Cards are anonymized. Creators are uncredited. Editorial typography in the stack (DM Serif Display) is largely unused on the editorial pages. The detail page — which is the destination URL for every share link — leads with a small serif title and then approximately 500 pixels of empty white box. The brand has the ingredients of a gallery; the assembly is a CRUD index.

---

## Step 1 — Independent Persona Critiques

### Jordan Chen — Principal UX Designer (UXD)

1. **Hero hierarchy is inverted on the detail page.** The title `Alice Circle` (≈ 2rem DM Serif Display) is dwarfed by a roughly 700×460 px panel of empty whitespace below it. There is no visual hero. Even when the embed renders, an interactive panel is the wrong opening note for a destination page — it reads as a tool chrome, not a presentation surface.
2. **The typographic system is on the bench.** Site wordmark uses Baumans (good). Detail H1 uses DM Serif Display (good). But `/explore` and `/featured` H1s render in DM Sans at 1.5rem — clinical, scannable, but completely off-brand for editorial gallery pages. DM Serif Display is in the loaded font set and unused on the pages that most need editorial voice.
3. **Empty thumbnail placeholders feel broken, not pending.** The peach `--bg-tertiary` fill bleeds through where thumbnails are absent and reads as "render failed". A neutral neutral-light skeleton, or a thumbnail composed from the workspace's primary color palette, would be a better failure mode.
4. **Cards have no perceived rank or origin.** On `/explore` and `/featured`, the cards are visually identical: same border, same radius, same chrome. There's no creator avatar/handle, no "featured" badge on the featured page beyond the URL, and no editorial framing of why a piece was selected. The curation we just shipped is doing zero perceived work.
5. **Detail page sparseness is the wrong problem to solve by adding more chrome.** Counterintuitively, what the detail page needs is a *bigger* hero (the snapshot SVG or thumbnail at fill width, no panel chrome), not more side-rails. The whitespace is failing because nothing is anchoring the eye.
6. **Visual observation across screenshots:** the dotted background grain (atmospheric texture in `theme.css`) is present but doing nothing to elevate these pages — it reads as "default chrome" rather than as part of a gallery treatment.

### Maya Patel — Principal UX Engineer (UXE)

1. **The detail page silently degrades into emptiness when `approval.svg` is absent.** Line 532 emits `${approval.svg ?? ''}` into the `<mini-workspace>` slot. The component's `_captureChildren` pulls `<svg>` directly; with no svg child, `mini-preview` renders empty. This is a real bug, not a screenshot artifact. **The renderer already has `approval.manualThumbnailAt || approval.autoThumbnailAt`** (line 505) and uses it only for the OG image (line 508) — never on-page. A static `<img>` fallback would close the broken-first-impression gap immediately, regardless of whether legacy approvals get re-rendered.
2. **The embed is the wrong primitive for a destination page.** `<mini-workspace>` is a blog-post inline embed — chevron header, glass bar, CodeMirror lazy-load, fullscreen toggle. For `/u/:handle/:slug` we want a *hero rendering* with code as a secondary affordance below or behind a disclosure. The current page imports the most heavyweight surface in the codebase for what should be a static-first showcase.
3. **No structured data for the showcase.** Explore/Featured emit `CollectionPage` JSON-LD but list zero items. Detail page emits no schema at all. For a page intended to drive inbound social traffic, `CreativeWork` / `ImageObject` schema with the creator, date, license, and thumbnail is table stakes.
4. **Accessibility gaps on the cards.** `alt=""` on every thumbnail (lines 175, 368, 656) is technically valid only because the card is fully labeled by the H3 — but the H3 alone doesn't tell a screen reader what the artwork *is*. Author + name + "untitled image" would serve assistive tech better.
5. **Breadcrumb separator `›` is a non-semantic character outside the link region but visually conjoined.** Acceptable but should be `aria-hidden` to prevent screen readers reading "right single angle bracket".
6. **`featuredIds` fetch path issues N+1 KV reads per render** (line 608 — `Promise.all` parallelizes, but it's still O(featured) round trips plus another `workspace:${id}` lookup each). At Cloudflare scale on a cached page this is fine; if featured grows past ~20 items, denormalize.
7. **Cache headers are uniform across all three pages** (`s-maxage=60, max-age=30`). The detail page is content-addressed (approval is frozen) and could be cached for hours with a purge on re-moderation. The TTL is leaving performance on the table on the page that most warrants it.

### Elena Martinez — Sr. Staff PM

1. **The value proposition collapses on click-through.** Someone shares `/u/ryan-kuykendall/more-awesome-pattern` on Twitter/Bluesky. The recipient lands on a page with a small title, three lines of meta, an empty white box, and an `Open in playground →` link. Nothing on that page argues "this is interesting, you should care, look what this language did." The biggest growth surface in the product is currently a dead end.
2. **Curation is invisible.** The task brief calls out that "every workspace on /explore is now reviewer-approved, every featured workspace was hand-picked by an admin." A user visiting these pages would have no idea. There is no `Featured by @admin` byline, no editor's note on `/featured`, no "Recently approved" framing on `/explore`, no review badge anywhere. We shipped Phase 4; the product narrative didn't ship with it.
3. **Where is the creator?** On `/explore`, cards omit the creator's handle entirely. Pathogen Studio is positioning itself as a *social* surface for a programming language — anonymizing makers is strategically backwards. Compare Observable, CodePen, Glitch, Shadertoy: every gallery card credits the author front-and-center because attribution drives both creator motivation (vanity reward) and viewer trust (this person is real, I can follow them).
4. **No social signals.** No like count, no "added X days ago", no share button on detail, no related works, no "more by this creator", no comments, no fork. We don't need all of these — but we need *some* to telegraph "this is a community, not an archive."
5. **No editorial layer.** `/featured` shows three cards and a paragraph subtitle. A featured page is the product's stage. Where is the curated collection name? The theme of the week? The "Editor picks: gradients" rail? The interview with a creator?
6. **The funnel ends at `Open in playground →`.** That link sends a curious visitor into the editor — but a brand-new visitor has no Pathogen install, no auth, no idea what to do. The detail page should also offer "Fork this" (low friction), "Copy the source" (lowest friction), and "Sign in to save your own" (acquisition).
7. **SEO meta is generic.** `og:image` falls back to `/og-default.png` when no thumbnail exists. For a "look at the cool thing I made" share, the default Pathogen card is going to underperform vs. a card *of the cool thing*. Forcing every approval through the auto-thumbnail pipeline before allowing the moderation queue to advance would be the strategic fix.

### Alex Rivera — Staff Instructional Designer / Technical Writer (ID)

1. **The detail page is missing the "what am I looking at" beat.** Title, description, byline, embed. No context: how big is the program? Which features does it use? Is it animated? Is it interactive? A new visitor cannot triage whether this page is worth their attention. A small metadata strip — `127 lines · uses ConicGradient · forks 0 · approved May 14` — would dramatically improve scannability.
2. **The breadcrumb is the only navigation, and it's working hard for limited payoff.** `Explore › @handle › Name` is fine, but for a destination URL, secondary navigation surfaces are more useful: "More by @handle" (3 thumbnails), "Similar approved works" (3 thumbnails). Right now the page terminates with a single hyperlink to the playground.
3. **`Open in playground →` is the wrong primary CTA for a learner.** The instructional move is *"read the source first, then open it"*. The page should expose the source code by default (not behind the embed's lazy CodeMirror disclosure) — code visibility is what makes this a teaching artifact rather than a gallery exhibit. Pathogen is a programming language; the source is the artifact, the render is the proof.
4. **`/explore` has no entry points for discovery by topic.** Pathogen has concepts (gradients, masks, paths, text, animation). A learner trying to understand `ConicGradient` has no way to filter `/explore` to ConicGradient examples. Tags or feature filters would convert the gallery into a learning catalog.
5. **`/featured` has no curatorial voice.** This is the place where the team should be teaching — "We picked this because it shows `.boundingBox()` composing with `.drawTo()`". Without that, featured-vs-explore distinction is just count and aspect ratio.
6. **Description truncation at 120 chars on /explore (line 163) and 200 chars on /featured (line 647) is doing real damage on the truncated copy.** "Where we are now hahaha..." (visible on the explore screenshot) is the visible signal of authors writing for the playground UI and getting their text mangled on the gallery card. Either tighten the cap and require well-written cards on submission, or honor longer descriptions on featured.
7. **No labeling/naming convention for the approval date.** "approved May 14, 2026" reads as moderation queue metadata leaked to users. The right framing is editorial — "Published May 14, 2026" or "Added to gallery May 14, 2026."

---

## Step 2 — Cross-Critiques

### UXD on the others

- **Agree with UXE** that the empty embed is a structural bug — but disagree that we should ship a static `<img>` fallback *and keep* the existing embed chrome. The chrome itself is wrong for this page. The right move is a different layout (hero render → optional code disclosure), not a fallback rendering inside the wrong shell.
- **Agree with PM** on creator attribution; this is craft as much as it is strategy.
- **Disagree with PM and ID** on adding "more by @handle" rails and metadata strips *before* solving the hero. Adding more chrome to a page whose main panel is broken makes the page busier and emptier at once. Order of operations matters: hero first, then framing, then rails.
- **Agree with ID** on the descriptions being truncated badly but think the fix is editorial discipline at submission time, not at render.

### UXE on the others

- **Agree with PM** that re-rendering legacy approvals or forcing thumbnails before moderation are the right structural fixes, and would add: the renderer should never trust `approval.svg` as the *only* render path. There should be a documented fallback chain: live re-render → snapshot SVG → manual thumbnail → auto thumbnail → branded placeholder.
- **Disagree with PM** on social signals (likes, shares, comments) — those are non-trivial moderation/spam surfaces and shouldn't be the first product investment on top of a just-shipped moderation pipeline. "More by this creator" and "View source" are cheap and high-leverage; the rest is roadmap.
- **Agree with UXD** that the embed is the wrong primitive but want to push: it's also fine to *make* the right primitive — a `<workspace-showcase>` component that's static-first, with the interactive editor as a progressive enhancement on user gesture.
- **Disagree with ID's "show source by default"** for the same-bandwidth/perf reason that the current embed lazy-loads CodeMirror. Source as a `<pre>` with syntax via TextMate-on-build (already used for the blog) is fine; loading CodeMirror on page render is not.

### PM on the others

- **Agree with UXD** that hero-first is the right order — but want to add: the hero should *be the social object*. The thing someone is sharing IS the rendered work. Make the OG image and the on-page hero the same artifact.
- **Agree with ID** on missing curatorial voice on `/featured` — this is the single biggest miss across the three pages. Featured without commentary is just a smaller explore.
- **Disagree with UXE** on deferring all social signals to "roadmap" — at minimum, a public view count + "created N days ago" timestamp is cheap to implement and provides the "this is a community" signal we currently lack.
- **Agree with ID's tag/filter direction** but want to flag the dependency: tags require either author tagging at submit time (UX cost) or AI/static analysis on the source (engineering cost). Pick the path before promising the filter.

### ID on the others

- **Agree with UXD** on the typography critique and want to push it further: editorial pages should use DM Serif Display *with intentional treatment* (drop caps on featured? lavender-gradient on the H1 echoing the wordmark?). Just swapping the font isn't enough — use the typographic system to assert that these are gallery pages.
- **Agree with PM and UXE** that the detail page is currently a dead end. The fix is layered: hero, then metadata strip, then code, then `Open in playground` *and* `Fork in playground` *and* `Copy code`.
- **Disagree with UXD** on "more chrome makes it worse" — the page is empty *because* there's no scaffolding. A metadata strip is not chrome, it's content. The contrast is between *decorative* chrome (the embed's glass bar) and *informational* scaffolding (line count, features used, creator card).
- **Agree with PM on tags** but flag: we already have static analysis in the compiler for which constructs a workspace uses (via `BUILTIN_ENUMS`/`api-surface.ts`). Auto-derived tags are the right first move and don't require author UX.

---

## Step 3 — Synthesis

### Current state (one paragraph)

The three showcase surfaces are directory listings dressed as gallery pages. They share four root problems: **(a)** the just-shipped moderation/curation work is invisible — no curator credit, no review framing, no "featured" badge; **(b)** creators are absent from the cards on `/explore` and underplayed on detail; **(c)** the detail page leads with an interactive editor primitive that silently degrades to empty when the snapshot SVG is missing, and never falls back to the thumbnails the renderer already has in hand; **(d)** the brand's editorial typography is loaded but unused on the editorial pages. The detail page in particular is the highest-leverage surface — it's the URL every share resolves to — and currently terminates the visitor's journey on arrival.

### Must fix (multi-persona, page-tagged)

1. **[Detail] Render a hero from `approval.manualThumbnailAt || autoThumbnailAt` whenever the embed cannot render.** The renderer already computes this URL on line 505 and uses it only for `og:image`. Use it on-page. This is a one-conditional change that converts every legacy approval from a broken-looking page into a still-image showcase. *(UXE, UXD, PM)*
2. **[Detail] Replace `<mini-workspace>` with a static-first showcase primitive on this page.** Hero render at fill width → metadata strip (creator + date + features used + line count) → source as syntax-highlighted `<pre>` → CTA row. Save the interactive editor for `Open in playground`. *(UXD, UXE, ID)*
3. **[Explore] Add creator attribution to every card.** Avatar (or initial chip) + `@handle` rendered below the title. Anonymous gallery cards are the single biggest "this is not a community" signal currently broadcast. *(PM, ID, UXD)*
4. **[Featured] Make curation visible.** Add a "Curated by Pathogen Studio" credit line, and at least one editorial sentence per featured card explaining *why* it was chosen. The page should read like an editor's shelf, not a smaller `/explore`. *(PM, ID, UXD)*
5. **[All] Use DM Serif Display for the page H1s and treat them editorially.** Match the wordmark treatment energy — the lavender-gradient "Studio" is the brand vocabulary for editorial moments; reuse that gesture on `/featured` and `/explore` headings. *(UXD, ID)*

### Should improve (single-persona but durable)

6. **[Detail] Add `CreativeWork` + `ImageObject` JSON-LD with creator, datePublished (= approvedAt), and image (the 1024 thumbnail).** Improves SEO and social card quality. *(UXE)*
7. **[Detail] Add secondary CTAs: "Copy source", "Fork in playground", "Share".** Funnel-widening. *(PM)*
8. **[Detail] Show feature/construct tags auto-derived from the source.** We already have `api-surface.ts` static analysis; surface it. Doubles as the seed for filter UI on `/explore`. *(ID, PM)*
9. **[Detail] Add a "More by @handle" rail (3 thumbnails) at the bottom.** Cheap to implement once the profile fetch is already happening. *(ID, PM)*
10. **[Detail] Reframe `approved Feb 3, 2026` as `Published Feb 3, 2026`.** Moderation-queue language leaking to readers. *(ID)*
11. **[Detail] Increase Cache-Control TTL.** Approvals are frozen content — `s-maxage=3600` with a purge on re-moderation would be safe. *(UXE)*
12. **[Explore] Replace empty thumbnail placeholders with a neutral skeleton or palette-derived swatch.** The peach `--bg-tertiary` bleed reads as broken. *(UXD)*
13. **[Explore] Add at least a sort control ("Newest" / "Featured" / "Most viewed").** A wall of 100 items with no controls is not a gallery experience. *(PM, ID)*
14. **[Featured] Allow taller/richer cards** — featured items should not share card geometry with explore items. Larger thumbnail, longer description, optional pull-quote slot. *(UXD)*
15. **[All] Audit `alt=""` on thumbnail images for screen-reader users.** Use `${name} by @${handle}`. *(UXE)*

### Design directions to explore (the actionable payload for frontend exploration)

Each direction names the problem it solves and the cost it carries. Pick a subset; they compose.

**Direction A — "Hero-first detail page."** Restructure `/u/:handle/:slug` around the rendered work, not the editor. Layout: full-bleed hero (snapshot SVG or 1024 thumbnail, on a generous mat) → title + byline overlay or below → metadata strip → source code (collapsible `<pre>`) → CTA row. *Solves:* the broken-first-impression problem, the curation-invisibility problem, the source-as-teaching-artifact problem. *Cost:* new server-rendered component; retire the embed on this surface. *Hardest call:* how big the hero gets on mobile.

**Direction B — "Editorial Featured."** Treat `/featured` as a magazine page, not a grid: top hero (largest featured piece, with a curator pull-quote and `Featured this week` label), then secondary picks in 2-up, then "Past picks" as a smaller archive grid. *Solves:* curation invisibility, the "this is just a smaller explore" problem. *Cost:* schema change to allow `curatorNote` and `featuredAt` per featured entry; admin tooling for editing the note. *Hardest call:* publishing cadence — weekly? rolling?

**Direction C — "Creator-credited Explore."** Each `/explore` card carries creator avatar + handle, with an optional badge ("Featured", "New this week", "Editor's pick"). Cards link to the work; clicking the creator chip routes to the profile. *Solves:* anonymized makers, lack of social signal. *Cost:* one extra KV round-trip per card to fetch the creator (or denormalize handle into `public:workspaces`); avatar service if we don't have one (initial-chip fallback is fine). *Hardest call:* whether to show approval status badges to logged-out visitors.

**Direction D — "Feature-tag navigation."** Auto-derive tags from `api-surface.ts` analysis at moderation time, store them on the approval, render them as filter chips on `/explore` (`gradients`, `paths`, `text`, `masks`, `animation`). *Solves:* the gallery-as-catalog gap, the "I want to learn ConicGradient" use case. *Cost:* one-time backfill of approvals; chip UI on explore; URL state for filters. *Hardest call:* tag taxonomy granularity.

**Direction E — "Thumbnail-as-OG-card pipeline gate."** Require a successful auto-thumbnail before an approval can be advanced through moderation. Cache the 1024 PNG. Use it as both the on-page hero fallback AND the `og:image`. *Solves:* legacy-approval empty embed, generic OG card on share, server cost of live re-render. *Cost:* moderation workflow change; one-time backfill. *Hardest call:* what to do with workspaces whose render fails server-side.

### Consider (low priority, document for later)

- Atmospheric texture/grain treatment on gallery hero areas — currently doing nothing visible to elevate the pages.
- Drop-caps or oversize numerals on featured items.
- View counts and creation date on detail (cheap social signal; some PM/UXE disagreement on prioritization).
- A "Random workspace" link in the site header — discovery surface for repeat visitors.
- Reader-facing "Report this" affordance on detail to feed back into moderation.
- RSS/Atom feed for `/explore` (new approvals) and `/featured` — cheap, niche, perfect for a developer-tool audience.
