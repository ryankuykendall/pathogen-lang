# Voice and Audience

The audience and voice standard for all user-facing writing on pathogen.studio — docs pages, blog posts, tutorials, and the website's own copy. Generalized from the approach that shaped the stdlib primer series (`hash01` through `noise2`).

> **Jurisdiction:** This file governs *prose* voice — who we write for and how sentences read. The "editorial voice" tiers in [example-design-system.md](example-design-system.md) are a *visual* annotation concept and are unrelated; code inside examples is governed by [code-example-guidelines.md](code-example-guidelines.md).

## Scope

- **Applies to:** `docs/` pages, `website/blog/` posts, and the website's marketing/SSR copy (homepage, `/explore`, `/featured`, meta descriptions).
- **Does not apply to:** `project-docs/` or any other internal writing — plans, internal primers, review notes, weekly summaries. Internal documents optimize for precision among maintainers, not approachability.
- **New writing only.** Existing pages and posts are not rewritten to match this standard. See [New writing only](#new-writing-only--handling-older-content) below.

## Who we write for

People who build things with code — working developers, designers who code, creative coders.

We assume experience writing software: our reader is comfortable with variables, functions, and loops, and has shipped things before. We do **not** assume a formal computer-science background or deep mathematical expertise. Terms like "hash", "lattice", "Hermite", "bilinear", or "interpolation" are not shared vocabulary until we make them so.

> This statement supersedes earlier framings, including "designers and SVG authors, not systems programmers" (`project-docs/enums-and-booleans/primer-v1.md`). Designers and SVG authors are part of the audience, not the whole of it.

## Voice principles

1. **Name concepts as physical objects before formal definitions.** Give every abstraction a mechanical mental model the reader can hold: "smoothstep is a dimmer between two markers", "bump is one smooth hill", "hash01 is a lookup, not a roll". The formal framing, if needed at all, comes after the picture.
2. **Translate jargon on first use.** Every unavoidable technical term gets one plain mechanical sentence the first time it appears ("a hash — which is just a scrambler with a pinned recipe"). If a term can be avoided entirely, avoid it.
3. **Ladder examples from very simple to complex.** Start with the barest possible picture of one mechanism — ideally with a contrast row showing what it replaces or differs from. Climb through examples that each isolate exactly one new idea. End with a finished, shippable composition that doubles as the argument for the feature.
4. **State gotchas honestly and early.** Name failure modes bluntly, before the pretty pictures — as plain footnotes, not fine print. A reader who hits the sharp edge should recognize it from the docs, not feel misled by them.

## Short-form and UI copy

The principles above are written for teaching prose; one-line surfaces (page subtitles, meta descriptions, hero ledes, empty states) follow these instead:

- **Name the audience concretely, not by category.** Use the canonical phrasings so surfaces don't drift:
  - **Short form:** "people who build things with code" (the variant "anyone who builds things with code" is acceptable where the sentence needs it).
  - **Long form:** "working developers, designers who code, and creative coders."
- **No superlatives.** Describe what the thing does, not how impressive it is.
- **Promise only what the adjacent surface delivers.** A subtitle above a card grid describes what's in the cards; a lede above a code sample must be true of that code sample.

## The Prerequisites callout

Any post or docs section that assumes prior material opens with a blockquote naming what the reader should already know, with links:

```markdown
> **Prerequisites:** This post assumes familiarity with PathBlock basics — the
> `@{}` sigil, `.draw()`, and `.project()`. If you're new to Pathogen, start
> with [Introduction to PathBlocks](/blog/pathblock-introduction).
```

If a piece is truly standalone, no callout is needed — but make that a deliberate choice, not an omission. Reviewers should treat a missing callout on prerequisite-heavy content as a defect.

## New writing only — handling older content

Existing docs and posts predate this standard and are **not** rewritten to match it. "New writing" means new pages and posts, new sections added to old pages, and existing sections substantially rewritten in place — a rewrite adopts the standard even though the page around it doesn't.

Site-wide copy (subtitles, meta descriptions) may state the standard as the target the corpus is being brought toward — "written in plain language" describes where the writing is headed, and every new piece must make it truer. That aspirational framing is deliberate and honest as long as new writing holds the line.

When new writing sits next to older content — a new section added to an old docs page, a new post linking to an old one:

- Match this standard in the new text.
- Minimal touch-ups to immediately adjacent sentences are allowed where needed for coherence.
- Do **not** expand scope into rewriting the surrounding page or post.
- Reviewers flag voice violations **only in new or changed text**. Older surrounding text is out of bounds unless it is factually wrong.

Expect some tonal seams between new and old content. That is an accepted cost; consistency arrives incrementally as pages are naturally revised.

## Review checklist

For agentic and human review of new user-facing writing:

- [ ] The audience is anchored — the content addresses people who build things with code, without assuming a formal CS background or deep math.
- [ ] Prerequisite-heavy content opens with a Prerequisites callout naming what's assumed, with links. (Missing callout on prerequisite-heavy content is a defect; truly standalone pieces may omit it deliberately.)
- [ ] No untranslated jargon in new text — every technical term gets a plain mechanical sentence on first use.
- [ ] Examples ladder from very simple to complex; the first example shows one mechanism bare.
- [ ] Gotchas and failure modes are stated plainly, early, and honestly.
- [ ] The scope caveat is respected — review comments target new/changed text only, not the older surroundings.
