# svg-path-extended - Project Plan

This document captures the design decisions and implementation plan for svg-path-extended.

## Overview

A TypeScript module that extends SVG path syntax with variables, expressions, control flow, and functions. Works as both a CLI tool and a browser-compatible library.

## Project Structure

```
svg-path-extended/
├── src/
│   ├── parser/
│   │   ├── ast.ts       # AST node type definitions
│   │   └── index.ts     # Parsimmon-based parser
│   ├── evaluator/
│   │   └── index.ts     # AST evaluator → SVG path string
│   ├── stdlib/
│   │   ├── math.ts      # sin, cos, lerp, clamp, etc.
│   │   ├── path.ts      # circle, rect, polygon, star
│   │   └── index.ts     # Stdlib exports
│   ├── cli.ts           # CLI entry point
│   └── index.ts         # Library entry point (compile function)
├── tests/
│   ├── parser.test.ts   # Parser unit tests
│   └── evaluator.test.ts # Evaluator/integration tests
├── docs/
│   ├── syntax.md        # Language syntax reference
│   ├── stdlib.md        # Standard library reference
│   ├── cli.md           # CLI usage reference
│   ├── examples.md      # Practical examples
│   └── PLAN.md          # This file
├── examples/
│   ├── output/          # Generated SVG files
│   └── *.svgx           # Example source files
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .claude.md           # Development context
└── README.md
```

## Design Decisions

### Parser: Parsimmon
- Well-documented parser combinator library
- TypeScript types included
- Small bundle size (~8KB minified)
- Works in browser
- Declarative grammar definition

### Expression Syntax: `calc()` for math
- Inspired by CSS `calc()` - familiar and readable
- Plain variable names: `M x y` (no wrapper needed)
- Math expressions: `L calc(x + 10) calc(y * 2)`
- Simplifies parsing: extensions are clearly delimited by parentheses

### Build Tooling
- **tsup** for bundling (ESM + CJS + browser IIFE)
- **Vitest** for testing
- **tsx** for running CLI during development

### Other Decisions
- Path commands are case-sensitive (M = absolute, m = relative) to match SVG spec
- Error handling: fail fast with clear error messages
- Comments: `//` line comments supported

## Syntax Summary

```
// Variables
let radius = 50;

// Plain variables in path commands
M cx cy

// Math expressions require calc()
L calc(cx + 10) calc(cy * 2)

// For loops
for (i in 0..5) {
  L calc(i * 20) calc(sin(i) * 30)
}

// Conditionals
if (x > 0) { M 10 10 } else { M 0 0 }

// User functions
fn myShape(x, y) { rect(x, y, 50, 50) }

// Stdlib functions
circle(cx, cy, r)
polygon(cx, cy, radius, sides)
star(cx, cy, outerR, innerR, points)
```

## Implementation Status

### Phase 1: Project Setup ✅
- [x] Initialize npm project with TypeScript
- [x] Install dependencies: parsimmon, tsup, vitest, tsx
- [x] Configure tsup for ESM + CJS + browser builds
- [x] Set up test infrastructure

### Phase 2: Parser Foundation ✅
- [x] Define AST node types
- [x] Parse numbers and identifiers
- [x] Parse path commands (M, L, C, A, Z, etc.)
- [x] Parse `calc(expr)` with arithmetic expressions
- [x] Parse function calls
- [x] Support `//` line comments

### Phase 3: Variables & Control Flow ✅
- [x] Parse `let` variable declarations
- [x] Implement variable scoping in evaluator
- [x] Parse `for` loops with range syntax
- [x] Parse `if/else` conditionals
- [x] Implement control flow in evaluator

### Phase 4: Functions ✅
- [x] Parse function definitions (`fn name(args) { ... }`)
- [x] Implement function evaluation with local scope
- [x] Add stdlib math functions
- [x] Add stdlib path helpers

### Phase 5: CLI & Integration ✅
- [x] CLI with argument parsing
- [x] Support `--src=<file>` input
- [x] Support `-e <code>` inline code
- [x] Support stdin input
- [x] Add `--output-svg-file` for complete SVG output
- [x] SVG styling options (stroke, fill, viewBox, etc.)

### Phase 6: Documentation ✅
- [x] README.md
- [x] docs/syntax.md
- [x] docs/stdlib.md
- [x] docs/cli.md
- [x] docs/examples.md
- [x] .claude.md development context

### Future Enhancements
- [ ] Watch mode for development
- [ ] Browser playground example
- [ ] Improved error messages with line/column info
- [ ] Source maps

## Verification

```bash
# Run tests
npm test

# CLI smoke test
echo 'let x = 10; M x 0 L calc(x + 5) 10' | npx tsx src/cli.ts -

# Generate SVG
npx tsx src/cli.ts -e 'circle(100, 100, 50)' --output-svg-file=test.svg
```
