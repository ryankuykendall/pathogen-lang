# Phase 2 — Top Navigation Implementation Plan

**Direction:** Atmospheric (exploration 05)
**Status:** awaiting implementation approval
**Date:** 2026-05-07

## Context

Phase 1 produced 5 design directions. The user picked **Atmospheric / layered**:

- Soft luminous gradient backplates behind the nav
- Active tabs glow with an inner-shadow halo in lavender (`--secondary-accent`)
- Single primary CTA shimmers on hover with a swept highlight
- "Pathogen Studio" wordmark in **Baumans**, "Studio" picks up a lavender gradient
- Mono is **Inconsolata** throughout
- Vertical density ~20% tighter than the original screenshots

Phase 2 ports this into the live playground.

## Decisions confirmed in this round

1. **Palette scope** — full swap. Peach/pink primary (`#c0518e` → `#f7b56e` dark) and lavender secondary (`#9461c4` → `#c4a4e8` dark) replace the current emerald-green primary (`#10b981` → `#ccbf6b`) and amber-rose secondary (`#f59e0b` → `#c9736e`) across the whole playground. We add new gradient endpoint tokens (`--accent-from`/`--accent-to`, `--secondary-from`/`--secondary-to`).
2. **Publish UX** — silent toggle plus toast. Click in the overflow menu calls `workspaceApi.update(id, { isPublic: !current })` immediately and surfaces "Workspace published" / "Workspace unpublished". No confirmation dialog. Mirrors the existing toggle in `landing-view.ts:208`.
3. **Icon delivery** — shared `<symbol>` sprite injected once at app boot. Same pattern as the exploration HTML files.
4. **Layout system** — **CSS Grid throughout** for both the top nav and the secondary nav. No flexbox at the structural level. Grid lets us pin every zone to a deterministic column track so the tab row and right-side cluster cannot shift horizontally when the user navigates between pages. (See Layout strategy section below.)
5. **Anti-shift verification** — a Puppeteer script captures `getBoundingClientRect()` for every top-nav element across all 6 top-level routes and fails if any element drifts more than 0.5px between routes. (See Step 7 below.)

## Layout strategy — CSS Grid throughout

The "tabs and buttons shift left/right between page navigations" annoyance is caused by flexbox's content-driven sizing: when one zone's content widens or narrows, neighboring zones compress or expand to absorb the change. The visual result is the tab row drifting a few pixels every time you click between Workspaces / Docs / Explore. Grid lets us pin zones to fixed track widths so that what happens inside a zone cannot affect its neighbors' positions.

**Top nav** (`<app-header>` host element):

```css
:host {
  display: grid;
  grid-template-columns:
    minmax(280px, 1fr)   /* left zone — logo (anchored start) */
    auto                 /* center zone — tabs (anchored center) */
    minmax(280px, 1fr);  /* right zone — theme + account (anchored end) */
  align-items: center;
}
```

Why this works: the two side zones share the same `minmax(280px, 1fr)` track, so they're guaranteed equal width regardless of their content. The center zone (`auto`) is therefore always perfectly centered between them. The logo can grow from "Pathogen" to "Pathogen Studio" without nudging the tabs — the tab row stays put because the left zone's track width is determined by `1fr` math, not the logo's content width.

**Tabs row** (center zone):

```css
.tabs-wrap {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: auto;  /* each tab sized by its content */
  gap: 2px;
  justify-self: center;     /* stays centered in its zone */
}
```

Each tab is its own grid column. Active state styling (background, inner glow) is purely visual — no padding/border/box-sizing changes — so a tab's grid track width never changes between active and inactive. This is the second axis of stability.

**Right cluster** (right zone):

```css
.cluster {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: auto;
  gap: 8px;
  align-items: center;
  justify-self: end;
}
```

Theme toggle and account menu sit in their own grid columns. The account menu's text content (e.g., "Ryan K" vs "Sign in") can vary; it grows the right zone's content but the right zone's track width is `1fr` so the cluster simply slides within the zone — it doesn't push the tab row.

