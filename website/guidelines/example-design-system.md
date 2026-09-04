# Example Design System

A reusable visual language for Pathogen example content — code examples, schematics, and diagrams embedded in blog posts, documentation, and tutorials.

This is the third companion piece referenced at the end of [schematic-and-diagram-checklist-plus-antipatterns.md](./schematic-and-diagram-checklist-plus-antipatterns.md): *a style guide defining shapes, arrow styles, colors, annotation rules, and layout patterns.*

---

## 1. Purpose and Scope

### In scope
- Interactive `<mini-workspace>` and `<reactive-svg>` embeds in blog posts
- Annotated schematics and figures in documentation pages
- Tutorial illustrations and explainer diagrams
- Blog sample `.pathogen` files under `website/blog/samples/postN/`
- BBWP/MW artifacts rendered from the above

### Out of scope
- Brand marketing assets and hero graphics for `pedestal.design`
- Playground UI chrome — uses its own token system in [`playground/styles/theme.css`](../../playground/styles/theme.css)
- Docs site chrome and navigation
- User-generated content in the playground

---

## 2. Design Philosophy

The tokens in this guide are extracted from the `variant-b3-slim-wedges` masthead (the "Hue Garland / Lozenge Edition" illustration for the `reactive-color-svg` post). That masthead was tuned for dense editorial composition: a perceptually uniform OKLCH palette, auto-contrasting annotation chrome that flips on background lightness, thin-weight display type balanced against small-caps eyebrows, and generous whitespace around precise geometry.

We codify that language here — but split it into two tiers. The **core** tier is the durable, project-wide foundation every example should honor. The **extended** tier is a deliberate aesthetic signature for hero and show-off illustrations; day-to-day diagrams should not reach for it.

---

## 3. Core Tokens (MUST)

Every example content surface should use these.

### Background and foreground

```
--bg            default #d0d7f0      light mode (L ≈ 0.85)
fg_auto         oklch(from var(--bg) calc((0.5 - l) * 1000) 0 0)
fg_muted        fg_auto at α 0.60
fg_hair         fg_auto at α 0.22       — hairlines, chip strokes, subtle borders
fg_faint        fg_auto at α 0.10       — grid overlays, whisper-thin fills
```

The `fg_auto` expression inverts automatically at `L = 0.5`. When a consumer sets `--bg` to a dark value, every piece of chrome flips to near-white. No per-theme duplication; no `light-dark()` branching; no component-level logic. This is a hard requirement — use the expression, not hardcoded `#000` or `#fff`.

### Typography stack

```
font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
```

Always quote the family names. The stack is deliberate: Helvetica Neue first for modern render engines, Helvetica for legacy, Arial as a final Windows fallback, generic sans-serif as safety.

### Size and weight ramp

| Role                   | Size | Weight | Letter-spacing |
|------------------------|------|--------|----------------|
| Display / masthead     | 38   | 200    | −1             |
| Hub title              | 14   | 700    | 4              |
| Label (primary)        | 10   | 700    | 2              |
| Subtitle / key body    | 10   | 400    | 0              |
| Eyebrow / legend       | 8    | 700    | 3              |
| Small label            | 8    | 400    | 0.5            |
| Hub-sub / small caps   | 8    | 400    | 0.8            |
| Ring / axis label      | 8    | 400    | 1.4            |
| Micro label            | 6    | 400    | 0.8            |

Tracking (letter-spacing) is the identity anchor of this system. Eyebrows at +3, ring labels at +1.4, anchor names at +2, hub titles at +4. Do not skip tracking; tight or default-spaced labels break the visual rhythm.

### Strokes and radii

```
stroke-width: 0.5    — hairlines on chips, outer frames, ring reference
stroke-width: 1      — dashed L-threshold rings, emphasis strokes
stroke-dasharray: 3 4 — for dashed reference lines
corner-r: 5.5        — rounded annular wedges, chip corners
```

### Margins and grid

- **15px minimum** distance between any content and viewBox edge. This matches the margin-compliance check in [`scripts/validate-samples.ts`](../../scripts/validate-samples.ts) rule 1 — it will flag violations in agentic review.
- **12px inter-card gap** when laying out multi-card compositions.
- **22px band height** is the reference unit for stacked radial or linear bands (one ramp stop per band).
- **4px gap** between adjacent wedges or tightly stacked elements.

---

## 4. Extended Tokens (MAY)

These are **signature** tokens — powerful when a single hero illustration warrants the full editorial voice, inappropriate for every diagram. Ask "is this a cover image or a supporting figure?" before reaching for them.

### Six-hue OKLCH anchor wheel

