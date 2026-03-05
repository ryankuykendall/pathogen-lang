# Phase 5B: Laplace Solver for TopoGradient

## Overview

Phase 5B adds the Laplace solver as a second method for TopoGradient elevation field computation. While the Phase 5A distance-based (SDF) method blends elevation by proximity to contour boundaries, the Laplace solver finds the mathematically smoothest surface by solving the Laplace equation (nabla-squared h = 0) with Jacobi iteration. This produces physically correct potential field flow, where elevation changes smoothly around corners and between non-nested contours.

## What Was Implemented

- **`method = 'laplace'`** — previously threw "not yet implemented"; now fully functional
- **`iterations` property** — controls Jacobi convergence (default: 200, range: 1-2000)
- Validation for iterations (must be a number, must be in range 1-2000)
- WebGPU compute shader pipeline for GPU-accelerated Laplace solving
- Canvas 2D fallback for browsers without WebGPU support
- Updated documentation and error messages

## Architecture

### 3-Stage GPU Pipeline (WebGPU)

The WebGPU implementation uses a compute shader pipeline with three stages in a single GPU submission:

1. **Init Pass**: A compute shader initializes the elevation field texture. Contour pixels are set to their fixed elevation values (boundary conditions). All other pixels are initialized to the base elevation (0). A separate boundary mask texture marks which pixels are fixed.

2. **Jacobi Iteration Pass**: A compute shader performs N iterations of the Jacobi method. Each non-boundary pixel is replaced with the average of its 4 neighbors (up, down, left, right). Uses ping-pong textures — reads from texture A, writes to texture B, then swaps. The `iterations` property controls how many passes are performed.

3. **Render Pass**: A fragment shader reads the converged elevation field and maps it through the color ramp (with easing and OKLab interpolation) to produce the final RGBA image. This is the same color lookup used by the distance method.

All three stages are encoded into a single command buffer and submitted together, minimizing CPU-GPU synchronization overhead.

### Canvas 2D Fallback (4x Downscale)

For browsers without WebGPU (Firefox, Safari):

1. **Downscale**: The elevation field is computed at 1/4 resolution (e.g., 512x512 for a 2048x2048 gradient)
2. **Init**: Contour boundaries are rasterized using `Path2D` and `isPointInPath()` to set boundary conditions
3. **Jacobi Iteration**: JavaScript loop performs N iterations on a flat `Float32Array`, replacing each non-boundary pixel with the average of its 4 neighbors
4. **Color Mapping**: The elevation field is mapped through the color ramp with easing
5. **Bilinear Upsampling**: The quarter-resolution result is upsampled back to full resolution using canvas `drawImage()` scaling, which provides bilinear interpolation

The 4x downscale makes the O(width * height * iterations) computation tractable on the CPU while producing visually acceptable results.

### CLI

The CLI continues to use the solid-color approximation from Phase 5A, with a warning emitted for topo gradients. The Laplace method does not change CLI behavior.

## Key Files Changed/Created

### Modified Files
- `src/evaluator/index.ts` — `iterations` property (get/set with validation), removed "not yet implemented" guard on `method = 'laplace'`, iterations included in gradient output serialization
- `playground/gpu/topo-shader.js` — Added WGSL compute shaders for Laplace init and Jacobi iteration passes
- `playground/gpu/topo-pipeline.js` — Added Laplace compute pipeline setup (bind groups, ping-pong textures, dispatch)
- `playground/gpu/gradient-service.js` — Laplace render path in `renderTopoGradients()`, Canvas 2D fallback with 4x downscale
- `tests/gradients.test.ts` — New tests for iterations property validation and Laplace method acceptance
- `docs/gradients.md` — Laplace algorithm section, iterations property, updated error table

### New Files
- `project-docs/topological-gradient/topo-laplace-comparison.pathogen` — 10-panel side-by-side comparison showcase
- `project-docs/topological-gradient/phase5b-summary.md` — This file

## How to Test

1. **Build the library**: `npm run build`
2. **Start the dev server**: `npm run dev:website`
3. **Open the playground**: Navigate to http://localhost:3000
4. **Load the comparison showcase**: Open the file `project-docs/topological-gradient/topo-laplace-comparison.pathogen` in a workspace. Set viewBox to `0 0 4400 11200`. The 10-panel layout shows each gradient rendered with both `distance` and `laplace` methods side by side.
5. **Observe the differences**: The most visible difference is in Row 3 (Twin Peaks) — the Laplace solver produces smooth elevation flow between the two non-nested peaks, while the distance method creates sharper boundaries.
6. **Test iterations**: Try changing `iterations` values (e.g., 50 vs 500) to see convergence effects. Low iteration counts produce visible banding; high counts produce smoother results.
7. **Run unit tests**: `npx vitest run tests/gradients.test.ts`