**Secondary nav** (`<app-breadcrumb>` host):

```css
:host {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
}
```

Left zone (`1fr`) holds the page title or breadcrumb — variable content width is allowed here because the right cluster is anchored to its own column.

Right zone (`auto`) holds the right-side controls (segmented toggle + Copy Code + kebab in workspace view; segmented toggle + CTA in landing view). Inner cluster:

```css
.subbar-right {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: auto;
  gap: 8px;
  align-items: center;
}
```

Note: the secondary nav's left zone *will* change between landing and workspace views (page title vs breadcrumb) — that's a deliberate, expected difference and is not the bug we're solving. The bug is shift on navigation *within* the top nav (where logo/tabs/cluster should be identical across all 6 top-level routes). The Puppeteer test in Step 7 enforces stability there specifically.

**Strict rules for Phase 2 components:**

- No `flex` at the structural level of `app-header.css` or `app-breadcrumb.css`. Use Grid for every container that holds two or more children.
- No `flex: 1`, `flex-grow`, `flex-shrink` anywhere in the top-nav stack.
- Inner content of a single button (icon + text) may use `display: inline-flex` since that's a presentational concern within a single grid cell — never load-bearing for sibling positions.
- The atmospheric tabs-wrap that floated in the explorations is now a Grid, not a Flex.

## Files to modify

| File | Change |
|---|---|
| `playground/styles/theme.css` | Replace primary/secondary palette values; add gradient endpoint tokens, glow halo token, surface gradient endpoint tokens. |
| `playground/index.html:6` | `<title>` rename Pathogen → Pathogen Studio. |
| `playground/components/app-header.ts` | Brand rename in lockup (line 218 area), apply Baumans wordmark with `<em>Studio</em>`. Remove overflow menu (lines 252–324). Remove Export button (line 251). Update icon usage (theme-toggle, account-menu chevron) to Material `<use>`. |
| `playground/components/app-header.css` | Atmospheric styling: gradient backplate, grain noise overlay, glassy `tabs-wrap` with backdrop-filter, active-tab inner-glow halo, gradient-shimmer CTA. Tighten vertical padding (topbar 18px → 12px). |
| `playground/components/app-breadcrumb.ts` | Add overflow-menu host with 9 items (Export, Format Document, Copy URL/Workspace/SVG/Debug, Export with Legend, Set Thumbnail, Publish workspace). Subscribe to `currentUser` + `workspaceIsPublic`. Outside-click closes menu. |
| `playground/components/app-breadcrumb.css` | Atmospheric styling consistent with topbar. Tighten min-height 56px → 44px. |
| `playground/assets/icons/material-icons.svg` | New file. The 19 `<symbol>` defs from `_icons.html`, copied verbatim. |
| `playground/components/shared/icon-sprite.ts` | New module. Fetches the sprite SVG once at boot, injects into `<body>` so `<use href="#mi-...">` resolves everywhere. |
| `memory/project_brand_naming.md` | Update — both in-app and emails now use "Pathogen Studio" as of 2026-05-07. |

## Implementation order

Done one step at a time so each change is reviewable in isolation:

### Step 1 — Theme tokens (theme.css)
Smallest, most isolated change. Easy to revert if the palette swap looks wrong on existing UI.