```pathogen
let red    = Color(CSSVar('--anchor-1', oklch(0.55 0.16 27)));   // 27°  red
let amber  = Color(CSSVar('--anchor-2', oklch(0.55 0.16 80)));   // 80°  amber
let green  = Color(CSSVar('--anchor-3', oklch(0.55 0.16 140)));  // 140° green
let teal   = Color(CSSVar('--anchor-4', oklch(0.55 0.16 200)));  // 200° teal
let blue   = Color(CSSVar('--anchor-5', oklch(0.55 0.16 260)));  // 260° blue
let purple = Color(CSSVar('--anchor-6', oklch(0.55 0.16 320)));  // 320° purple
```

Six perceptually equidistant hues at a common `L = 0.55, C = 0.16`. The hues are spaced 53–60° apart for visual distinction. Use for categorical encoding (e.g., six channels of data, six demo variants), not for decoration.

Note: in the picker-bound variant, these become `oklch(0.55 0.16 H)` initial-values — but because `mini-workspace.ts` only detects hex initial-values (see §9), you must supply a hex form if you want a picker generated. In the hero masthead, the defaults are authored as `oklch(...)` because the point is to show the expression; pickers are supplied via the `vars=` attribute on the component.

### Nine-stop lightness ramps

```pathogen
let ramp_red = Color.palette(red, 9);   // L ≈ 0.15 → 0.95
```

`Color.palette(anchor, 9)` returns a 9-stop ramp that spans roughly L=0.15 → L=0.95. Ideal for radial ramps, matrix rows, or any stepped scale. Note: on a very light bg, the top two stops (L=0.85–0.95) nearly vanish; on a very dark bg, the bottom two (L=0.15–0.25) nearly vanish. This is *expected* ramp behavior — the ramp is demonstrating its full range. If you need every stop readable, either shift anchor L toward 0.45 before palette generation or add an `fg_hair` contour stroke.

### Dashed L-threshold reference rings

```pathogen
let ring_055 = PathLayer('ring-055') #{
  fill: none; stroke: fg_auto; stroke-width: 1; stroke-dasharray: 3 4;
};
```

Dashed reference rings at `L = 0.55` and `L = 0.75` are a visual assertion: "this is where the chroma apex sits." Use sparingly, and only when you're explicitly teaching a perceptual-space concept. In general diagrams they're noise.

### Label-pill chip pattern

For labels sitting over busy geometry:

```pathogen
let chip_bg = PathLayer('chip-bg') #{ fill: bg_color; stroke: fg_hair; stroke-width: 0.5; };
chip_bg.apply { rect(calc(x - 28), calc(y - 8), 56, 16); }

let chip_label = TextLayer('chip-label') #{
  font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  font-size: 8; letter-spacing: 1.4; fill: fg_auto; text-anchor: middle;
};
chip_label.apply { text(x, calc(y + 3))`L  0.55` }
```

A chip is a rounded rect in the `--bg` color with a thin `fg_hair` border, hosting a centered label in `fg_auto`. Because the chip fill matches the surrounding bg, it reads as a punch-through rather than a bolted-on element.

---

## 5. Grid and Margin Conventions

Stated as recommended defaults, not rigid rules. Examples that break them should have a reason.

- **Canvas width for interactive demos: 520px.** Median of typical example widths (350–570), clean fit inside the default mini-workspace render panel, avoids horizontal scroll on narrower viewports.
- **Height varies with content.** No fixed aspect ratio — composition drives height.
- **Edge margin: 15px.** Hard minimum. `validate-samples.ts` flags violations.
- **Card gap: 12px.** When composing cards/panels side-by-side or in grids.
- **Band height: 22px.** For stacked rows (ramp stops, matrix rows).
- **Inter-element gap: 4px.** For tightly stacked wedges or thin dividers.

---

## 6. Labeling and Annotation Rules

For general label-to-geometry rigor, see section 10 of [code-example-guidelines.md](./code-example-guidelines.md) — leader-line requirements, proximity rules, and anchor-point conventions apply to every example.

This system adds three composition patterns:

### Eyebrow-over-title

Pair a tracked (+3) eyebrow at `fg_muted` with a thin-weight display title at `fg_auto`:

```
CHART № 02-B  /  LOZENGE EDITION      ← eyebrow, 8px/700/+3, fg_muted
Hue Garland                           ← title, 38px/200/−1, fg_auto
Six slim 30° sectors, nine stops…     ← sub, 10px italic, fg_muted
```

Use for the top-left of any composition that needs editorial voice. Skip for simple data figures.

### Key block (top-right)

Explains symbols used in the diagram: dashed rings, hue angle degrees, anchor markers, etc. Use `KEY` as the eyebrow (8px/700/+2, `fg_muted`). Body lines in 9px/400 `fg_auto`.

### Test bench (bottom strip)

A contrast-verification strip near the bottom of a composition showing sample foreground colors against representative background fills, each paired with its WCAG target (e.g., `AA`, `AAA`). Useful as a self-documenting QA pass for theme-related illustrations. Optional; reserve for illustrations explicitly about color contrast.

