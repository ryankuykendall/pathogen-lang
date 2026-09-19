# Playground

Vanilla Web Components SPA in TypeScript — no framework, no bundler. Each `.ts` file is transpiled one-to-one to a `.js` module by an esbuild micro-transpiler (`scripts/build-playground.ts`); the browser loads them as native ES modules.

## Architecture

- Shadow DOM custom elements, SPA via History API router (`utils/router.ts`, `BASE_PATH` is `''` — the site is served at the apex path; workspaces live at `/workspaces` and `/workspace/:slugId`)
- Entry: `index.html` → `<app-shell>` → router dispatches to views
- Library loaded as globals: `../dist/index.global.js` → `window.PathogenLang`, and `../dist/pan-zoom.global.js` → `window.PathogenPanZoom`
- `/docs` is a static page served by the Pages worker and has no SPA route; the blog does (`/blog`, `/blog/:slug`), alongside static SEO copies. Both render from **generated** modules — `utils/docs-content.js` (`npm run build:docs`) and `utils/blog-content.js` (`npm run build:blog`) — never edit those

## Source conventions

- **Sources are `.ts`; import specifiers say `.js`.** Write `import { store } from '../state/store.js'` — that is the path the browser resolves after transpilation. The only real `.js` files in the tree are the two generated content modules.
- `npm run typecheck:playground` (`tsc -p playground/tsconfig.json`, strict, no emit) is the type gate; the transpiler does not type-check.
- **Never run `eslint --fix` on playground code.** It has stripped load-bearing `as` casts and rewritten `=== false` into falsy tests (which once hid every preview layer). Fix lint findings by hand and diff behavior afterwards.
- Shared ambient types live in `types/` (`compiler.d.ts`, `store.d.ts`, …); the build skips that directory.

## Directory Layout

- `components/` — custom elements (kebab-case, file name = tag name)
- `components/shared/` — reusable primitives (copy-button, control-group, error-panel, log-entry, app-toast, theme-toggle, auth-modal, account-menu, …)
- `components/views/` — route-level views (landing, new-workspace, preferences, docs, blog, blog-post, storybook, storybook-detail, admin-thumbnails, admin-moderation)
- `state/` — pub/sub store (`store.ts`)
- `services/` — api, auth, autosave, compiler-worker, font-loader, publish-precheck, tab-coordinator, thumbnail-service, user-id
- `utils/` — router, theme, codemirror-setup, the language-services wiring (`cm-language-services.ts`, `cm-completion-bridge.ts`, `cm-hover-tooltip.ts`, …), storybook-registry, url-state, perf-marks, generated content modules
- `gpu/` — WebGPU gradient rendering (gradient service, shaders, error scopes)
- `types/` — ambient type declarations
- `styles/` — global CSS custom properties and layout
- `workers/` — `thumbnail.worker.ts` (OffscreenCanvas PNG rasterization)

Note: `workspace-view.ts` lives at `components/` root, not in `views/`.

## Conventions

### Components

- All components use Shadow DOM and render their CSS into a `<style>` block. Small primitives write the CSS inline; larger components keep it in an adjacent file and import it as text — `import styles from './my-component.css'` then `<style>${styles}</style>`. The build plugin inlines that import as a string, so the `.css` file is never fetched at runtime
- Lifecycle: `constructor` (attachShadow) → `connectedCallback` (render, listeners, subscribe) → `disconnectedCallback` (cleanup)
- File names match tag names: `my-component.ts` → `<my-component>`
- Element accessors: use getter properties (`get previewPane() { return this.shadowRoot.querySelector(...) }`)
- Always clean up store subscriptions in `disconnectedCallback()` to prevent memory leaks

### Events

- All CustomEvents MUST use `{ bubbles: true, composed: true }` — without `composed`, events won't cross Shadow DOM boundaries
- Event names: kebab-case (`code-change`, `style-change`, `open-export`)
- Document-level listeners for cross-component communication

### CSS & Theming

- ALWAYS use CSS custom properties from `styles/theme.css` — never hardcode colors, radii, or shadows
- Key vars: `--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--text-primary`, `--accent-color`, `--border-color`, `--radius-sm/md/lg`, `--shadow-sm/md/lg`, `--font-sans`, `--font-mono`
- Components use `var(--prop, fallback)` inside their Shadow DOM styles
- Light/dark theme via `[data-theme]` attribute and `@media prefers-color-scheme`
- **Prefer CSS Grid over Flexbox** for layout. Use flexbox only for simple single-axis alignment (e.g., button rows, centering). Grid is preferred for any 2D layout, panel arrangements, or when items need to align across rows/columns.

### State Management (`state/store.ts`)

- API: `get(key)`, `getAll()`, `set(key, val)`, `update(obj)`, `subscribe(keys, cb)` → unsubscribe fn, `batch(fn)`
- Use `store.update()` for multiple changes — avoids redundant subscriber notifications vs multiple `set()` calls
- `subscribe()` returns an unsubscribe function — always store and call it in `disconnectedCallback()`
- New state needs its type in `types/store.d.ts` as well as its default in `state/store.ts`

### Compilation Flow

- Code change → debounce → `updatePreview()`. The debounce is 150 ms, stretched to 600 ms while the cursor sits mid-expression (the text ends in `.`, `(`, `,` or `{`) so completion and signature-help popups are not covered by the error panel
- `compilationId` incremented each compile; `isStale(id)` prevents race conditions. Always check `isStale()` before any UI update in async compilation paths — including after awaited GPU work
- Compilation runs through `services/compiler-worker.ts`: the editor uses its own `editorCompiler` client, which **cancels** a superseded compile. A cancelled compile rejects with `error.name === 'CompileCancelled'` — treat that as silence, never as an error to show. Falls back to synchronous compilation if the worker is unavailable

