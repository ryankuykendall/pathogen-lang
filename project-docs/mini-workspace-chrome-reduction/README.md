# Mini-Workspace Chrome Reduction — Design Explorations

Five design explorations (plus a faithful baseline) that reduce the chrome of the `<mini-workspace>` component and elevate the polish of the embed. Driven by a Senior Staff UX Designer's feedback that the component covers its own title and occupies too much vertical real estate in blog posts.

See [`feedback.md`](feedback.md) for the verbatim review and [`chrome-inventory.md`](chrome-inventory.md) for the pixel audit of the current chrome. (The two screenshots the reviewer supplied remain in the chat thread that initiated this work — see `feedback.md` for details. Saving them locally requires a manual drop into `assets/`.)

---

## How to View

From this folder, run the bundled 20-line Node server and open the explorations index:

```bash
node project-docs/mini-workspace-chrome-reduction/_serve.js
# then open http://localhost:4300/explorations/
```

`_serve.js` is a tiny static file server (no dependencies) that serves this directory with the right MIME types for HTML, JS, and SVG. Use it rather than `file://` — the shared `sample/chart-svg.js` loads cleanly, and relative paths resolve as expected. Kill with `Ctrl-C` when done.

Python works too if you prefer: `python3 -m http.server 4300 --directory project-docs/mini-workspace-chrome-reduction` → same URL.

Each prototype includes:
- A **mode toggle** (top-right of the page) to switch the component between `embedded` and `fullscreen`.
- A **Show rulers** toggle (bottom-right of the page) to annotate chrome bands with measurements.
- Live color pickers wired to the real SVG via CSS variables.

---

## The Six Files

| # | File | Strategy | Chrome | Vibe |
|---|---|---|---:|---|
| 00 | [`explorations/00-baseline-current.html`](explorations/00-baseline-current.html) | Faithful recreation of the current component | 176px | Reference point |
| 01 | [`explorations/01-editorial-minimal.html`](explorations/01-editorial-minimal.html) | Single editorial header; caption becomes subtitle; color rail lives inside code panel only | ~68px (61% ↓) | Fraunces serif, bone + moss; restrained editorial |
| 02 | [`explorations/02-devtools-inline.html`](explorations/02-devtools-inline.html) | Color swatches move inline next to hex literals, DevTools-style | ~32px (82% ↓) | IBM Plex stack, teal; dev-tool precision |
| 03 | [`explorations/03-ambient-chrome.html`](explorations/03-ambient-chrome.html) | 28px anchor with title + `⋯`; glass-blur bar slides down on hover/focus/⋯ tap | ~28px rest / 72px active (84% ↓) | Near-black, glass blur, citrus accent |
| 04 | [`explorations/04-split-ribbon.html`](explorations/04-split-ribbon.html) | No global chrome; each panel owns a 28px micro-ribbon; vertical PATHOGEN wordmark | ~28px per panel (68% ↓) | Space Mono + Manrope, paper + iron + orange accent |
| 05 | [`explorations/05-refined-monochrome.html`](explorations/05-refined-monochrome.html) | Title-led 56px header; colors collapse into a dropdown; small-caps watermark | ~56px (68% ↓) | Playfair Display serif, cream + graphite + oxblood |

---

## Shared Decisions Across All Five Explorations

1. **Minimap is mode-conditional.** Suppressed entirely in embedded mode; present as an overlay in fullscreen. This is a confirmed decision, not a per-design variable.
2. **The title is never obstructed.** Every exploration surfaces the title as a first-class chrome element. The minimap, which previously covered the title, has no claim on the preview's top-left corner in embedded mode.
3. **All ten features are preserved.** Code toggle, copy, playground link, fullscreen toggle, caption, PATHOGEN brand, three per-variable color pickers, reset, zoom controls. See [`chrome-inventory.md`](chrome-inventory.md) for the audit.
4. **Zoom controls auto-hide** in every exploration — they fade to ~35–45% opacity when idle and come back to 100% on preview hover. They earn space only when the user looks for them.
5. **Distinct typography per exploration.** No two files share a font family, so the user evaluates aesthetic choices independently from chrome-reduction strategies.

---

## Chrome Reduction Matrix (layout-consuming bands, embedded mode)

| Band | 00 baseline | 01 Editorial | 02 DevTools | 03 Ambient | 04 Split | 05 Refined |
|---|---:|---:|---:|---:|---:|---:|
| Top toolbar | 56 | — | 32 | 28 | 0 | 56 |
| Color swatch row | 48 | — | inline | — | in code ribbon | dropdown |
| SOURCE header | 32 | — | — | — | — (ribbon) | — |
| Unified header | — | 68 | — | — | — | (combined above) |
| Preview ribbon | 0 | 0 | 0 | 0 | 28 | 0 |
| Footer | 40 | 0 | 0 | 0 | 0 | 0 |
| Code panel ribbon | 0 | 24 (code col only) | 0 | 0 | 28 | 0 |
| **Total** | **176** | **~68** | **~32** | **~28** | **~28/panel** | **~56** |
| **Reduction** | — | 61% | 82% | 84% | 68% | 68% |

All explorations hit the ≥50% reduction target.

---

## Content Consistency (identical across all files)

- **Title:** `radialProject + VerticalAnchor.Midline — one TextLayer, no branching`
- **Caption:** `radialProject with VerticalAnchor.Midline — one TextLayer, automatic rotation and hemisphere flip`
- **Source:** 17 lines of Pathogen from `website/blog/samples/post16/radial-labels.pathogen`
- **Preview SVG:** `website/blog/samples/post16/radial-labels.svg` (loaded via `sample/chart-svg.js`)
- **CSS vars:** `--bg-color` (`#f6efe6`), `--bar-all` (`#cc3333`), `--bar-top` (`#1a1a2e`)

Shared assets live in `sample/`:
- `source.pathogen` — original source
- `radial-chart.svg` — compiled SVG
- `chart-svg.js` — script that exposes the above as `window.CHART_SVG`, `window.CHART_SOURCE_LINES`, `window.CHART_TITLE`, `window.CHART_CAPTION`, `window.CHART_DEFAULTS`

---

## Review Checklist

For each exploration, verify:

- [ ] Title is clearly visible in both modes (not obscured by overlays)
- [ ] Minimap is absent in embedded mode, present in fullscreen
- [ ] All ten features are reachable (use the keyboard or hover to discover where each lives)
- [ ] Chrome reduction matches the matrix above (click *Show rulers*)
- [ ] Color pickers update the chart live; Reset returns defaults
- [ ] Esc exits fullscreen
- [ ] Typography reads cleanly at the default page zoom

---

## Open Questions for Discussion

1. **Does the chrome reduction go far enough in E01 and E05?** They preserve a more traditional top-band structure but still cut 60–70%. If the goal is maximum reduction, E02/E03 win.
2. **Is DevTools-inline color editing discoverable?** E02 relies on the user recognizing chips next to hex literals. A one-time onboarding hint could help, but hurts long-term polish.
3. **Is ambient-only chrome acceptable for E03 on touch?** The `⋯` trigger is the always-visible fallback, but touch users have a higher cost to reveal the glass bar.
4. **Should the caption be visible by default?** E01, E04, E05 show it; E02 hides until title-hover; E03 tucks it in an info popover. Different opinions on whether the caption earns persistent real estate.
5. **Vertical wordmark in E04** — love it or delete it? Editorial flourish vs. quirky.

Discuss, pick a direction (or a hybrid), and we'll plan the production refactor of `playground/components/blog/mini-workspace.ts` + `mini-preview.ts` separately.