---

## 7. Example Usage in Pathogen

Copy-pasteable preamble for a new example. Core tokens only:

```pathogen
// viewBox="0 0 520 320"
// Set viewBox to match your composition.

// ─── Core tokens ───────────────────────────────────────────────
let bg_color = Color(CSSVar('--bg', #d0d7f0));

let fg_auto  = 'oklch(from var(--bg, #d0d7f0) calc((0.5 - l) * 1000) 0 0)';
let fg_muted = 'oklch(from var(--bg, #d0d7f0) calc((0.5 - l) * 1000) 0 0 / 0.60)';
let fg_hair  = 'oklch(from var(--bg, #d0d7f0) calc((0.5 - l) * 1000) 0 0 / 0.22)';
let fg_faint = 'oklch(from var(--bg, #d0d7f0) calc((0.5 - l) * 1000) 0 0 / 0.10)';

// ─── Background ────────────────────────────────────────────────
let bg = PathLayer('bg') #{ fill: bg_color; stroke: none; };
bg.apply { rect(0, 0, 520, 320); }

// ─── Typography styles ─────────────────────────────────────────
let font = "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";

let eyebrow = TextLayer('eyebrow') #{
  font-family: font; font-size: 8; font-weight: 700;
  letter-spacing: 3; fill: fg_muted; text-anchor: start;
};
eyebrow.apply { text(15, 28)`EXAMPLE / 01` }

let title = TextLayer('title') #{
  font-family: font; font-size: 38; font-weight: 200;
  letter-spacing: -1; fill: fg_auto; text-anchor: start;
};
title.apply { text(15, 68)`Your Title Here` }
```

Extend with the extended-tier tokens (§4) only when the composition warrants the editorial voice.

---

## 8. What NOT to Inherit from variant-b3

Variant-b3 is a **hero masthead**. Its composition language — concentric 9-stop radial ramps, central hub with title+subtitle, perimeter anchor-name labels, dashed L-threshold rings, WCAG contrast bench — is a **deliberate signature** for that specific illustration. It is not a default layout for day-to-day figures.

In particular, do not inherit these unless your example is explicitly "the cover":

- **Concentric hub + orbiting bands.** Only for illustrations that teach radial/perceptual concepts.
- **Nine-stop palettes as a default scale.** Default to `Color.palette(anchor, 5)` or `7` unless the full range is the point.
- **Perimeter labels with hue-degree subtitles.** Only when categorical encoding matters.
- **WCAG test bench.** Only for contrast-teaching illustrations.

Day-to-day diagrams use the core tokens (§3), appropriate labeling rules (§6), and a composition that serves the idea — nothing more.

---

## 9. Hex-Literal Requirement for `CSSVar` Defaults

Hard rule for any example that embeds as a `<mini-workspace>`: every `CSSVar(name, default)` that should generate a runtime color picker must use a **hex literal** as the default.

Why: `playground/components/blog/mini-workspace.ts` auto-detects picker controls by scanning the compiled SVG's `<style>` block for `@property` declarations with the pattern:

```
/initial-value:\s*(#[\da-fA-F]{3,8})/
```

An `oklch(...)` or `rgb(...)` or named-color initial-value is silently skipped. The `@property` still exists in the SVG; the color still binds via CSS; but no picker is generated.

Do this:
```pathogen
let red = Color(CSSVar('--anchor-1', #bd423a));  // ✓ hex — picker generated
```

Not this:
```pathogen
let red = Color(CSSVar('--anchor-1', oklch(0.55 0.16 27)));  // ✗ no picker
```

Exception: if you are deliberately supplying pickers via the `<mini-workspace vars="--a:#xxx;--b:#yyy">` attribute, the `@property` initial-value can be anything (you are bypassing auto-detect). Reach for this only when you need a picker default that differs from the style-block initial value.

---

## 10. Canvas Width Recommendation

Normalize interactive demos to **520 × variable**. Heights range from 280 (compact grid) to 560 (tall matrix or wheel composition).

Why 520:
- Median of the four widths (350, 460, 500, 570) in the existing `reactive-color-svg` post.
- Clean fit inside the default `<mini-workspace>` preview panel without horizontal scroll.
- Wider than the narrowest existing example (so no information is lost in migration) and narrower than the widest (so mobile viewports don't scroll).

For static figures (docs illustrations, non-interactive schematics), deviate freely — 520 is an interactive-demo convention, not a rigid container width.

---

## Related Guidelines

- [Code Example Guidelines](./code-example-guidelines.md) — editorial rules (labeling, margins, GroupLayer structure, mini-workspace integration)
- [Schematic and Diagram Checklist](./schematic-and-diagram-checklist-plus-antipatterns.md) — review checklist and anti-patterns
- [Agentic Review Process](./agentic-review.md) — multi-persona review before publication
