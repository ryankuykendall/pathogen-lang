# Consolidated Inspector Panel — Plan v2

## Context

The playground workspace currently has three floating panels (layers, palette, CSS variables) absolutely positioned in the top-right corner of `svg-preview-pane.js`. Each is a separate Shadow DOM component with its own collapse toggle, fixed width, and auto-hide logic. The user wants to consolidate these into a single structural right-side panel — integrated into the main layout rather than floating over the preview.

## Key Design Change from v1

**No tabs.** All three sub-panels keep their existing expand/collapse headers and are stacked vertically in a single scrollable container. Users scroll through all sections.

## Layout Change

**Current**: flexbox in `playground-main.js`
```
code-editor-pane (flex:1) | annotated-pane (flex:0→1) | console-pane (flex:0→1) | svg-preview-pane (flex:1)
```

**New**: flexbox with adjusted ratios when inspector is open
```
code-editor-pane (flex:2) | [annotated/console unchanged] | svg-preview-pane (flex:3) | inspector-panel (flex:1)
```

Staying with flexbox (rather than switching to CSS Grid) because the annotated-pane and console-pane use `flex: 0 0 0` → `flex: 1 1 0` transitions that would break under grid. The 2:3:1 ratio maps directly to flex values.

## Component Architecture

```
workspace-view.js
  playground-main.js (flexbox, slot)
    code-editor-pane        flex: 1 (default) → flex: 2 (inspector open)
    annotated-pane           unchanged
    console-pane             unchanged
    svg-preview-pane         flex: 1 (default) → flex: 3 (inspector open)
    inspector-panel          flex: 0 0 0 (closed) → flex: 1 (open), min-width: 240px
      <div class="inspector"> (scrollable)
        layers-panel (embedded mode, keeps own collapse header)
        palette-panel (embedded mode, keeps own collapse header)
        cssvar-panel (embedded mode, keeps own collapse header)
```

The inspector-panel is a **thin scrollable container** that hosts the existing panel components with an `embedded` attribute. Each sub-panel retains its own expand/collapse toggle. No tabs, no tab state — just vertical stacking with scroll.

## Files

### New
| File | Purpose |
|------|---------|
| `playground/components/inspector-panel.js` | Scrollable container hosting embedded sub-panels |

### Modified
| File | Changes |
|------|---------|
| `playground/components/playground-main.js` | Add `::slotted(inspector-panel)` rules, store subscription for `.inspector-open` host class, adjusted flex ratios |
| `playground/components/workspace-view.js` | Add `<inspector-panel>` to template, import it, add `cssvar-override` listener, add `toggle-inspector` listener |
| `playground/components/svg-preview-pane.js` | Remove `.panels-stack` div, remove panel imports, remove `cssvar-override` listener |
| `playground/components/layers-panel.js` | Add `embedded` attribute support (no floating chrome, fill container), add GroupLayer expand/collapse |
| `playground/components/palette-panel.js` | Add `embedded` attribute support |
| `playground/components/cssvar-panel.js` | Add `embedded` attribute support |
| `playground/components/playground-footer.js` | Add inspector toggle button matching Docs button style |
| `playground/state/store.js` | Add `inspectorOpen: false` |

## Detailed Design

### inspector-panel.js

Structure:
```html
<div class="inspector">
  <layers-panel embedded></layers-panel>
  <palette-panel embedded></palette-panel>
  <cssvar-panel embedded></cssvar-panel>
</div>
```

- Simple scrollable container — no tabs, no badge computation, no store subscriptions for content
- Imports and hosts the three sub-panels with `embedded` attribute
- CSS: `overflow-y: auto; height: 100%;`
- Each sub-panel manages its own data, collapse state, and visibility

### playground-main.js Changes

```css
/* Default (inspector closed) */
::slotted(code-editor-pane) { flex: 1; }
::slotted(svg-preview-pane) { flex: 1; }
::slotted(inspector-panel) {
  flex: 0 0 0; min-width: 0; overflow: hidden;
  transition: flex-basis 0.3s ease;
  border-left: 1px solid var(--border-color, #ddd);
}

/* Inspector open — host class toggled by store subscription */
:host(.inspector-open) ::slotted(code-editor-pane) { flex: 2; }
:host(.inspector-open) ::slotted(svg-preview-pane) { flex: 3; }
::slotted(inspector-panel.open) { flex: 1 1 0; min-width: 240px; }
```

