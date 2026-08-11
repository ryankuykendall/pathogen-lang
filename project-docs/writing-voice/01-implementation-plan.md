# Generalize the Primer Voice/Audience Positioning into Project Writing Guidelines

## Context

When the stdlib primers (hash01…noise2) were authored, we defined an audience and a voice for them: readers with experience writing software but no formal CS background or deep math; examples that build from very simple to complex applications. That positioning currently lives only in `project-docs/stdlib-primers/README.md:10-12` — invisible to authors and reviewers. Meanwhile:

- No voice/audience statement exists anywhere in the active guideline set (`website/guidelines/`, the CLAUDE.md files, the review personas). Content reviewers have independently flagged the missing-audience gap on at least four separate posts.
- An older internal primer (`project-docs/enums-and-booleans/primer-v1.md:148`) carries a conflicting framing ("designers and SVG authors, not systems programmers").
- The website's copy surfaces (homepage, blog index, docs meta, /explore, /featured) are audience-neutral and don't reflect the positioning, even though the primer series itself proves the voice works.

**User decisions (confirmed):**
1. Audience statement reconciles both framings: *people who build things with code — working developers, designers who code, creative coders — with experience writing software but no formal CS background or deep mathematical expertise assumed.*
2. Scope: user-facing writing only (`docs/`, `website/blog/`, website marketing copy). NOT `project-docs/` or internal docs.
3. New writing only — no retroactive rewrites. Include a caveat for handling adjacency with older content.
4. Website scope: guidelines + low-risk copy edits now; hero code-sample swap and template-picker rework deferred to a documented follow-up list.

## Phase 0 — Artifact directory

Create `project-docs/writing-voice/`:
- `README.md` — intro + provenance (generalized from `project-docs/stdlib-primers/README.md`), links to plan + deferred list.
- `01-implementation-plan.md` — copy of this plan (paper-trail convention).
- `deferred-opportunities.md` — see Phase 4.

## Phase 1 — New canonical guideline: `website/guidelines/voice-and-audience.md`

