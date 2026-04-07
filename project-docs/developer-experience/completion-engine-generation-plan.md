# Completion Engine Generation Plan

**Date**: 2026-04-06  
**Prerequisite**: [Completion Coverage Audit](completion-coverage-audit.md)

## Goal

Replace the hand-maintained `completion-data.ts` with a **generated** file produced from annotated runtime source. The evaluator and stdlib become the single source of truth for the language's API surface. Completion data stays in sync automatically because it's derived, not duplicated.

## Current Architecture

```
src/stdlib/math.ts          ─── hand-written functions
src/stdlib/path.ts          ─── hand-written functions
src/stdlib/grid.ts          ─── hand-written functions
src/evaluator/index.ts      ─── BUILTIN_ENUMS, method dispatch, property access
                                 (the actual runtime truth)

src/language-services/
  completion-data.ts        ─── MANUALLY maintained static arrays
  completion.ts             ─── inferType() + getMembersForObject() (manual mapping)
  signature-help.ts         ─── extracts signatures from completion detail strings
```

**Problem**: `completion-data.ts` is a stale snapshot. Every new function, enum, method, or type requires a separate manual update that is frequently forgotten.

## Proposed Architecture

```
src/stdlib/math.ts          ─── annotated with @completion JSDoc tags
src/stdlib/path.ts          ─── annotated with @completion JSDoc tags
src/stdlib/grid.ts          ─── annotated with @completion JSDoc tags
src/api-surface.ts          ─── NEW: declares enums, type members, namespaces
                                 (single registry of all non-stdlib API surface)

scripts/generate-completions.ts  ─── NEW: reads annotations + registry → generates file

src/language-services/
  completion-data.generated.ts   ─── GENERATED (do not edit)
  completion.ts                  ─── simplified; imports generated data
  signature-help.ts              ─── imports generated signatures
```

## Design Decisions

### Why annotations over runtime introspection?

Runtime introspection (calling functions, reflecting on objects) would require executing code and can't capture intent: parameter names, descriptions, boost priority, snippet templates. JSDoc annotations are static, co-located with the implementation, and express exactly what the completion engine needs.

### Why a separate api-surface.ts?

Enums, type members (Point.translate, Array.map), and namespace methods (Color.mix, Object.keys) are defined inline in the evaluator's massive switch statements. Extracting their metadata into annotations scattered across 6000+ lines of evaluator code would be fragile and hard to review. A dedicated registry file keeps the metadata co-located by concept and easy to audit.

### What stays manual?

- **Keywords** (let, for, if, fn, etc.) — these are grammar-level, not runtime. They change rarely and have snippet templates. Keep in `completion-data.ts` (renamed to `completion-data-static.ts`).
- **Boost values** — editorial choices about completion ranking. These live in the annotations/registry.

## Annotation Format

### Stdlib Functions (in math.ts, path.ts, grid.ts)

```typescript
/**
 * @completion circle(cx, cy, r) — Draw a circle path
 * @param cx Center X coordinate
 * @param cy Center Y coordinate  
 * @param r Radius
 * @completionKind function
 * @completionBoost 15
 */
circle(cx: number, cy: number, r: number) { ... }
```

The `@completion` tag provides the label and detail string. `@param` tags feed signature help. `@completionKind` and `@completionBoost` control presentation.

### API Surface Registry (api-surface.ts)

