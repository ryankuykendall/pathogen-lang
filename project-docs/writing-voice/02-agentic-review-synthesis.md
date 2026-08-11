# Agentic Review Synthesis — Voice & Audience Guideline + Website Copy (2026-08-08)

Four-persona review (UXD, UXE, PM, ID) of the new `website/guidelines/voice-and-audience.md`,
the CLAUDE.md/review-process wiring, and the website copy edits. Prose-only batch — PNG
prerequisite waived by the orchestrator (which itself surfaced finding M2).

Disposition markers: ✅ applied in-session · ⏳ deferred (tracked) · 👤 user decision.

## Must fix

- **M1 ✅ Copy asserted corpus-wide what the guideline scopes to new writing only.**
  "written/explained in plain language" over the whole blog/docs corpus vs the guideline's
  new-writing-only scope. Resolved per the review's recommendation (a): the guideline's
  "New writing only" section now states that site-wide copy states the standard as the
  target the corpus is being brought toward.
- **M2 ✅ Review prerequisites couldn't support scoped voice review.** Reviewers are told to
  flag new/changed text only but got no diff. Added prerequisite 4 (**Change scope** — diff
  or explicit list of new/changed sections) and a prose-only carve-out for the PNG
  requirement to `agentic-review.md`.
- **M3 ✅ The new `seriesDescription` violated the guideline's own checklist** ("deterministic",
  "shaping functions" untranslated in the highest-traffic newcomer position). Rewritten with
  mechanical glosses in `primer-hash01.md`.
- **M4 ✅ Checklist item 1 contradicted the Prerequisites section** (either/or let the callout
  be skipped). Split into two checkboxes; missing callout on prerequisite-heavy content is a
  defect.
- **M5 ✅ Guideline claimed marketing copy but had no principles for it.** Added a
  "Short-form and UI copy" section: canonical short form ("people who build things with
  code", "anyone who…" variant allowed) and long form ("working developers, designers who
  code, and creative coders"), no superlatives, promise only what the adjacent surface
  delivers.
- **M6 ✅ Series section and child cards shared heading level** (h2/h2), no `aria-labelledby`,
  SPA gave the group header zero typographic authority. Cards are now h3 inside a series
  section on both surfaces, section is `aria-labelledby` its h2, SPA card titles reduced to
  1.125rem inside groups.
- **M7 ✅ `<meta name="description">` missed on /explore and /featured** (visible subtitle and
  JSON-LD updated, the search-result string stale). Both `renderPage` descriptions updated.

## Should improve

- **S1 ✅ Series-card hover suppressed in the SPA** (specificity tie, later background
  override won). Fixed together with S2.
- **S2 ✅ Static and SPA inverted the series elevation relationship.** SPA now mirrors static:
  container `--bg-primary`, cards keep their `--bg-secondary` base and default hover.
- **S3 ✅ Grouping broke on the first interleaved post** (consecutive-run detection + the
  different-dates series rule). Both renderers now group by series key across the full
  index, anchored at the series' newest post.
- **S4 ⏳👤 Promote the homepage hero code-sample swap from deferred to next.** The new
  inclusive lede sits directly above a snippet opening with OKLCH triples and `2pi` math —
  the contradiction is now louder than when the swap was deferred. Tracked in
  `deferred-opportunities.md` (item 1, urgency note added).
- **S5 ✅ Series frontmatter documented in one place, read in another.** Keys added
  (commented) to the frontmatter code block in `website/blog/CLAUDE.md`.
- **S6 ✅ Scaffold hazard in `new-blog-post.ts`** (instructions + repo path in a live
  blockquote). Instructions moved to an HTML comment; `build-blog.ts` now warns on leftover
  scaffold text.
- **S7 👤 Confirm title-fallback naming against the brand decision.** "Pathogen Studio — a
  typed, expression-first language for SVG paths" conflates the studio brand with the
  language. Pre-existing conflation in the lede; needs a user call, not a code fix.
- **S8 ⏳ Docs audience claim is meta-only** — no reader-visible docs intro. Already deferred
  item 7; the aspirational-copy resolution makes it more pressing.

## Consider

- **C1 ✅** Jurisdiction blockquote added to the guideline (prose voice vs
  `example-design-system.md`'s visual "editorial voice" vs code-example guidelines).
- **C2 👤** Playground UI strings, VS Code marketplace description, npm README, CLI --help:
  in or out of scope? Guideline is currently silent; deferred item 2 implies in.
- **C3 ✅** "New writing" now explicitly includes sections substantially rewritten in place.
- **C4 ✅** "1 parts" pluralization fixed both renderers.
- **C5 — not applied.** SPA leaves series strings unescaped, consistent with the file's
  existing unescaped `post.title` convention (trusted authored input). Hygiene only.
- **C6 ✅** "· Part N" moved out of `<time>` into a sibling span on both surfaces.
- **C7 ✅** CLI next-steps renumbered ("Before you write: …" then 1/2/3).
- **C8 👤** Optional single pointer sentence in root `.claude/CLAUDE.md` (not a link list).
  Current decision of record is not to edit the root file.
- **C9 ⏳** Persona focus lists now exist in three hand-maintained copies; drift already
  observed at agent-launch time. Deferred item 5.