```css
:root, [data-theme='light'] {
  /* Surface gradients — atmospheric */
  --bg-primary-from: #fdf6ed;  --bg-primary-to: #f6e9da;
  --bg-secondary-from: #fffaf2; --bg-secondary-to: #fbecd9;
  --bg-primary: #f7f0e3;       /* solid fallback */
  --bg-secondary: #fdf6ed;
  --bg-tertiary: rgba(28, 23, 34, 0.05);
  --bg-elevated: #ffffff;

  --text-primary: #1c1722;
  --text-secondary: #5a4f6a;
  --text-tertiary: #9087a0;

  --border-color: rgba(28, 23, 34, 0.10);
  --border-subtle: rgba(28, 23, 34, 0.06);
  --border-strong: rgba(28, 23, 34, 0.18);

  /* Primary — used ONCE per view */
  --accent-color: #c0518e;
  --accent-from: #e16a8f;  --accent-to: #a83d80;
  --accent-text: #fffaf2;
  --accent-hover: #b04680;

  /* Secondary — active tabs, wordmark, decorative */
  --secondary-accent: #9461c4;
  --secondary-accent-soft: rgba(148, 97, 196, 0.16);
  --secondary-accent-text: #5e3590;
  --secondary-from: #b384e0; --secondary-to: #6d3aa6;

  --shadow-glow: 0 8px 28px rgba(192, 81, 142, 0.30), 0 0 0 1px rgba(192, 81, 142, 0.18);
}

[data-theme='dark'] {
  --bg-primary-from: #1a1424; --bg-primary-to: #110d18;
  --bg-secondary-from: #15101e; --bg-secondary-to: #0c0913;
  --bg-primary: #14101c;
  --bg-secondary: #100c17;
  --bg-tertiary: rgba(255, 250, 242, 0.05);
  --bg-elevated: #1a1424;

  --text-primary: #f6e9da;
  --text-secondary: #b5a8c4;
  --text-tertiary: #7a6f8a;

  --border-color: rgba(246, 233, 218, 0.10);
  --border-subtle: rgba(246, 233, 218, 0.05);
  --border-strong: rgba(246, 233, 218, 0.20);

  --accent-color: #f7b56e;
  --accent-from: #ffd194; --accent-to: #e89254;
  --accent-text: #1a1424;
  --accent-hover: #ffc585;

  --secondary-accent: #c4a4e8;
  --secondary-accent-soft: rgba(196, 164, 232, 0.16);
  --secondary-accent-text: #d4bcef;
  --secondary-from: #d8c4f0; --secondary-to: #9c7cd5;

  --shadow-glow: 0 8px 28px rgba(247, 181, 110, 0.32), 0 0 0 1px rgba(247, 181, 110, 0.30);
}
```

After this step alone, existing UI still works but the green/yellow palette flips to peach/lavender. Do a manual visual sweep before continuing — landing-view's "Make Public" badge, workspace cards, primary CTAs, status pills, anything that uses `--accent-color`.

### Step 2 — Icon sprite system

Two new files:

**`playground/assets/icons/material-icons.svg`** — copy the `<defs>` from `project-docs/top-nav-redesign/explorations/_icons.html`.

**`playground/components/shared/icon-sprite.ts`** — fetches once at app boot, injects into `<body>`:

```typescript
let injected = false;
export async function injectIconSprite(): Promise<void> {
  if (injected) return;
  injected = true;
  const res = await fetch('/assets/icons/material-icons.svg');
  const svgText = await res.text();
  const container = document.createElement('div');
  container.style.display = 'none';
  container.innerHTML = svgText;
  document.body.prepend(container);
}
```

Call once from the playground bootstrap (likely `playground/index.ts` or wherever the root component is initialized). The fetch is idempotent and cheap.

### Step 3 — Brand rename

- `playground/index.html:6` — change `<title>Pathogen — Pedestal Design</title>` to `<title>Pathogen Studio — Pedestal Design</title>`.
- `playground/components/app-header.ts:218` — change the logo span. Currently:
  ```ts
  <span class="logo-main">Pathogen</span>
  ```
  becomes:
  ```ts
  <span class="logo-main">Pathogen <em>Studio</em></span>
  ```
- Wire Baumans to `.logo-main` font-family in app-header.css (load via `<link>` in `playground/index.html` `<head>`, alongside Inconsolata which is already loaded).

### Step 4 — Top-nav refactor (app-header)

Apply the atmospheric styling. **Use CSS Grid for every container in this component** (see Layout strategy section). The component template should:

