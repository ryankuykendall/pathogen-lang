# Pathogen Studio Homepage Redesign — Phase 1

**Status:** awaiting user pick
**Plan:** `~/.claude/plans/image-7-image-8-imperative-eagle.md`

## What this folder is

Four self-contained HTML mockups exploring how the Pathogen Studio homepage should look. Each carries the **atmospheric direction** established by the nav redesign (warm-cream backplate, grain texture, Baumans wordmark, DM Sans + DM Serif Display + Inconsolata) so you can immediately judge whether a candidate hero feels coherent with the nav we already shipped. Pick one direction, then Phase 2 will turn it into a server-rendered page.

## The 4 directions

| # | Direction | Hero | Section layout | Mood |
|---|---|---|---|---|
| 01 | [Editorial / centered](explorations/01-editorial.html) | Centered DM Serif Display title, generous whitespace, single CTA | Long vertical strips — title on left, visual on right | Calm, literary, magazine quality |
| 02 | [Magazine / asymmetric split](explorations/02-magazine-asymmetric.html) | Left: copy + CTA. Right: featured render | Asymmetric card grid + horizontal showcase strip | Creative-studio, mixed text + image weight |
| 03 | [Showcase-first canvas](explorations/03-showcase-canvas.html) | 3×2 grid of large render tiles; title + CTA in a sticky glass pill | Compact 4-col cards below the showcase fold | Visual punch, "see what you can build" |
| 04 | [Developer tool](explorations/04-developer-tool.html) | Code snippet on the left + live SVG on the right | 3-up terminal-styled cards (GitHub/CLI/VS Code), then Blog + Showcases | Restraint, IDE-flavored, productivity-first |

## Required sections (consistent across all 4)

Every mockup includes the full set, just arranged differently:

1. **Hero + primary CTA** — "Open My Workspaces" pill, peach-rose gradient. The single primary-color element on the page.
2. **GitHub repo** — Card linking to <https://github.com/ryankuykendall/pathogen-lang>. Material `code` icon.
3. **CLI** — Inline code snippet of a one-liner: `echo 'circle(100, 100, 50)' | pathogen-lang -`. Plus an install hint.
4. **Blog** — Card highlighting the most recent post: *"Strange Attractors: Clifford Attractor Art with Pathogen"* (2026-04-14).
5. **VS Code extension** — Placeholder card labelled "Coming to VS Code Marketplace". Uses `vscode-hero.png` thumbnail.
6. **Visual showcases** — 6 tiles representing Pathogen's range: conic gradient, mesh gradient, topological gradient, boolean operations, Clifford attractor, grid functions. Tiles link to the corresponding blog posts.

## How to compare

Each file shows **light theme on top, dark theme on bottom** at near-full laptop width. Open each in your browser:

```
open project-docs/homepage-redesign/explorations/01-editorial.html
open project-docs/homepage-redesign/explorations/02-magazine-asymmetric.html
open project-docs/homepage-redesign/explorations/03-showcase-canvas.html
open project-docs/homepage-redesign/explorations/04-developer-tool.html
```

Things to evaluate:

1. **Coherence with the nav** — does the hero/sections feel like the same product as the top nav?
2. **Hero focus** — does the headline land, and is the CTA unmistakably *the* primary action?
3. **Section hierarchy** — are GitHub / CLI / Blog / VS Code / Showcases all clearly distinct, or does anything fight for attention?
4. **Visual punch vs reading flow** — direction 03 leans heavily visual; 01 leans heavily editorial. Which is right for Pathogen Studio's voice?
5. **Light + dark** — both modes should feel like first-class. Compare them side by side.

## Decisions confirmed

- Atmospheric direction continues from the nav redesign — same palette, same grain, same fonts. No new brand exploration.
- Single primary-color CTA per view. All other surfaces use lavender (secondary), neutral surfaces, or text-only treatments.
- Showcase imagery is rendered as on-theme illustrative tiles in these mockups (not iframe-embedded blog renders). Production Phase 2 will swap those for real Pathogen renders or static `<img>` thumbnails extracted from the blog artifacts.

## Showcase imagery in these mockups

To keep the mockups portable and quick to render via `file://`, each showcase tile is rendered inline using CSS `conic-gradient` / `radial-gradient` / hand-drawn SVG that **evokes** the visual character of the corresponding Pathogen feature — they are not the actual blog renders. Each tile links to its real blog post so reviewers can see the full output. Production will use real renders.

## File index

```
project-docs/homepage-redesign/
├── README.md                                   ← this file
└── explorations/
    ├── 01-editorial.html
    ├── 02-magazine-asymmetric.html
    ├── 03-showcase-canvas.html
    └── 04-developer-tool.html
```

## What happens after you pick

Phase 2 plan will cover:

- Where the homepage lives (likely `/pathogen/` server-rendered for signed-out visitors via `_worker.ts`'s `getSsrUser()` check, falling through to the SPA `<landing-view>` for signed-in users).
- Real GitHub / blog / VS Code data wired from the backing sources.
- Real showcase imagery — extracted from `/website/blog-static/*.html` or rendered fresh.
- Performance budget (lazy-loading, image optimization).
- Accessibility audit on the chosen direction.