(Name avoids collision with `example-design-system.md`'s aesthetic "editorial voice" tier language.)

Sections:
1. **Voice and Audience** — purpose line: the audience/voice standard for all user-facing writing on pathogen.studio.
2. **Scope** — applies to `docs/`, `website/blog/`, website SSR/marketing copy. NOT `project-docs/` or internal writing. New writing only.
3. **Who we write for** — the reconciled audience statement above. Note it supersedes the enums-primer framing.
4. **Voice principles** — generalized from the primers:
   - *Name concepts as physical objects* ("a dimmer between two markers", "one smooth hill") before formal definitions.
   - *Translate jargon on first use* — every unavoidable term gets one plain mechanical sentence.
   - *Ladder examples simple → complex* — bare picture of one mechanism (ideally with a contrast row) → single-mechanism examples → finished, shippable composition.
   - *State gotchas honestly and early* — name failure modes before the pretty pictures.
5. **The Prerequisites callout** — codify the existing pattern (`website/blog/textblock-introduction.md:14`): content assuming prior material opens with `> **Prerequisites:** …` naming assumed knowledge, with links.
6. **New writing only — handling adjacency with older content** — the required caveat: match the standard in new text; minimal touch-ups to immediately adjacent sentences allowed for coherence; no scope-expansion into rewrites. Reviewers flag voice violations only in new/changed text.
7. **Review checklist** — ~5 checkboxes: audience named or Prerequisites present; no untranslated jargon; examples ladder; gotchas stated; scope caveat respected.

## Phase 2 — Wiring (author-side + reviewer-side)

- **`website/CLAUDE.md`** (Shared Content Guidelines list, ~lines 81-89): add Voice and Audience as first bullet.
- **`docs/CLAUDE.md`** (list ~lines 26-33): add Voice and Audience first; also fix drift by adding the missing `example-design-system.md` bullet.
- **`website/blog/CLAUDE.md`** — four edits:
  - Guidelines list (~186-192): add Voice and Audience; fix drift (add missing `example-design-system.md`, `text-collision-debugging.md`).
  - Content Guidelines (~25-30): add Prerequisites-callout bullet.
  - Playbook step 1 Synopsis (~line 125): append "default audience/voice come from the guideline; synopsis may narrow but not contradict."
  - Multi-Part Series (~178-184): document new frontmatter keys `series`, `seriesPart`, `seriesDescription` (Phase 3a).
- **`website/guidelines/agentic-review.md`**: add voice-alignment focus bullet to ID persona and audience-fit bullet to PM persona (both scoped to new/changed text); add maintenance note that focus lists are mirrored in `content-reviewer.md`.
- **`.claude/agents/content-reviewer.md`**: add the guideline to the Setup reading list; mirror the two new focus bullets (PM + ID lines ~47/49).
- **`scripts/new-blog-post.ts`** (template ~lines 76-85): scaffold a `> **Prerequisites:** …` stub blockquote under the title with instructions to fill or delete-if-standalone; add guideline pointer to the console "Next steps" output.
- **Root `.claude/CLAUDE.md`**: deliberately NOT edited (no guideline links there today; would start a new drift-prone list). Record decision in the artifact README.

## Phase 3 — Website copy edits (verified line refs)

### 3a. Blog index series grouping — `scripts/build-blog.ts` + 7 primer posts + SPA view
Mechanism: **frontmatter keys** (the line-based YAML parser at build-blog.ts:67-98 accepts arbitrary keys), not slug-prefix detection.
1. Add to `website/blog/primer-{hash01,hash11,hashrange,smoothstep,bump,noise,noise2}.md`: `series: "Stdlib Primers"`, `seriesPart: 1…7` (confirm order against each post's "Part N of 7" line); `seriesDescription` on part 1 only: *"Seven short guides to Pathogen's deterministic random and shaping functions — each starts from a bare picture of one function and climbs to a finished composition you could ship."*
2. Extend `Frontmatter`/`BlogEntry` types + `blogIndex.push` (~:236) with the optional keys.
3. Index card generation (~:505-533): detect consecutive runs sharing `series` in the date-sorted list, sort run by `seriesPart` ascending, wrap in `<section class="blog-series">` with eyebrow "Series" + name + part count + description blurb; cards keep existing `.blog-card` markup plus a "Part N" label. Escape with `escapeHtmlAttr`.
4. **Trap**: `latestBlogPost` emit (~:286) — pick only the four base `BlogPostMeta` fields so excess-property checking doesn't fail when the latest post carries series keys.
5. SPA parity: apply the same grouping + styles in `playground/components/views/blog-view.ts` (~lines 52-87; renderers are independently maintained).

### 3b. Blog index subtitle (all occurrences of the string)
"Thoughts, tutorials, and updates about pathogen-lang" → **"Tutorials, deep-dives, and updates about pathogen-lang — written in plain language for people who build things with code."**
Locations: `build-blog.ts:499` (JSON-LD) + shell description + visible subtitle (~:525/:530); `blog-view.ts` SPA subtitle (~:60). Grep for the string to catch all.

### 3c. Docs meta framing — `scripts/build-docs.ts`
- `:285` + `:288`: → **"Complete language reference for pathogen-lang — variables, expressions, control flow, functions, layers, and more, explained in plain language for people who build things with code."**
- `:296` (JSON-LD): → **"Plain-language reference for pathogen-lang, written for working developers, designers who code, and creative coders."**

### 3d. Homepage lede trio — `website/_worker.ts` (verified)
- `:1164` lede, first sentence only: → **"Pathogen Studio is a typed, expression-first language for SVG paths, made for anyone who builds things with code."** (second sentence unchanged)
- `:1234` JSON-LD + `:1243` meta description: add the same "made for anyone who builds things with code" clause consistently.

### 3e. /explore — `_worker.ts:207` subtitle → **"See what developers, designers, and creative coders are making with pathogen-lang"** (+ matching JSON-LD description ~:217).

### 3f. /featured — `_worker.ts:962` subtitle → **"Hand-picked examples of what a few lines of Pathogen can draw — from first shapes to finished compositions"** (+ matching JSON-LD ~:971).

### 3g. Title fallback — `_worker.ts:76`: `'Pathogen Studio — SVG Path Extended Playground'` (internal repo name leak) → `'Pathogen Studio — a typed, expression-first language for SVG paths'`.

## Phase 4 — Deferred-opportunities list (`project-docs/writing-voice/deferred-opportunities.md`)

Document with file:line anchors, explicitly not implemented now:
1. Homepage hero code-sample swap (`_worker.ts` ~:1074+ — opens with OKLCH triples + radians; wants a one-liner→payoff ladder + regenerated hero SVG).
2. Playground template-picker rework (`playground/components/views/new-workspace-view.ts:500-505` — raw de-camel-cased keys; wants descriptions + difficulty ordering).
3. Showcase tile alt text (`_worker.ts:1038-1074`).
4. Retrofit Prerequisites callouts onto older posts/docs (violates new-writing-only scope today).
5. Single-source the persona focus lists (`agentic-review.md` ↔ `content-reviewer.md`).
6. `new-blog-post.ts` `--series`/`--series-part` flags.
7. Visible docs-landing intro paragraph naming the audience (beyond meta tags).

## Verification

1. `npm run build:blog` (frontmatter parses, series groups, no warnings) and `npm run build:docs`.
2. **Trap**: never run plain `npm run build:website` while `dev:stack` is running (PATHOGEN_API_BASE prod-default). Kill dev servers first.
3. `npm run dev:website` → verify at localhost:3000 in light + dark: `/` (lede + view-source meta/JSON-LD), `/blog` (primer series grouped, non-series posts unchanged), SPA blog view, `/docs` meta, `/explore`, `/featured`.
4. `npm run check-links`.
5. **Agentic review before commit** (project convention): content-reviewer agent over the new guideline, CLAUDE.md diffs, and copy diffs (prose-only review, no PNG previews needed).
6. Commits: (1) guideline + wiring, (2) website copy + series grouping, (3) project-docs artifacts. CHANGELOG entry under Documentation.
