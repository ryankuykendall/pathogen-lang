# Playground

Vanilla Web Components SPA — no framework, no bundler.

## Architecture

- Shadow DOM custom elements, SPA via History API router (`utils/router.js`, BASE_PATH: `/pathogen`)
- Entry: `index.html` → `<app-shell>` → router dispatches to views
- Library loaded as global: `../dist/index.global.js` → `window.PathogenLang`

## Directory Layout

- `components/` — custom elements (kebab-case, file name = tag name)
- `components/shared/` — reusable primitives (copy-button, control-group, error-panel, log-entry)
- `components/views/` — route-level views (landing, new-workspace, preferences, docs, blog, storybook, admin-thumbnails)
- `state/` — pub/sub store (`store.js`)
- `services/` — api, autosave, compiler-worker, thumbnail-service, user-id
- `utils/` — router, theme, codemirror-setup, storybook-registry, examples, url-state, content modules
- `styles/` — global CSS custom properties and layout; components scope styles in Shadow DOM
- `workers/` — thumbnail.worker.js (OffscreenCanvas PNG rasterization)

Note: `workspace-view.js` lives at `components/` root, not in `views/`.

## Conventions

### Components

- All components use Shadow DOM with inline `<style>` blocks
- Lifecycle: `constructor` (attachShadow) → `connectedCallback` (render, listeners, subscribe) → `disconnectedCallback` (cleanup)
- File names match tag names: `my-component.js` → `<my-component>`
- Element accessors: use getter properties (`get previewPane() { return this.shadowRoot.querySelector(...) }`)
- Always clean up store subscriptions in `disconnectedCallback()` to prevent memory leaks

### Events

- All CustomEvents MUST use `{ bubbles: true, composed: true }` — without `composed`, events won't cross Shadow DOM boundaries
- Event names: kebab-case (`code-change`, `style-change`, `open-export`)
- Document-level listeners for cross-component communication

### CSS & Theming

- ALWAYS use CSS custom properties from `styles/theme.css` — never hardcode colors, radii, or shadows
- Key vars: `--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--text-primary`, `--accent-color`, `--border-color`, `--radius-sm/md/lg`, `--shadow-sm/md/lg`, `--font-sans`, `--font-mono`
- Components use `var(--prop, fallback)` inside Shadow DOM `<style>` blocks
- Light/dark theme via `[data-theme]` attribute and `@media prefers-color-scheme`
- **Prefer CSS Grid over Flexbox** for layout. Use flexbox only for simple single-axis alignment (e.g., button rows, centering). Grid is preferred for any 2D layout, panel arrangements, or when items need to align across rows/columns.

### State Management (`state/store.js`)

- API: `get(key)`, `getAll()`, `set(key, val)`, `update(obj)`, `subscribe(keys, cb)` → unsubscribe fn, `batch(fn)`
- Use `store.update()` for multiple changes — avoids redundant subscriber notifications vs multiple `set()` calls
- `subscribe()` returns an unsubscribe function — always store and call it in `disconnectedCallback()`

### Compilation Flow

- Code change → 150ms debounce → `updatePreview()`
- `compilationId` incremented each compile; `isStale(id)` callback prevents race conditions
- Always check `isStale()` before any UI update in async compilation paths
- Compilation runs via `compiler-worker.js`, falls back to sync if worker unavailable

## Workflow Requirements

### Storybook

- When creating or significantly updating a component, add/update its entry in `utils/storybook-registry.js`
- Each story defines: component tag, props, slots, and interactive controls
- Verify in storybook view (`/storybook/:component`) after changes

### Adding a New View/Route

All three steps required — missing any one will silently fail:

1. Define route pattern in `utils/router.js`
2. Create component in `components/views/`
3. Register element in `components/app-shell.js` (import + add to render HTML)

### Adding a New Reusable Component

1. Create in `components/shared/`
2. Add storybook entry in `utils/storybook-registry.js`

### Adding Store State

1. Add default value in `state/store.js`
2. Add subscribers in relevant components

## Key Files for Common Tasks

| Task                    | Files                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Add view/route          | `utils/router.js`, `components/views/`, `components/app-shell.js` |
| Add shared component    | `components/shared/`, `utils/storybook-registry.js`               |
| Add workspace control   | `components/playground-footer.js`, `components/workspace-view.js` |
| Modify SVG preview      | `components/svg-preview-pane.js`                                  |
| Add editor autocomplete | `utils/codemirror-setup.js`                                       |
| Add API endpoint        | `services/api.js`                                                 |
| Change theme/colors     | `styles/theme.css`                                                |
| Add store state         | `state/store.js`, relevant subscribers                            |

## Dev & Verification

- `npm run dev:website` — localhost:3000 via Wrangler Pages
- Library must build first (`npm run build`) — playground loads `../dist/index.global.js`
- Browser console shows compile/render timing logs
- Test in both light and dark themes

## Development Lifecycle

1. **Build the library first** — `npm run build` (playground loads `dist/index.global.js`, not source). If the change depends on a compiler update in `src/`, the library must be rebuilt before any playground work.
2. **Identify component scope** — Determine which existing custom elements are affected and what new elements need to be created. Map out the component tree for the experience.
3. **Identify reuse opportunities** — Before building, determine whether to create new shared primitives in `components/shared/`, extend existing ones, or refactor to extract reusable patterns. Discuss non-obvious trade-offs with the user to balance end-user needs against long-term code health.
4. **Storybook-driven design** — Define the storybook entry first (tag, props, slots, controls in `utils/storybook-registry.js`) — this is the component's spec. Then build the component to satisfy it. Review each component for interaction, visual design, animation quality, polish, and delight. Verify in `/storybook/:component`.
5. **Integrate** — Wire components together following conventions above (Shadow DOM, lifecycle, events). Connect store subscriptions, cross-component events, and route/view registration. The goal is a cohesive, predictable experience — components should coordinate, not just coexist.
6. **Visual verify** — Test the integrated experience in both light and dark themes via `npm run dev:website`. Storybook verified components in isolation; this step verifies they work together — layout, event flow, theme consistency, and interaction feel across the full workflow.
