# Chrome Inventory — Current Mini-Workspace

Measurements of the current embedded-mode chrome, based on the reviewer-annotated screenshot (`assets/reviewer-markup.png`) and the component source (`playground/components/blog/mini-workspace.ts`, `mini-preview.ts`).

## Layout-Consuming Chrome (vertical bands)

| # | Band | Height | What it holds | Notes |
|---|------|-------:|---|---|
| 1 | Top toolbar row | ~56px | `</> Code` button (left), `Open in Playground ↗` (right) | Two chunky buttons, mostly empty space between them |
| 2 | CSS variable row | ~48px | Three color swatches with labels, `Reset` button | Always visible even when no var is dirty |
| 3 | Code panel header | ~32px | `SOURCE` label, `Copy` button | Only functional element is Copy |
| 4 | (preview, no header) | 0px | — | Title is pushed inside preview; currently hidden behind minimap |
| 5 | Footer | ~40px | `PATHOGEN` wordmark (left), italic caption (center) | Cosmetic; caption is the key payload |
| — | **Total** | **~176px** | | |

## Overlay Chrome (does not consume layout)

| Overlay | Dimensions | Problem |
|---|---|---|
| Minimap | ~120×120px, top-left of preview | **Covers the title** — the reviewer's primary complaint |
| Fullscreen toggle | ~44×44px, adjacent to minimap | Only discoverable because minimap is there |
| Zoom controls pill | ~200×40px, bottom-center | Always visible; takes valuable preview real estate |

## Why Each Band Is Vulnerable

- **Band 1 (top toolbar)**: chunky button padding inflates height far past what icon+text require. Buttons are at opposite corners, wasting ~500px of inter-button space. Collapses easily to a thinner single strip.
- **Band 2 (CSS vars)**: colors are the *subject* of this component when vars exist, but the row's presence doesn't scale with need — same height whether there are 0 or 8 vars. Multiple reduction paths: move chips into code (DevTools-style), collapse into a dropdown, move to a contextual panel-level rail.
- **Band 3 (SOURCE header)**: `SOURCE` label is redundant — the gutter with line numbers makes it obvious what this panel is. Only `Copy` has value; can be an icon-only action elsewhere.
- **Band 5 (footer)**: PATHOGEN wordmark is cosmetic branding — can become a subtle watermark. Caption is valuable but lives in a spot users won't look; belongs near the title.
- **Minimap overlay**: earns its keep only when users routinely zoom in. For a blog preview where defaults fit the viewport, it's decoration. Reviewer's decision: suppress in embedded, restore in fullscreen.

## Reduction Target

**50% minimum** (≤88px total), **75% aspirational** (≤44px total).

All five explorations hit ≥50%; `02-devtools-inline`, `03-ambient-chrome`, `04-split-ribbon`, and `05-refined-monochrome` hit ≥65%.

## Chrome That Must Survive Every Exploration

| Feature | Why it's non-negotiable |
|---|---|
| Code toggle | Lets reader hide code to focus on result |
| Copy button | Fastest path to reuse a sample |
| Playground link | Primary funnel to the interactive product |
| Fullscreen toggle | Essential for detailed inspection |
| Per-variable color pickers | The interactive payoff for reactive-color demos |
| Reset | Recovers from exploratory edits |
| Zoom controls | Essential when users do zoom in |
| Caption | Subtitle that explains what's being demonstrated |
| PATHOGEN brand | Brand presence; can be subtle |
| Minimap | Required in fullscreen; optional in embedded |