```typescript
/** 
 * Central registry of runtime API surface for completion generation.
 * This file is the source of truth for enums, type members, and namespaces.
 * 
 * IMPORTANT: When adding a new enum, type method, or namespace to the
 * evaluator, add it here too. The generate-completions script will flag
 * any evaluator additions not reflected in this file.
 */

export const API_SURFACE = {
  enums: {
    Easing: {
      detail: 'Easing function for interpolation',
      members: {
        Linear: 'linear',
        Smoothstep: 'smoothstep',
        EaseIn: 'ease-in',
        EaseOut: 'ease-out',
        EaseInOut: 'ease-in-out',
      },
    },
    GridPatternType: {
      detail: 'Grid cell rendering mode',
      members: {
        Shape: 'shape',
        Dot: 'dot',
        Intersection: 'intersection',
        Partial: 'partial',
      },
    },
    // ... all 13 enums
  },

  typeMembers: {
    Point: {
      properties: [
        { name: 'x', detail: 'X coordinate' },
        { name: 'y', detail: 'Y coordinate' },
        { name: 'angle', detail: 'Angle in degrees from origin' },
      ],
      methods: [
        { name: 'translate', detail: 'translate(dx, dy) — Offset point', params: ['dx', 'dy'] },
        { name: 'rotate', detail: 'rotate(angle, origin?) — Rotate around point', params: ['angle', 'origin'] },
        { name: 'distanceTo', detail: 'distanceTo(other) — Euclidean distance', params: ['other'] },
        { name: 'angleTo', detail: 'angleTo(other) — Angle to other point', params: ['other'] },
        { name: 'lerp', detail: 'lerp(other, t) — Linear interpolation', params: ['other', 't'] },
        { name: 'midpoint', detail: 'midpoint(other) — Midpoint between', params: ['other'] },
        { name: 'polarTranslate', detail: 'polarTranslate(angle, distance) — Polar offset', params: ['angle', 'distance'] },
        { name: 'offset', detail: 'offset(other) — Get {dx, dy} delta', params: ['other'] },
      ],
    },
    PathLayer: {
      properties: [
        { name: 'name', detail: 'Layer name' },
        { name: 'styles', detail: 'Style block' },
        { name: 'ctx', detail: 'Path context (position, heading, transform)' },
      ],
      methods: [],
      blockMembers: [
        { name: 'apply', detail: 'apply { } — Route commands to this layer' },
      ],
    },
    // ... all types
  },

  namespaces: {
    Color: {
      methods: [
        { name: 'mix', detail: 'Color.mix(c1, c2, t) — Interpolate colors', params: ['c1', 'c2', 't'] },
        { name: 'palette', detail: 'Color.palette(color, n) — Generate palette', params: ['color', 'n'] },
        { name: 'lightDark', detail: 'Color.lightDark(light, dark) — Theme-aware', params: ['light', 'dark'] },
      ],
    },
    Object: {
      methods: [
        { name: 'keys', detail: 'Object.keys(obj) — Get keys', params: ['obj'] },
        { name: 'values', detail: 'Object.values(obj) — Get values', params: ['obj'] },
        { name: 'entries', detail: 'Object.entries(obj) — Key-value pairs', params: ['obj'] },
        { name: 'delete', detail: 'Object.delete(obj, key) — Remove key', params: ['obj', 'key'] },
        { name: 'has', detail: 'Object.has(obj, key) — Check key exists', params: ['obj', 'key'] },
      ],
    },
  },
} as const;
```

## Generation Script (scripts/generate-completions.ts)

The script does three things:

### Step 1: Extract stdlib annotations

Parse `src/stdlib/*.ts` files with a lightweight JSDoc extractor. For each function with a `@completion` tag, emit a `CompletionEntry` with label, kind, detail, boost, and optionally insertText/isSnippet.

### Step 2: Process API surface registry

Read `src/api-surface.ts` and generate:
- **Enum completions**: Each enum name as a top-level `variable` completion. Each `EnumName.Member` combination feeds the member completion system.
- **Type member sets**: Generate `POINT_MEMBERS`, `LAYER_MEMBERS`, etc. from the `typeMembers` declarations.
- **Namespace member sets**: Generate `COLOR_NAMESPACE_MEMBERS`, etc.
- **Signature data**: Extract `params` arrays for signature help.

### Step 3: Cross-check against evaluator

Parse the evaluator looking for:
- Enum names in `BUILTIN_ENUMS` not present in `api-surface.ts`
- Method dispatch cases (`expr.method === '...'`) for known types not present in `typeMembers`
- Namespace lookups (`name === '...'` in `lookupVariable`) not present in `namespaces`

Emit warnings for any drift detected. This is the key mechanism that prevents the old problem of silent divergence.

### Output

