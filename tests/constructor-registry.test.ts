import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import {
  DEFS_CONSTRUCTORS,
  FILTER_CONSTRUCTORS,
  LAYER_CONSTRUCTORS,
  VALUE_CONSTRUCTORS,
} from '../src/evaluator/constructor-registry';

/**
 * Self-verifying constructor registry.
 *
 * src/evaluator/constructor-registry.ts is the allowlist that crossCheck()
 * in scripts/generate-completions.ts uses to keep pathogen-api.ts (and thus
 * all completions/hover/signature help) aligned with the evaluator runtime.
 * The registry itself could rot, so this suite compiles a canonical call for
 * every registered name and asserts the evaluator dispatches it — a name the
 * evaluator no longer knows fails with an unknown-function/undefined-variable
 * error and breaks the corresponding test.
 */

/**
 * Canonical minimal program per constructor (must compile cleanly).
 * Notes: path blocks require relative commands (`m`/`l`); defs constructors
 * must be `let`-assigned — a bare `Marker(...) {...};` statement is not valid
 * path output in either evaluator.
 */
const CANONICAL: Record<string, string> = {
  // Defs constructors
  SVGDocumentFragment: `let s = SVGDocumentFragment('<circle cx="5" cy="5" r="2"/>');\ns.insert();\nM 0 0`,
  Mask: `let m = Mask('reg-mask');\nm.append(@{ m 0 0 l 10 10 });\nM 0 0`,
  ClipPath: `let c = ClipPath('reg-clip');\nc.append(@{ m 0 0 l 10 10 });\nM 0 0`,
  LinearGradient: `let lg = LinearGradient('reg-lg', 0, 0, 1, 1) {|g|\n  g.stop(0, oklch(0.7 0.1 250));\n  g.stop(1, oklch(0.3 0.1 250));\n};\nM 0 0`,
  RadialGradient: `let rg = RadialGradient('reg-rg', 0.5, 0.5, 0.5) {|g|\n  g.stop(0, oklch(0.7 0.1 250));\n};\nM 0 0`,
  ConicGradient: `let cg = ConicGradient('reg-cg', 100, 100) {|g|\n  g.stop(0, oklch(0.7 0.1 250));\n  g.stop(1, oklch(0.3 0.1 20));\n};\nM 0 0`,
  MeshGradient: `let mg = MeshGradient('reg-mg', 100, 100, 2, 2) {|g|\n  g.colorAll(oklch(0.7 0.1 250));\n  g.getPoint(0, 0).color = oklch(0.3 0.1 20);\n};\nM 0 0`,
  FreeformGradient: `let fg = FreeformGradient('reg-fg', 100, 100) {|g|\n  g.point(10, 10, oklch(0.7 0.1 250));\n};\nM 0 0`,
  TopoGradient: `let tg = TopoGradient('reg-tg', 100, 100) {|g|\n  g.baseColor = oklch(0.2 0 0);\n  g.contour(@{ m 10 10 l 80 0 l 0 80 l -80 0 z }.project(0, 0), 0.5, oklch(0.7 0.1 250));\n};\nM 0 0`,
  Pattern: `let pt = Pattern('reg-pt', 0, 0, 10, 10) {|p|\n  p.append(@{ m 0 0 l 5 5 });\n};\nM 0 0`,
  Marker: `let mk = Marker('reg-mk', 10, 10) {|m|\n  m.append(@{ m 0 0 l 5 5 });\n};\nM 0 0`,
  // Filter constructors
  NoiseFilter: `let f = NoiseFilter() {|n| n.amount = 0.5; };\nM 0 0`,
  GlowFilter: `let f = GlowFilter() {|g| g.radius = 2; };\nM 0 0`,
  EmbossFilter: `let f = EmbossFilter() {|e| e.depth = 2; };\nM 0 0`,
  ElevationShadowFilter: `let f = ElevationShadowFilter() {|e| e.elevation = 4; };\nM 0 0`,
  InnerShadowFilter: `let f = InnerShadowFilter() {|i| i.blur = 2; };\nM 0 0`,
  PixelateFilter: `let f = PixelateFilter() {|p| p.width = 4; };\nM 0 0`,
  MotionBlurFilter: `let f = MotionBlurFilter() {|m| m.distance = 4; };\nM 0 0`,
  // Value constructors
  Point: `let p = Point(1, 2);\nM calc(p.x) calc(p.y)`,
  PolarVector: `let v = PolarVector(0.5, 10);\nM 0 0`,
  Cycler: `let c = Cycler([1, 2, 3]);\nM calc(c.pick()) 0`,
  CSSVar: `let v = CSSVar('--reg-var', 4);\nM 0 0`,
  Grid: `let g = Grid(2, 2);\nM 0 0`,
  // Layer constructors
  PathLayer: `let bg = PathLayer('reg-bg');\nbg.apply {\n  M 0 0 L 10 10\n}`,
  TextLayer: `let t = TextLayer('reg-text');\nM 0 0`,
  GroupLayer: `let grp = GroupLayer('reg-group');\nM 0 0`,
};

const ALL_GROUPS: [string, readonly string[]][] = [
  ['defs', DEFS_CONSTRUCTORS],
  ['filters', FILTER_CONSTRUCTORS],
  ['values', VALUE_CONSTRUCTORS],
  ['layers', LAYER_CONSTRUCTORS],
];

describe('constructor registry — behavioral verification against the evaluator', () => {
  it('has a canonical program for every registered constructor', () => {
    for (const [, names] of ALL_GROUPS) {
      for (const name of names) {
        expect(CANONICAL[name], `missing canonical program for ${name}`).toBeTruthy();
      }
    }
  });

  for (const [group, names] of ALL_GROUPS) {
    describe(group, () => {
      for (const name of names) {
        it(`${name}() dispatches in the evaluator`, () => {
          expect(() => compile(CANONICAL[name])).not.toThrow();
        });
      }
    });
  }
});