Store subscription in `connectedCallback`:
```javascript
this._unsubscribe = store.subscribe('inspectorOpen', () => {
  this.classList.toggle('inspector-open', store.get('inspectorOpen'));
});
```

### Sub-panel `embedded` Mode

When `embedded` attribute is present on layers-panel, palette-panel, or cssvar-panel:
- Remove `.panel` wrapper styling (no box-shadow, border-radius, fixed width, max-height)
- Render as `width: 100%; overflow-y: visible;` (scroll handled by inspector container)
- Disable auto-hide (`this.style.display = 'none'`) — show empty state message instead
- Keep the collapse header — it still controls expand/collapse of that section
- Border between panels via `border-bottom` on `.panel` in embedded mode
- Existing standalone mode (no `embedded` attribute) remains unchanged for backward compatibility

### GroupLayer Expand/Collapse

In `layers-panel.js`:
- Add `_collapsedGroups = new Set()` instance property
- In `renderLayerRow()`, when `layer.type === 'group'`: render a chevron toggle button before the group name
- If group name is in `_collapsedGroups`, skip rendering children
- Chevron: ▶ collapsed, ▼ expanded
- Default: all groups expanded (current behavior preserved)

### cssvar-override Event Relocation

Current: `cssvar-panel` (inside `svg-preview-pane` shadow DOM) → `svg-preview-pane.shadowRoot` listener

New: `cssvar-panel` (inside `inspector-panel`) → bubbles with `composed: true` → caught by `workspace-view.shadowRoot`

Add listener in `workspace-view.js` `setupEventListeners()`:
```javascript
this.shadowRoot.addEventListener('cssvar-override', (e) => {
  const svg = this.previewPane?.shadowRoot?.querySelector('#preview');
  if (!svg) return;
  const { varName, value } = e.detail;
  value ? svg.style.setProperty(varName, value) : svg.style.removeProperty(varName);
});
```

### Footer Toggle Button

Add an "Inspector" button next to "Docs" in `playground-footer.js`. Same style as `#docs-btn`. Dispatches `toggle-inspector` event (bubbles, composed). `workspace-view.js` listens and toggles `store.set('inspectorOpen', ...)` plus `.open` class on the inspector-panel element.

### Mobile (<800px)

Inspector becomes a fixed bottom drawer:
```css
@media (max-width: 800px) {
  :host { position: fixed; bottom: 0; left: 0; right: 0; height: 0; max-height: 60vh; z-index: 100; transition: height 0.3s ease; }
  :host(.open) { height: 60vh; }
}
```
Mobile overrides in playground-main keep code/preview at flex:1 regardless of inspector state.

## Implementation Order

1. **Store** — Add `inspectorOpen` to `store.js`
2. **Sub-panel embedded mode** — Modify layers-panel, palette-panel, cssvar-panel for `embedded` attribute
3. **GroupLayer expand/collapse** — Add to layers-panel
4. **inspector-panel.js** — Create new component (scrollable container with embedded panels)
5. **playground-main.js** — Add slotted rules, store subscription
6. **svg-preview-pane.js** — Remove panels-stack and panel imports
7. **workspace-view.js** — Add inspector-panel to template, relocate cssvar-override listener, add toggle-inspector listener
8. **playground-footer.js** — Add inspector toggle button
9. **Visual verification** — Both themes, event flow, mobile

## Verification

1. Inspector opens/closes via footer button
2. All three sections visible when scrolling through inspector
3. Individual collapse/expand toggles still work for each section
4. GroupLayer children expand/collapse with chevron toggle
5. CSS variable overrides still apply to preview SVG
6. Layer visibility toggles still work
7. Layout proportions: code ≈ 2/6, preview ≈ 3/6, inspector ≈ 1/6
8. Mobile: bottom drawer instead of side panel
9. Both light and dark themes render correctly
10. Annotated/console pane expansion still works when inspector is open
11. Empty state handling: panels with no content show a message instead of hiding
