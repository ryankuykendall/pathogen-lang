# Phase 3: WebGPU Rendering Pipeline — Implementation Summary

## Date: 2026-03-02

## Overview

Phase 3 establishes the WebGPU rendering infrastructure for conic gradients in the playground, with `innerRadius` and `innerFill` properties as the concrete deliverables. This enables smooth center plateau effects impossible with Canvas 2D's `createConicGradient()`.

## Architecture

- **Main thread, not worker**: GPU work at playground resolution (~800×800) is sub-millisecond; worker message passing + OffscreenCanvas transfer isn't justified.
- **WebGPU for ALL conics when available**: Avoids visual discontinuity when users add `innerRadius`. Canvas 2D fallback for browsers without WebGPU.
- **GPU code in `playground/gpu/`**: Browser-only; CLI uses `renderConicToWedges()` (pure math).
- **Pre-render with generation counter**: Async GPU rendering happens between compilation and `setLayersWithTiming()`, with staleness re-check after.
- **Data URLs in SVG DOM**: Consistent with existing Canvas 2D approach; `createSvgSnapshot()` export works unchanged.

## New Files

| File | Purpose |
|------|---------|
| `playground/gpu/webgpu-device.js` | Device singleton with lazy init, cached availability probe, device-lost recovery |
| `playground/gpu/conic-shader.js` | WGSL vertex (full-screen triangle) + fragment (conic + innerRadius smoothstep) shaders |
| `playground/gpu/conic-pipeline.js` | Render pipeline creation, cached per-device with format matching |
| `playground/gpu/texture-cache.js` | LRU cache (32 entries) for rendered gradient data URLs with content-based hashing |
| `playground/gpu/gradient-service.js` | Service orchestrating WebGPU render → cache → Canvas 2D fallback |

## Modified Files

| File | Changes |
|------|---------|
| `src/evaluator/index.ts` | `innerRadius`/`innerFill` on `GradientValue`/`GradientOutput`, constructor defaults, property get/set, inherit, serialization |
| `src/cli.ts` | Warning when `innerRadius > 0` or `innerFill !== 'transparent'` in CLI output |
| `tests/gradients.test.ts` | 10 new `innerRadius` + 10 new `innerFill` tests |
| `docs/gradients.md` | `innerRadius`/`innerFill` docs, rendering implementation section |
| `playground/components/workspace-view.js` | GPU service init, pre-render conics, cache cleanup |
| `playground/components/svg-preview-pane.js` | Use pre-rendered URLs with inline Canvas 2D fallback |

## Key Implementation Details

### innerRadius & innerFill Language Support
- `innerRadius` defaults to `0` (no-op); must be a number >= 0
- `innerFill` defaults to `'transparent'`; accepts `'center'` or a `Color(...)` value
- Both propagate via `.inherit()`
- Both present in compilation output (innerFill Color values serialize to CSS strings)
- CLI warns and ignores both (wedge-path can't do per-pixel blending)

### WGSL Fragment Shader
- Full-screen triangle (3 vertices, no vertex buffer)
- `atan2` angle computation → direction → sweep mapping → spread handling
- `sampleRamp()` with linear interpolation between bracketing stops
- `smoothstep(0, innerRadius, dist)` blending inner fill color into sweep
- `getInnerColor()` resolves fill mode: transparent (default), center (first stop), or custom RGBA

### Gradient Service Flow
1. `init()` probes WebGPU availability at startup
2. `renderConicGradients()` called after compilation, before DOM update
3. Content-based hash → LRU cache check → GPU render or Canvas 2D fallback
4. Returns `Map<id, dataUrl>` for synchronous DOM injection
5. Staleness re-check after async GPU work prevents race conditions

### Cache Strategy
- Content-based hashing (excludes gradient ID — structurally identical gradients share cache)
- LRU eviction at 32 entries
- Cache cleared on `disconnectedCallback()`

## Test Results
- 1343 tests passing (10 new innerRadius + 10 new innerFill tests)
- Full build succeeds

## What This Enables (Phases 4–5)
- Mesh gradients (vertex-colored triangle meshes)
- Freeform gradients (scattered point interpolation)
- Topological gradients (boundary-aware interpolation)
- All will use the same WebGPU device/pipeline infrastructure
