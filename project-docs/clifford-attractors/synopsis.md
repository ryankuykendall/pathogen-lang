# Blog Post Synopsis: Clifford Attractors in Pathogen

## Title
**Strange Attractors: Clifford Attractor Art with Pathogen**

## Scope
A blog post that is part tutorial, part language critique. Readers will implement Clifford Attractors from scratch — starting with the iterative math, progressing through efficient SVG rendering techniques, and exploring color mapping via multi-layer composition. The post concludes with an honest assessment of where Pathogen's ergonomics could improve for generative/computational art workflows.

## Audience
Developers and creative coders familiar with basic programming concepts (loops, variables, functions) who are interested in generative art. No prior knowledge of chaos theory or strange attractors is assumed. Basic Pathogen syntax is briefly recapped but deeper features (layers, PathBlocks) link to existing posts.

## Goals
1. Teach the Clifford attractor algorithm and the intuition behind its four parameters
2. Demonstrate Pathogen's strength for iterative, math-heavy generative art (trig functions, variable mutation in loops, coordinate mapping)
3. Show practical techniques: efficient point rendering with `M x y l 0 0`, color chunking via nested loops and multi-layer dispatch
4. Honestly identify language friction: the 10k iteration limit, lack of per-segment styling, verbose layer dispatch for color mapping, and absence of a `dot()` primitive
5. Produce visually striking sample images that showcase the aesthetic potential

## Key Differentiator
This is Pathogen's first generative art tutorial. Previous posts focused on geometry construction (PathBlocks, fillets, grids) and data visualization (radial bar charts). Clifford attractors demonstrate a fundamentally different use case — iterative computation producing emergent visual complexity — and expose language design tradeoffs that geometry-focused work does not.

## Samples
6 interactive mini-workspace demos progressing from a conceptual schematic through sparse point clouds, full-density renders, color-mapped compositions, a parameter gallery, and an interactive CSS-variable-driven variant.