- Host element grid: `minmax(280px, 1fr) auto minmax(280px, 1fr)` — three columns, side zones symmetric, tabs anchored center.
- Lockup: Baumans wordmark, "Studio" with `--secondary-from`→`--secondary-to` gradient, `white-space: nowrap`. Logo lives in the left zone with `justify-self: start`.
- Tab row: `.tabs-wrap` is `display: grid; grid-auto-flow: column;` with backdrop-blur and low-alpha `--bg-tertiary` backdrop. `justify-self: center`. Active tab fills with `--secondary-accent-soft` + inner-glow shadow. Active state must not change tab box-sizing — only background and box-shadow.
- Right cluster: `display: grid; grid-auto-flow: column;` holds **theme toggle + account-menu only**. **Remove** the Export button and the entire kebab-menu block (lines 251–324). `justify-self: end`.
- Theme toggle uses `<svg><use href="#mi-light-mode"/></svg>` and `<use href="#mi-dark-mode"/>` based on the current theme.
- Account-menu chevron uses `<use href="#mi-arrow-down"/>`.
- Apply gradient backplate via the host element: `background: linear-gradient(180deg, var(--bg-secondary-from) 0%, transparent 100%);`
- Apply grain noise via `::before` pseudo-element with the inline SVG turbulence data-URI from the exploration.
- **Audit:** every existing `display: flex` in `app-header.css` becomes `display: grid` with explicit `grid-template-columns` or `grid-auto-flow: column`. No `flex: 1`, `flex-grow`, or `flex-shrink` survives.

The `export-file` event is no longer dispatched from the top nav — it moves to the overflow menu in step 5.

### Step 5 — Secondary-nav extension (app-breadcrumb)

**Use CSS Grid for every container in this component** (see Layout strategy). Host element: `grid-template-columns: 1fr auto;` — left zone for breadcrumb/title, right zone for controls. Inner clusters use `display: grid; grid-auto-flow: column;`.

Add the overflow menu to the right side of the workspace-view subbar (only when `view === 'workspace'`).

Subscribe to the existing keys plus two new ones:
```ts
['route', 'view', 'workspaces', 'workspaceName', 'workspaceId', 'workspaceIsPublic', 'currentUser']
```

Render the kebab + menu host. Menu items:

```
[Export]              dispatches 'export-file'        (was top-nav button)
[Format Document]     dispatches 'format-document'    (was kebab)
─────
[Copy URL]            dispatches 'copy-url'           (was kebab)
[Copy Workspace]      dispatches 'copy-workspace'     (was kebab)
[Copy SVG]            dispatches 'copy-svg'           (was kebab)
[Copy Debug Info]     dispatches 'copy-debug-info'    (was kebab)
─────
[Export with Legend]  dispatches 'export-legend'      (was kebab)
[Set Thumbnail]       dispatches 'set-thumbnail'      (was kebab)
─────
[Publish workspace]   inline handler (see below)      ← new, gated on currentUser
```

The publish handler:

```ts
async function handlePublishToggle() {
  const id = store.get('workspaceId');
  const currentlyPublic = store.get('workspaceIsPublic');
  if (!id) return;
  try {
    await workspaceApi.update(id, { isPublic: !currentlyPublic });
    store.set({ workspaceIsPublic: !currentlyPublic });
    toast.success(currentlyPublic ? 'Workspace unpublished' : 'Workspace published');
  } catch (err) {
    toast.error('Failed to update workspace visibility');
  }
}
```

The Publish item is only rendered when `store.get('currentUser') !== null`. Item label switches to "Unpublish workspace" when `workspaceIsPublic === true`, and the icon switches from `mi-public` to `mi-lock`.

Outside-click handler to close the menu, plus Escape-key handler. Active kebab gets `--secondary-accent-soft` background to indicate menu is open.

### Step 6 — Glue + memory update

- All existing event listeners in `workspace-view.ts` keep working — events bubble through DOM. Listener attachments don't move.
- Update `memory/project_brand_naming.md` to reflect that in-app and emails both use "Pathogen Studio" as of 2026-05-07.

### Step 7 — Anti-shift Puppeteer verification

Add `scripts/verify-nav-stability.ts` (TypeScript, executed via `tsx`). New devDependency: `puppeteer`. The script:

