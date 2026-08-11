# Deferred Opportunities — Voice & Positioning on the Website

Surfaces identified during the 2026-08-08 website copy survey that would lean
into the [Voice and Audience](../../website/guidelines/voice-and-audience.md)
positioning, deliberately **not** implemented in the first pass. Ranked by
expected impact.

1. **Homepage hero code-sample swap** — `website/_worker.ts` (`codeSnippet`
   const, ~line 1074+). The first real content below the h1 opens with raw
   OKLCH triples and radians (`Color.palette(oklch(0.6695 0.2483 330.1), …)`,
   `calc(2pi * (index / colors.length))`). A reader without color-science or
   trig comfort bounces here. Wanted: a one-liner hero sample laddering to the
   29-petal composition as the payoff — making the h1 ("From a one-liner to a
   thousand-line composition") literally true. Requires regenerating the hero
   SVG to match. **Urgency raised by the 2026-08-08 agentic review (S4):** the
   lede now promises "made for anyone who builds things with code" directly
   above this snippet, so continuing to defer means the most-viewed surface
   actively contradicts its own lede.

2. **Playground template-picker rework** —
   `playground/components/views/new-workspace-view.ts:500-505`. Options are
   de-camel-cased raw keys from `playground/utils/examples.ts` ("Descending",
   "Polar Path"), no descriptions, no difficulty ordering. Wanted:
   hand-authored labels + one-line descriptions, ordered simple → complex.
   This is the playground's unlabeled progression ladder.

3. **Showcase tile alt text** — `website/_worker.ts:1038-1074`. Alt text
   assumes the full vocabulary ("PathBlock parametric sampling — get(),
   tangent(), and normal() at t = 0.4", "2x2 mesh gradient with bilinear
   OKLCH interpolation"). Wanted: plain-language alt text per the jargon
   principle.

4. **Retrofit Prerequisites callouts onto older posts/docs** — violates the
   new-writing-only scope today; revisit if/when the scope decision changes
   or pages are naturally revised.

5. **Single-source the persona focus lists** — `website/guidelines/
   agentic-review.md` and `.claude/agents/content-reviewer.md` duplicate the
   four personas' focus areas verbatim; currently mitigated by a
   update-both-together note. A codegen or include mechanism would remove the
   drift risk (cf. memory: no hand-maintained drift-prone files).

6. **`new-blog-post.ts` `--series` / `--series-part` flags** — series
   frontmatter (added for the primer grouping) is hand-authored today; the
   scaffolder could take flags.

7. **Visible docs-landing intro paragraph** — the docs page has no visible
   intro naming the audience (only meta tags were updated); the sidebar is a
   flat 24-file list ordered by topic, not difficulty. A short intro +
   "start here" pointer would extend the positioning beyond metadata.