### Editor completions — two sources, merged

`utils/cm-language-services.ts` registers `[sharedSource, legacyFallback]`, and CodeMirror **merges** their results (it is not a fallthrough). The shared source calls `window.PathogenLang.getCompletions`; the legacy `svgPathCompletions` in `utils/codemirror-setup.ts` must return `null` wherever the shared engine owns the answer (member access, style blocks, template strings, leading-symbol triggers), or its keyword list buries the real options. The `.` trigger opens the popup explicitly, so "nothing typed yet" guards do not apply there. Regression test: `tests/playground-legacy-completion-deferral.test.ts`.

## Workflow Requirements

### Storybook

- When creating or significantly updating a component, add/update its entry in `utils/storybook-registry.ts`
- Each story defines: component tag, props, slots, and interactive controls
- Verify in storybook view (`/storybook/:component`) after changes

### Adding a New View/Route

All three steps required — missing any one will silently fail:

1. Define route pattern in `utils/router.ts`
2. Create component in `components/views/`
3. Register element in `components/app-shell.ts` (import with a `.js` specifier + add to render HTML)

### Adding a New Reusable Component

1. Create in `components/shared/`
2. Add storybook entry in `utils/storybook-registry.ts`

### Adding Store State

1. Add default value in `state/store.ts` and its type in `types/store.d.ts`
2. Add subscribers in relevant components

## Key Files for Common Tasks

| Task                    | Files                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Add view/route          | `utils/router.ts`, `components/views/`, `components/app-shell.ts`                         |
| Add shared component    | `components/shared/`, `utils/storybook-registry.ts`                                       |
| Add workspace control   | `components/playground-footer.ts`, `components/workspace-view.ts`                         |
| Modify SVG preview      | `components/svg-preview-pane.ts`                                                          |
| Editor language features | `utils/cm-language-services.ts` (wiring), `utils/cm-completion-bridge.ts`, `utils/cm-hover-tooltip.ts`; the logic itself lives in `src/language-services/` |
| Legacy editor completions | `utils/codemirror-setup.ts` (see "two sources" above)                                   |
| New defs-producing construct | the five-file chain — `types/compiler.d.ts` → `types/store.d.ts` → `state/store.ts` → `components/workspace-view.ts` → `components/svg-preview-pane.ts` (see `.claude/CLAUDE.md` → Three Surfaces) |
| Add API endpoint        | `services/api.ts`                                                                         |
| Change theme/colors     | `styles/theme.css`                                                                        |
| Add store state         | `state/store.ts`, `types/store.d.ts`, relevant subscribers                                |

## Dev & Verification

- `npm run dev:website` builds the site and serves it on localhost:3000 via Wrangler Pages; `npm run dev:stack` runs it together with the API worker on :8787
- **If `dev:stack` is already running, never run plain `npm run build:website`, `build:playground` or `dev:website`.** Those bake the *production* API base into the served bundle (`__PATHOGEN_API_BASE__`), which silently points the dev playground at production. Check `ps` for wrangler first, and rebuild with `PATHOGEN_API_BASE=http://localhost:8787 npm run build:website`. Never kill the user's `workerd`
- Library must build first (`npm run build`) — the playground loads `dist/index.global.js`, not source. The *served* copy lives in the generated site, so a rebuilt library is not visible until the site is rebuilt too
- Performance instrumentation is off by default: enable with `?perf=1` or `localStorage.pathogenPerf = '1'` to get `performance.measure('pathogen:<name>')` entries and console lines for spans ≥ 1 ms (`utils/perf-marks.ts`)
- Unit tests for playground utilities live in the repo's `tests/` directory (jsdom). A test that imports anything touching `services/api.ts` must define `__PATHOGEN_API_BASE__` before the import
- Scripted browser verification: see the puppeteer notes in project memory and the precedent in `project-docs/range-values/verify/verify-playground.mjs` — dismiss dialogs, poll with `page.evaluate`, walk shadow roots, inject code via `/workspace/scratch?state=`
- Test in both light and dark themes

## Development Lifecycle

1. **Build the library first** — `npm run build` (playground loads `dist/index.global.js`, not source). If the change depends on a compiler update in `src/`, the library must be rebuilt before any playground work.
2. **Identify component scope** — Determine which existing custom elements are affected and what new elements need to be created. Map out the component tree for the experience.
3. **Identify reuse opportunities** — Before building, determine whether to create new shared primitives in `components/shared/`, extend existing ones, or refactor to extract reusable patterns. Discuss non-obvious trade-offs with the user to balance end-user needs against long-term code health.
4. **Storybook-driven design** — Define the storybook entry first (tag, props, slots, controls in `utils/storybook-registry.ts`) — this is the component's spec. Then build the component to satisfy it. Review each component for interaction, visual design, animation quality, polish, and delight. Verify in `/storybook/:component`.
5. **Integrate** — Wire components together following conventions above (Shadow DOM, lifecycle, events). Connect store subscriptions, cross-component events, and route/view registration. The goal is a cohesive, predictable experience — components should coordinate, not just coexist.
6. **Visual verify** — Test the integrated experience in both light and dark themes on the dev server (mind the `dev:stack` rebuild rule above). Storybook verified components in isolation; this step verifies they work together — layout, event flow, theme consistency, and interaction feel across the full workflow.