1. Expects the dev server to be running at `http://localhost:3000`. If not, prints "Run `npm run dev:website` in another terminal" and exits 2. (Optionally: spawn the dev server itself, wait for ready, tear down at end. Simpler version first.)
2. Launches Puppeteer (headless Chrome), creates a viewport at 1440 × 900 (typical laptop width).
3. Visits each top-nav route in sequence, in this order:
   - `/pathogen` (Workspaces, landing)
   - `/pathogen/docs` (Docs)
   - `/pathogen/explore` (Explore)
   - `/pathogen/featured` (Featured)
   - `/pathogen/blog` (Blog)
   - `/pathogen/preferences` (Preferences)
4. For each route:
   - `await page.goto(...)` then `await page.waitForFunction(() => document.fonts.ready)` so font loading doesn't perturb measurements.
   - `await page.waitForSelector('app-header')` to confirm the component is in the DOM.
   - `await page.evaluate()` runs in-page code that calls `getBoundingClientRect()` for these selectors and returns `{ left, right, top, bottom, width, height }` for each:
     - `app-header` (host)
     - `app-header .logo` (whole logo block)
     - `app-header .logo-main` (the wordmark itself)
     - `app-header .tabs-wrap` (whole tab row)
     - `app-header .tab` (each tab; expect 6 — query as a NodeList)
     - `app-header .icon-btn[data-role="theme-toggle"]` (theme toggle)
     - `app-header .avatar-pill` (account menu)
   - Stash results keyed by route name.
5. After visiting all 6 routes, **compare**: for each measured element, take its `left`, `right`, and `top` values across the 6 routes and compute max-min delta.
6. **Pass criterion:** every element's `left`, `right`, and `top` deltas are ≤ 0.5px (sub-pixel rounding tolerance).
7. **Output:** a table to stdout. For each element, columns are: selector | min-left | max-left | Δleft | min-top | max-top | Δtop. Rows where Δleft or Δtop > 0.5px are flagged with a ⚠ marker.
8. Exit code 0 if all deltas are within tolerance; exit code 1 (with the offending rows printed) otherwise.

**Account-menu caveat:** the account menu's text content depends on whether the user is signed in. The script signs in deterministically before measurement (sets `localStorage.setItem('pathogen:authedUserId', 'test-user-id')` and reloads), so the account menu has identical content across all 6 routes during the test. If the test user has no name set, the pill renders as "anonymous" or similar — that's fine as long as it's identical across routes.

Run during Phase 2 verification:

```bash
npm run dev:website   # in one terminal
tsx scripts/verify-nav-stability.ts   # in another
```

If the script fails, the offending element name and its position deltas are printed. Diagnose by inspecting the failing route's DOM in DevTools and looking for `auto`-sized columns or active-state CSS that changes box dimensions.

**Future:** add `npm run verify:nav` to `package.json` and consider adding it as a CI gate. Out of scope for this phase.

## Verification (run before declaring done)

1. **Build** — `npm run build` (no TypeScript errors), `npm run test:run` (no test regressions).
2. **Dev server** — `npm run dev:website` → http://localhost:3000.
3. **Per-view CTA contract** — manually count primary-color (peach/pink) elements in each view:
   - Landing view: exactly 1 ("+ New Workspace" button)
   - Workspace view: 0
   - Docs / Explore / Featured / Blog / Preferences: 0
