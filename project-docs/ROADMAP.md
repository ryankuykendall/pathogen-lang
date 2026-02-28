# Multi-Layer Support Roadmap

## Phase 1: PathLayer (Complete)

Core layer infrastructure — `define PathLayer(...)`, `layer().apply {}`, context isolation, structured `CompileResult` output with per-layer styles.

## Phase 2: TextLayer & Template Literals (Complete)

TextLayer for SVG `<text>` elements, `text()` and `tspan()` functions with rotation support, template literal expressions with `${}` interpolation, string equality (`==`/`!=`).

## Phase 3: Playground Layer Controls

- Per-layer style overrides in the footer
- Layer visibility toggles (show/hide individual layers)
- Layer list panel

## Phase 4: Expression-Based Style Values

- Allow `calc()` and variables inside style blocks (e.g., `stroke-width: calc(2 * scale);`)
- `ctx.layer('name')` convenience alias