```typescript
// src/language-services/completion-data.generated.ts
// AUTO-GENERATED by scripts/generate-completions.ts — DO NOT EDIT
// Source: src/stdlib/*.ts annotations + src/api-surface.ts

export const STDLIB_COMPLETIONS: CompletionEntry[] = [ ... ];
export const ENUM_COMPLETIONS: CompletionEntry[] = [ ... ];
export const ENUM_MEMBER_MAP: Record<string, CompletionEntry[]> = { ... };
export const POINT_MEMBERS: MemberCompletionSet = { ... };
export const ARRAY_MEMBERS: MemberCompletionSet = { ... };
// ... etc
export const SIGNATURE_DATA: Record<string, SignatureInfo> = { ... };
```

## Integration into completion.ts

The `getMembersForObject()` function simplifies dramatically:

```typescript
function getMembersForObject(name: string, source: string): MemberCompletionSet | null {
  // Check namespaces first (Color, Object, PathBlock)
  if (name in NAMESPACE_MEMBERS) return NAMESPACE_MEMBERS[name];

  // Check enums — enum names act like namespaces with constant members
  if (name in ENUM_MEMBER_MAP) return {
    properties: ENUM_MEMBER_MAP[name],
    methods: [],
  };

  // Infer type from source and look up members
  const type = inferType(name, source);
  if (type && type in TYPE_MEMBERS) return TYPE_MEMBERS[type];

  return null;
}
```

And `inferType()` gains layer constructor patterns automatically because the generation script knows which types exist.

## Integration into Workflow

### Build integration

Add to `package.json`:
```json
{
  "scripts": {
    "generate:completions": "tsx scripts/generate-completions.ts",
    "prebuild": "npm run generate:completions"
  }
}
```

The generated file is committed to the repo (not gitignored) so that consumers don't need the generation step, but `prebuild` ensures it stays fresh during development.

### Developer workflow

When adding a new feature:

1. **Add stdlib function** → Add `@completion` JSDoc to the function → `npm run generate:completions` → completions appear automatically
2. **Add enum** → Add to `BUILTIN_ENUMS` in evaluator AND to `api-surface.ts` → generate → completions appear
3. **Add type method** → Add dispatch case in evaluator AND to `api-surface.ts` → generate → completions appear
4. **Forget to update api-surface.ts** → generation script warns about drift → CI catches it

### CI gate

Add a check to CI:
```bash
npm run generate:completions
git diff --exit-code src/language-services/completion-data.generated.ts
```

If the generated file differs from what's committed, the build fails — forcing developers to regenerate after runtime changes.

## Implementation Phases

### Phase 1: API Surface Registry + Enum Completions
- Create `src/api-surface.ts` with all 13 enums + existing type members
- Write generation script skeleton that processes enums
- Wire enum completions into `completion.ts`
- Remove phantom completions (Point.scale, Array.filter, etc.)
- Add tests for enum completions

### Phase 2: Stdlib Annotation Migration
- Add `@completion` JSDoc tags to all stdlib functions (~50 functions across math.ts, path.ts, grid.ts)
- Extend generation script to extract stdlib annotations
- Replace `STDLIB_COMPLETIONS` with generated version
- Verify no regressions

### Phase 3: Type Members + Namespaces
- Add all type members to `api-surface.ts` (Point, Array, String, PathBlock, Layer, Cycler, PolarVector, Color, Object)
- Extend generation script for type member and namespace generation
- Replace all `*_MEMBERS` exports with generated versions
- Extend `inferType()` for all constructors

### Phase 4: Signature Help + Cross-Check
- Generate signature data from `@param` tags and api-surface params
- Implement evaluator cross-check in generation script
- Add CI gate
- Remove `completion-data.ts` (fully replaced by generated + static keywords)

## Success Criteria

- Every runtime-accessible function, enum, method, and property appears in completions
- No phantom completions (advertising things that don't exist)
- No signature mismatches between completions and runtime
- Adding a new stdlib function requires only a JSDoc annotation — no separate completion-data update
- Adding a new enum or type method requires an api-surface.ts update — drift is caught by CI
- Existing completion tests continue to pass
