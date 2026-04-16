# Example Design System — Synopsis

## Problem

Code examples, schematics, and diagrams across blog posts, docs, and tutorials are authored ad hoc. Each example re-invents its typography, palette, margin, labeling, and stroke conventions. The result is visually inconsistent and, when pushed toward Pathogen's reactive-color strengths, fails to showcase the language's idioms.

The `reactive-color-svg` blog post is the sharpest example of the drift: 4 hand-authored inline `<reactive-svg>` examples, each styled differently, none using Pathogen source, none forkable into the playground.

## Goal

Establish a shared visual language for Pathogen example content — colors, typography, spacing, labeling — drawn from the `variant-b3-slim-wedges` masthead (Hue Garland / Lozenge Edition). Then use that language to restyle the `reactive-color-svg` post's 4 examples into 12 alternatives (3 per example), author them in Pathogen, and migrate the post to the `<mini-workspace>` component.

## Four phases

**A — Light-mode masthead.** `--bg` default `#0b0e1a` → `#d0d7f0`. Exercises the `fg_auto` auto-contrast expression; proves the entire chrome flips correctly on bg-lightness crossover. Five literal swaps in the source file; recompile SVG; generate a new timestamped BBWP+MW pair under the `color-system` roadmap prefix. Dark-bg reference artifact preserved.

**B — Design system documentation.** New canonical doc at `website/guidelines/example-design-system.md`. Core-vs-extended tier split. Core tokens MUST apply to every example (bg, fg_auto, Helvetica stack, size/weight/tracking ramp, 15px margin, hairline stroke, 5.5 chip radius). Extended tokens MAY apply when a hero/show-off illustration warrants them (6-hue OKLCH anchor wheel, 9-stop Color.palette ramps, dashed L-threshold rings, label-pill chip). Cross-linked from `code-example-guidelines.md`, `schematic-and-diagram-checklist-plus-antipatterns.md` (replaces the "third companion piece" invitation), and `website/CLAUDE.md`.

**C — 12 restyled alternatives.** 4 examples × 3 directions each, all in `website/blog/samples/post24/` alongside existing masthead variants. Canvas normalized to 520px wide. Authoring workflow per example: `frontend-design` skill produces HTML/CSS mocks for visual direction → hand-translate into Pathogen → compile samples + BBWP → validate-samples pass → user reviews 3 BBWPs and picks a winner. 4 review checkpoints total.

**D — Gated migration.** Only after per-example winners are selected. Replace 4 `<reactive-svg>` blocks in `pathogen-color-system.md` with `<mini-workspace src="samples/post24/<winner>.pathogen">` tags. Copyedit prose that referenced old layouts. Build, preview, link-check.

## Preservation

Iteration artifacts accumulate in this folder (`project-docs/example-design-system/`):
- `SYNOPSIS.md` (this file)
- `phase-a-bg-change-rationale.md`
- `phase-b-doc-draft-v*.md` — new file per iteration
- `phase-c-mockups/` — skill output per direction (12 mocks)
- `phase-c-decisions.md` — winner selection rationale
- `phase-d-migration-notes.md` — only if D runs

Losing alternatives stay in `samples/post24/` as the paper trail; losing BBWPs stay timestamped in `website/bbwp/`.

## Scope boundaries

This design system governs **embedded Pathogen example content** (blog samples, docs illustrations, schematics). It does NOT govern:
- Brand marketing assets
- Playground UI chrome (`playground/styles/theme.css` is its own system)
- Docs site chrome (`docs-static/`)

These are separate surfaces with their own conventions.
