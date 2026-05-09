# Top Navigation Redesign — Phase 1 Explorations

**Status:** awaiting user pick
**Plan:** `~/.claude/plans/image-7-image-8-imperative-eagle.md`
**Date:** 2026-05-07

## What this folder is

Phase 1 of the top navigation redesign. Five HTML mockups, each committing to a distinct aesthetic direction, in **light + dark** mode, and in **landing-view + workspace-view** contexts. No playground code has been touched yet; nothing in `playground/` or `website/` is changed by these files.

Pick the direction that feels right and Phase 2 (the actual code refactor) will be drafted to match it.

## Why we're doing this

The current top nav (`playground/components/app-header.ts`) has accent-color collision: `--accent-color` is currently applied simultaneously to the active tab pill, the "+ New Workspace" CTA, the Grid toggle, and (when focused) the kebab. There is no single visual focal point per view.

The redesign delivers seven outcomes:

1. A clear hierarchy: exactly **one** primary-color call-to-action visible per view; secondary color for tab styling and other accent affordances.
2. The **overflow menu relocated** from the top nav to the secondary nav (workspace breadcrumb bar).
3. The **Export button moved** into the overflow menu.
4. A new overflow item — **Publish / Unpublish workspace** — visible only when the user is signed in.
5. Overflow icons replaced with **Material Design icons** (Material Symbols Outlined).
6. The in-app brand renamed from **"Pathogen"** to **"Pathogen Studio"**.
7. A meaningfully refreshed visual direction — the part this folder explores.

## The 5 directions

The wordmark **"Pathogen Studio"** is set in **[Baumans](https://fonts.google.com/specimen/Baumans)** across all five — single line, never wrapping. "Studio" picks up the secondary accent in each direction (or a secondary-accent gradient in 05). The mono is **[Inconsolata](https://fonts.google.com/specimen/Inconsolata)** everywhere — that matches the playground's existing `--font-mono`. The differentiation between directions lives in the body/display font, the surface treatment, the color palette, and the active-tab style.

| # | Direction | Body / display | Active-tab treatment | Mood |
|---|---|---|---|---|
| 01 | [Editorial / refined](explorations/01-editorial.html) | Bricolage Grotesque body, Fraunces serif accents | Hairline underline in `--secondary-accent` | Calm, literary, disciplined |
| 02 | [Brutalist mono](explorations/02-brutalist.html) | Inconsolata body, Major Mono Display page-header | Filled hazard-orange block | Hard, declarative, software-as-document |
| 03 | [Soft / modern SaaS](explorations/03-soft-saas.html) | Manrope body, Bricolage Grotesque page-title | Rounded pill in low-alpha sage | Friendly, generous, modern-product |
| 04 | [Minimal underline](explorations/04-minimal-underline.html) | Geist for everything non-mono | 2px terracotta underline | Restrained, tool-like, near-zero chrome |
| 05 | [Atmospheric / layered](explorations/05-atmospheric.html) | DM Sans body, DM Serif Display accents | Glassy pill with inner-glow halo | Luminous, depth, delight-without-toy |

Each file is self-contained: open it directly in a browser. Fonts load from Google Fonts; Material Symbols icon paths are inlined.

**Layout:** light and dark variants are stacked (light on top, dark below) at near-full laptop width so each panel renders at the proportions you'll actually see in the deployed app. Vertical chrome density was dropped ~20% from the first pass — the workspace breadcrumb bar in particular is now ~44px tall to reclaim space for the editor and preview pane.

## The per-view CTA contract (every direction enforces this)

| View | Primary-color element | Secondary-color elements |
|---|---|---|
| **Landing** | "+ New Workspace" only | Active tab, List/Grid toggle |
| **Workspace** | (none — Export now lives in overflow) | Active tab, Annotated/Console toggles, Copy Code |
| **Docs / Explore / Featured / Blog / Preferences** | (none) | Active tab |

When inspecting the mockups, count primary-color (warm/saturated CTA) elements per panel — landing should show exactly one; workspace should show zero. **The count covers the resting nav surfaces only:** items inside an open overflow menu (a transient detached panel) and any styling on the open kebab itself are exempt — they're a temporary state, not part of the resting hierarchy.

## Decisions already locked (don't re-explore in Phase 2)

- **Icon delivery**: local SVG files in `playground/assets/icons/material/` (no Google Fonts CDN runtime dependency). Each Phase 1 exploration inlines the same SVG paths it would use in Phase 2.
- **Rename scope**: logo + page title only. The `built on pathogen-lang v1.0` subtitle is preserved verbatim across all directions.
- **Exploration count**: 5 — full slate.

## Overflow menu contents (consistent across all 5)

The overflow menu lives in the **secondary nav** (workspace breadcrumb bar), not the top nav. Items, in order:

1. **Export** (relocated from top-nav button)
2. Format Document
3. Copy URL
4. Copy Workspace
5. Copy SVG
6. Copy Debug Info
7. Export with Legend
8. Set Thumbnail
9. **Publish workspace** (new — gated on `currentUser !== null`; toggles to "Unpublish workspace" when published)

Phase 2 will wire this into `playground/components/app-breadcrumb.ts` and reuse `workspaceApi.update(id, { isPublic })` from `landing-view.ts:208`.

## How to pick

Open the 5 HTML files (or just compare two at a time) and consider:

1. **Does the primary CTA stand alone?** In landing view, the "+ New Workspace" pill should be the visual anchor; the rest should recede.
2. **Does the active-tab treatment feel intentional?** In workspace view there is no primary CTA, so the secondary-accent active-tab needs to read clearly without competing with content.
3. **Does the brand voice feel right?** "Pathogen Studio" is being introduced as the in-app name — the wordmark should suggest the kind of tool you want this to be.
4. **Does the overflow menu feel like it belongs in the secondary nav?** This is a structural change; pay attention to how the kebab and menu sit relative to the breadcrumb.
5. **Light + dark parity** — both should feel like first-class citizens, not afterthoughts.

Once you've picked a direction, leave a comment in this file (or just tell Claude) and Phase 2 will be drafted against the chosen exploration.

## File index

```
project-docs/top-nav-redesign/
├── README.md                      ← this file
└── explorations/
    ├── _icons.html                ← shared Material Symbols defs (reference only)
    ├── 01-editorial.html
    ├── 02-brutalist.html
    ├── 03-soft-saas.html
    ├── 04-minimal-underline.html
    └── 05-atmospheric.html
```

## Provenance

Material Symbols Outlined SVG paths sourced from [@material-symbols/svg-400](https://github.com/marella/material-symbols) (Apache 2.0, Google).