4. **Light + dark visual fidelity** — toggle theme, compare against `explorations/05-atmospheric.html` for both contexts. The wordmark "Studio" gradient, active-tab inner glow, and CTA shimmer should match.
5. **Sign-in path** — log in (or set localStorage `pathogen:authedUserId`). Open a workspace. Click kebab. Verify "Publish workspace" appears. Click it. Verify toast appears, badge in landing list updates, `/pathogen/explore` shows the workspace.
6. **Sign-out path** — clear `pathogen:authedUserId`. Reload. Open a workspace. Click kebab. Verify "Publish workspace" is hidden.
7. **Vertical density check** — workspace breadcrumb bar should measure ~44px tall in DevTools. Editor + preview pane should have visibly more room than before.
8. **Icon sprite** — open DevTools, confirm `material-icons.svg` is loaded once and `<defs>` is injected at the top of `<body>`. Confirm every `<use>` reference resolves.
9. **Existing UI sweep** — visit landing, docs, explore, featured, blog, preferences, plus the workspace creation flow. Anything that was emerald-green is now peach. Anything amber is now lavender. No broken contrasts (read all text against its background).
10. **Anti-shift Puppeteer test** — run `tsx scripts/verify-nav-stability.ts` against the dev server. Must exit 0. Any element with Δleft or Δtop > 0.5px between routes is a failure. Re-run after any subsequent CSS edit to the top nav.
11. **Manual click-through** — open DevTools, position cursor over a tab, click each top-nav tab in order (Workspaces → Docs → Explore → Featured → Blog → Preferences). The cursor should still be over the same physical pixel after the navigation. If you have to move your cursor to keep hitting "Docs" after starting on "Workspaces", the layout is shifting and the Puppeteer test should have caught it.

## Risks + mitigations

- **Palette regression** — Replacing `--accent-color` flips green→peach everywhere. The "Make Public" badge in `landing-view.ts`, status pills, success toasts, and any UI using `--accent-color`/`--success-color` will change.
  - *Mitigation:* full visual sweep after step 1 before any component refactor. Status colors (`--success-color`, `--warning-color`, `--error-color`, `--info-color`) stay as their existing greens/ambers/reds/blues — only `--accent-color` and `--secondary-accent` flip.
- **`backdrop-filter` performance** — Glass-morphism on many small elements is expensive on low-end devices.
  - *Mitigation:* scope `backdrop-filter` to large surfaces (`.tabs-wrap`, `.kebab` when open) only — not every icon button.
- **SVG noise overlay tile artifacts** — Data-URI fractalNoise repeats and may show seams.
  - *Mitigation:* use `background-size: 200px 200px` (matching the SVG's intrinsic size) and `background-repeat: repeat`. Keep opacity low (~0.5) so seams are imperceptible.
- **Existing publish badge in landing-view** — Still uses `--accent-color`. After step 1 it'll be peach instead of green.
  - *Mitigation:* expected and acceptable. Document in the change summary.
- **Three-surface parity** — This is playground-only. CLI and VS Code preview have no top nav, so parity is not at risk.
- **Grid track-width drift on long account-menu names** — A signed-in user named "Christopher Alexander" widens the account-menu pill, which sits in the right zone. Because the right zone is `minmax(280px, 1fr)`, very long names *can* push the right zone to widen, which by symmetry would also widen the left zone — but the tabs row is in the center `auto` column so they stay anchored.
  - *Mitigation:* if a name is wider than `1fr` content room, the account-menu pill should `text-overflow: ellipsis` rather than overflow horizontally. The Puppeteer test signs in as a fixed-name user so this case is detected separately during manual review.
- **Active-tab styling that violates the no-box-change rule** — A future CSS edit to active tabs that adds padding, a border, or different font-weight will reintroduce the shift. The Puppeteer test catches this.
  - *Mitigation:* add a comment in `app-header.css` near the `.tab.is-active` rule saying "DO NOT change box dimensions in active state — see Step 7 of phase-2-implementation-plan.md". Run the Puppeteer test after any tab-related CSS edit.

## Out of scope (deliberately deferred)

- Settings/preferences page redesign — separate work item.
- Email template visual refresh to match new brand colors — separate work item; emails currently use static templated colors.
- `/pathogen/explore` and `/pathogen/featured` page redesigns to match atmospheric language — separate work item.
- Migration of `--font-mono` value (already `Inconsolata` per the project's existing theme).

## Rollback plan

If atmospheric proves too disruptive after merge:

1. Revert `theme.css` palette swap (single-file revert).
2. Re-introduce flat `--bg-primary` etc. solid colors.
3. Component code in `app-header.ts` and `app-breadcrumb.ts` is structurally unchanged from the refactor (overflow menu in breadcrumb stays useful regardless of palette) — only the gradient and glow styling needs reverting.
