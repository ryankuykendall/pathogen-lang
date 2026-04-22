# Design: src/render/ shared SVG renderer

**Status:** design doc, pre-implementation. Lives next to `PLAN.md`; gets revised as phases land.

## Goals

1. **One renderer.** A single module that interprets `CompileResult` into an SVG tree. No duplicated "build a `<marker>` element" code.
2. **Two adapters, symmetric.** Serialize to string (CLI, VS Code pre-Phase 5) and mount into DOM (playground, VS Code post-Phase 5). Both walk the same tree; both must produce equivalent output.
3. **No dependencies.** ~200 lines hand-rolled. No vdom library.
4. **Byte identity with the existing CLI output.** Snapshot tests pin the current bytes; the refactor is not allowed to change them.
5. **Preserve every `data-*` attribute the playground and VS Code preview depend on.** See the preservation table below — those are the observable contract.

## Module layout

```
src/render/
├── types.ts        # VNode, VNodeChild, VNodeTree
├── build-defs.ts   # (CompileResult) → VNode[]   — masks, clipPaths, gradients, patterns, markers, css props
├── build-layers.ts # (LayerOutput[], opts) → VNode[]   — path, text, group, fragment branches
├── build-tree.ts   # (CompileResult, opts) → VNode   — wraps defs + layers in the <svg> envelope
├── serialize.ts    # (VNode) → string   — string adapter
├── mount.ts        # (parent, VNode | VNode[]) → void   — DOM adapter via createElementNS
└── index.ts        # re-exports
```

Each builder is a pure function of its inputs. Neither adapter mutates shared state beyond the DOM target passed into `mount`.

## VNode shape

```ts
// src/render/types.ts
export type VNodeChild = VNode | string;  // string = text node

export interface VNode {
  tag: string;                          // e.g. 'svg', 'defs', 'marker', 'path'
  attrs: Record<string, string>;        // attribute name → value; serializer iterates in insertion order
  children: VNodeChild[];               // always an array, even when empty
}

// Convenience factory
export function h(tag: string, attrs: Record<string, string> = {}, children: VNodeChild[] = []): VNode {
  return { tag, attrs, children };
}
```

**Notes:**

