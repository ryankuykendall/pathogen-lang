# Phase 2a: Gradient Interpolation & Reactive Stops — Plan v1

Saved from implementation plan. See main plan in conversation context.

## Implementation Order
1. Documentation (docs/gradients.md)
2. Tests (tests/gradients.test.ts)
3. Type changes (GradientStop, GradientValue, GradientOutput)
4. stop() method — CSSVar-aware logic
5. Property access — interpolation, steps
6. Property assignment — interpolation, steps with validation
7. inherit() — propagate new properties
8. Stop expansion — expandOklchStops helper + buildCompileResult integration
9. CLI serialization — color-interpolation attribute
10. Playground injection — color-interpolation attribute
11. Annotated evaluator — parallel changes

## Key Design Decisions
- oklch field on GradientStop is optional (non-breaking for Phase 1)
- Expansion happens in buildCompileResult() not at stop() time
- Default steps = 10
- colorInterpolation on GradientOutput (separate from internal property name)
