# Showcase Page Prototypes

Standalone HTML prototypes for the showcase-pages-review effort. Open each directly in a browser — no build step.

## Round 1 (original — preserved)

The first pass. These remain on disk as reference; the v2 / variant files supersede them for the rollout discussion.

| File | Surface | Direction(s) |
|------|---------|--------------|
| `detail-plate.html` | `/u/:handle/:slug` | "Plate" + creator-credit + feature tag chips + share row + side facts panel |
| `featured-shelf.html` | `/featured` | "Editor's Shelf" — hero + Also-picked + Past-picks, with explicit curator framing |
| `explore-tags.html` | `/explore` | "Feature Tags" filter row + Creator Cards |

## Round 2 — moving forward with detail-plate-v2 only

The decision after Round 2 (2026-05-15): proceed with the detail-page redesign; the four explore/featured explorations are parked. The Round 2 files remain on disk for context and possible future revisits.

### Detail page — final

| File | Surface | Notes |
|------|---------|-------|
| **`detail-plate-v2.html`** | `/u/:handle/:slug` | **Selected for rollout.** Real top nav. Subnav row with breadcrumb on the left and the **"Open in playground" rose pill on the right**, aligned to the right edge of the hero plate. Hero plate → title/byline/deck → source disclosure → "More by @user" three-up rail. **No Fork, no Copy source, no share row, no Plate Facts, no tag chips.** |

The CTA pill is sized smaller (`0.65rem 1.25rem`) than a bottom-of-page hero CTA — it lives in the subnav, sits between the breadcrumb and the right edge of the hero, and right-edge-aligns to the plate. On narrow viewports the subnav flex-wraps so the CTA falls below the breadcrumb cleanly.

### Explore / Featured — parked

These four are kept for reference but not advanced. None were the right direction.

| File | Surface | Notes |
|------|---------|-------|
| `explore-stream.html` | `/explore` (Exploration A) | Single-column feed of larger cards with alternating image side |
| `explore-mosaic.html` | `/explore` (Exploration B) | CSS-columns masonry with tiles of mixed heights |
| `featured-stage.html` | `/featured` (Exploration A) | Single-pick spotlight + "Previously on Featured" archive grid |
| `featured-salon.html` | `/featured` (Exploration B) | 3-up showcase row with editorial notes, plus a continued spread + side archive rail |

### What's consistent across Round 2

- **Real top navigation, on every page.** Matches `playground/utils/site-header-template.ts` exactly — sticky 52px tall, transparent over the atmospheric body, three-column grid: logo lockup (`Pathogen Studio` + mono "built on Pathogen v…" sub-caption), pill-bar `.tabs-wrap` (12px radius, `bg-tertiary` fill, backdrop blur, 4px padding, hairline border), theme-toggle + avatar cluster on the right. Active tab gets `secondary-accent-subtle` background and the inset glow box-shadow.
- **Real tab labels in real order**: Workspaces · Docs · Explore · Featured · Blog · Preferences.
- **No tag chips anywhere.** Deferred per request.
- **No "Curated by", "the editors", "approved", or "Curator's column" copy.** Neutral spotlight language only.
- **"Published [date]"** replaces "approved by curator" everywhere it appeared.

## Atmospheric Layered alignment

All prototypes mirror the tokens declared in `playground/styles/theme.css`:

- **Body backplate**: warm cream `#f7f0e3` with two soft radial halos (lavender top-left `rgba(180, 130, 220, 0.18)`, peach bottom-right `rgba(255, 175, 130, 0.20)`).
- **Grain overlay**: SVG fractalNoise data URI, fixed position, multiply blend, `opacity: 0.45`.
- **Cards / panels**: white `--bg-elevated`, 14px radius, hairline borders, peach-tinted soft shadows via `--shadow-tint-rgb: 165, 110, 140`.
- **Primary CTA — rose pill (one per view)**: `linear-gradient(135deg, #e16a8f, #a83d80)` with the `--shadow-glow` halo and the shimmer-on-hover ::after.
- **Lavender as secondary/decorative**: italic display text uses the lavender gradient (`linear-gradient(120deg, #b384e0, #6d3aa6)`) clipped to text. Reserved for one word per H1 plus the wordmark "Studio".
- **Typography**: DM Serif Display (display, 400 + italic), DM Sans (body), Inconsolata (mono eyebrows/metadata in small-caps with 0.18em tracking), Baumans (wordmark).

## Empty-thumbnail fallback

When `approval.svg` and the auto-thumbnail are both missing, cards render a hash-derived rose-lavender-violet gradient swatch with a "PREVIEW PENDING" mono microcap (see `explore-mosaic.html` last tile). Looks deliberate, never broken.

## What's NOT in the prototypes

- **No interactive editor.** Detail pages route to the playground for that experience.
- **No real D1/KV data wiring.** All content is sample.
- **No JS framework.** Vanilla. The only inline JS is the filter-chip toggle in Round 1's `explore-tags.html`.
- **No dark mode.** Light theme only.