- `attrs` is `Record<string, string>` — values are strings already (the builders do the number→string conversion using the project's existing `formatNum()`).
- Attribute **insertion order matters** for byte identity. The `serialize.ts` iterates in the object's own insertion order; builders must insert attributes in the same order `svg-generator.ts` currently emits.
- `children` mixes `VNode` and raw `string` (for text nodes). Raw strings are escaped by the serializer (`escapeXml`) and appended via `createTextNode` by the DOM adapter.
- No `key` / `id` / fragment concept. This is a write-once tree, not a reconciled vdom.

## Adapter APIs

### `serialize.ts`

```ts
export function toSvgString(vnode: VNode, opts?: { indent?: string }): string;
```

- Produces a newline-separated, indented string matching `svg-generator.ts`'s current output exactly.
- `<defs>` children at 2-space indent; element children at 4-space; paths inside markers/masks at 4-space.
- Self-closing rule: any element with zero children closes as `<tag ... />`; with children, emits `<tag ...>\n  ...\n</tag>`.
- Escapes attribute values and text children via the existing `escapeXml()` helper (extracted from `svg-generator.ts`).

### `mount.ts`

```ts
export function mountInto(parent: Element, vnodes: VNode | VNode[]): void;
```

- Creates each child via `document.createElementNS(SVG_NS, tag)`, where `SVG_NS = 'http://www.w3.org/2000/svg'`.
- Sets attributes via `setAttribute(name, value)` in insertion order.
- Recurses into children. Raw strings become `document.createTextNode(...)`.
- Does **not** clear `parent` first — the playground and VS Code preview handle their own cleanup (by `data-*-def` attribute in the playground, by `.injected-defs`/`.injected-style` class in VS Code).

## `data-*` attribute preservation

Both renderers emit these today; the refactor must emit all of them via `build-defs.ts` / `build-layers.ts`. This table is the contract.

| Attribute | Emitted by | Read by |
|---|---|---|
| `data-mask-def` | defs builder (one per mask) | playground cleanup selector |
| `data-clippath-def` | defs builder (one per clipPath) | playground cleanup selector |
| `data-gradient-def` | defs builder (one per gradient) | playground cleanup selector |
| `data-pattern-def` | defs builder (one per pattern) | playground cleanup selector |
| `data-marker-def` | defs builder (one per marker) | playground cleanup selector |
| `data-fragment-layer` | layer builder (fragment type) | playground cleanup selector |
| `data-layer-name` | layer builder (all layer types) | playground inspector, layer-visibility toggle; VS Code layers panel |
| `data-has-layer-stroke` | layer builder | playground preview-pane hit testing |
| `data-has-layer-stroke-width` | layer builder | playground preview-pane hit testing |
| `data-orig-mask` | playground layer-visibility toggle only | playground (re-applied on show) |
| `data-orig-clip-path` | playground layer-visibility toggle only | playground (re-applied on show) |

The last two are NOT emitted by the shared renderer — they're set at runtime by the playground's visibility toggle when hiding a layer. Out of scope for the refactor.

## GPU gradient decoration pass

The playground has a pre-mount step: for conic / mesh / freeform / topo gradients, a previously-computed `<image href="data:...">` URL may be available in `defsData.gpuGradientUrls: Map<id, url>`. When present, the gradient's body in the tree gets swapped for the rasterized image before `mountInto`.

```ts
// In playground/components/svg-preview-pane.ts (Phase 3)
function decorateWithGpuGradients(tree: VNode, urls: Map<string, string>): VNode {
  // Walk tree.children (the <defs> subtree). For each gradient VNode
  // whose id is in `urls`, replace children with a single <image> VNode
  // whose href is the data URL. Preserve all other attributes.
}
```

This is an **optional pass**, playground-only. The CLI and VS Code paths skip it — they render the gradient as-is (fallback: CLI uses wedge-path approximation for conic; VS Code gets the rasterized image via its own pipeline).

## Byte-identity requirements

Phase 2 must produce CLI output that diffs to zero against the pre-refactor capture. Specific rules inherited from `svg-generator.ts`:

- Attribute order on `<marker>`: `id, viewBox, markerWidth, markerHeight, refX, refY, markerUnits?, orient?, preserveAspectRatio?` (the last three are emitted only when non-default; see `svg-generator.ts:188-199`).
- Attribute order on `<linearGradient>` / `<radialGradient>`: id, coordinate attrs in existing order, then `spreadMethod`, `gradientUnits`, `gradientTransform`, `color-interpolation`, `href`, then `<stop>` children.
- Pattern attrs: id, x, y, width, height, then optional patternUnits / patternTransform / patternContentUnits.
- Default-elision: exactly matches the evaluator's `result.markers` elision rules (`markerUnits !== 'strokeWidth'`, `preserveAspectRatio !== 'xMidYMid meet'`). The builder reads the already-elided values from `MarkerOutput`.
- Indentation: 2 spaces inside `<defs>`, 4 spaces inside `<marker>` / `<mask>` / `<pattern>` / gradient elements. Layer paths at top level get no indent (current behavior).
- No trailing whitespace. No `<?xml?>` declaration. Single `<defs>` section if any defs present; no `<defs>` section if empty.

## What can break, and how the safety net catches it

| Failure mode | Detected by |
|---|---|
| Attribute order change | Phase 0 CLI byte-snapshot |
| Default-elision regresses (e.g. emits `markerUnits="strokeWidth"`) | Phase 0 CLI byte-snapshot + targeted `tests/markers.test.ts` case |
| `data-*-def` attribute dropped | Phase 0 DOM snapshot |
| `data-layer-name` dropped | Phase 0 DOM snapshot + playground inspector panel breaks (manual check) |
| Playground cleanup regresses (old defs not removed on recompile) | Phase 0 DOM snapshot across two sequential compiles |
| GPU gradient decoration fails silently | Manual `npm run dev:website` check on a conic-gradient fixture |
| VS Code panels break after Phase 5 migration | `.vsix` install + end-to-end manual verify checklist in the plan |

## Open questions (to resolve during implementation)

- **Snapshot test framework:** jsdom vs Happy DOM for the playground DOM snapshot. Happy DOM is faster and has been stable in other Vitest setups; jsdom is more compatible. Start with jsdom (default in Vitest) and switch only if it can't render `createElementNS` correctly for our shapes. _Resolution deferred to Phase 0._
- **`svg-builder.ts` fate:** audit confirmed it has zero imports today. Delete vs 10-line wrapper? Delete is cleaner if the author who wrote it confirms it was speculative; wrapper is safer if future BBWP work might want it. _Resolution deferred to Phase 4; grep + ask._
- **Extension bundle re-export mechanism:** Phase 5 needs `window.SvgPathExtended.buildSvgTree` and `.mountInto` to exist. Verify `tsup` config picks up new `src/index.ts` exports and they land on the IIFE global. _Resolution in Phase 5 before touching preview.ts._
