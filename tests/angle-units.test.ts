import { describe, expect, it } from 'vitest';

import { compile, compileWithContext } from '../src';
import { compilePath } from './helpers';

/**
 * Angle units across the language.
 *
 * Radians are the internal standard and a bare number in an API position means
 * radians. The ONE exception is the SVG arc rotation slot — `A rx ry ROT flag
 * flag x y` — which the SVG spec defines as DEGREES. Pathogen writes that slot
 * verbatim, so an Angle flowing into it must be converted to degrees, not
 * flattened to radians like every other angle.
 *
 * Before this fix `arc(50, 50, 45deg, …)` emitted `A 50 50 0.785… …` — 0.785
 * DEGREES, i.e. writing the unit produced LESS rotation than omitting it.
 *
 * Audit: project-docs/placement-audit/ (D7).
 */

/** The rotation argument as emitted into the `A`/`a` command. */
function arcRotation(d: string): string {
  const match = /[Aa]\s+\S+\s+\S+\s+(\S+)/.exec(d);
  if (!match) throw new Error(`no arc command in ${JSON.stringify(d)}`);
  return match[1];
}

describe('the SVG arc rotation slot is degrees', () => {
  describe('via arc()', () => {
    it('keeps a bare number as degrees (SVG spec, unchanged)', () => {
      expect(arcRotation(compilePath('arc(50, 50, 45, 1, 1, 150, 100);'))).toBe('45');
    });

    it('converts a deg literal to degrees, not radians', () => {
      expect(arcRotation(compilePath('arc(50, 50, 45deg, 1, 1, 150, 100);'))).toBe('45');
    });

    it('converts a rad literal to degrees', () => {
      expect(arcRotation(compilePath('arc(50, 50, 0.7853981633974483rad, 1, 1, 150, 100);'))).toBe('45');
    });

    it('converts a pi literal to degrees', () => {
      expect(arcRotation(compilePath('arc(50, 50, 0.25pi, 1, 1, 150, 100);'))).toBe('45');
    });

    it('converts a negative angle', () => {
      expect(arcRotation(compilePath('arc(50, 50, -45deg, 1, 1, 150, 100);'))).toBe('-45');
    });

    it('converts an Angle held in a variable', () => {
      expect(arcRotation(compilePath('let tilt = 30deg; arc(50, 50, tilt, 1, 1, 150, 100);'))).toBe('30');
    });

    it('snaps the deg->rad->deg round trip (30deg is not 29.999999999999996)', () => {
      expect(arcRotation(compilePath('arc(50, 50, 30deg, 1, 1, 150, 100);'))).toBe('30');
    });
  });

  describe('via a raw A/a path command', () => {
    it('converts a deg literal in the absolute form', () => {
      expect(compilePath('M 0 0; A 10 10 45deg 0 1 20 20;')).toBe('M 0 0 A 10 10 45 0 1 20 20');
    });

    it('converts a deg literal in the relative form', () => {
      expect(compilePath('M 0 0; a 10 10 45deg 0 1 20 20;')).toBe('M 0 0 a 10 10 45 0 1 20 20');
    });

    it('leaves a bare rotation alone', () => {
      expect(compilePath('M 0 0; A 10 10 45 0 1 20 20;')).toBe('M 0 0 A 10 10 45 0 1 20 20');
    });

    it('does not touch the other A arguments', () => {
      // Only index 2 is an angle: rx, ry, the two flags and the endpoint are not.
      expect(compilePath('M 0 0; A 10 20 0 0 1 30 40;')).toBe('M 0 0 A 10 20 0 0 1 30 40');
    });
  });

  it('rotation actually changes the geometry it produces', () => {
    // A tilted elliptical arc must not sample the same points as an untilted one.
    // This is what the old behaviour silently lost: 0.785deg is visually 0.
    const tilted = compilePath('let p = @{ m 0 0 arc(60, 20, 45deg, 0, 1, 80, 0); }; p.draw();');
    const flat = compilePath('let p = @{ m 0 0 arc(60, 20, 0, 0, 1, 80, 0); }; p.draw();');
    expect(arcRotation(tilted)).toBe('45');
    expect(arcRotation(flat)).toBe('0');
    expect(tilted).not.toBe(flat);
  });
});

describe('the structured side agrees with the emitted text', () => {
  // The emitted `d` string and the context/record side are produced by two
  // different functions — evaluatePathArg and getNumericArgs. Fixing only the
  // first made the text correct while ctx.heading and PathBlock geometry kept
  // the old radians value: worse than being uniformly wrong, because nothing
  // disagreed before. Unequal radii on purpose — a circle's rotation is a
  // no-op, so rx == ry would not detect this.
  const HEADING = 'M 0 0 A 80 30 %ROT% 0 1 100 0 log(`h=${ctx.heading}`);';

  function heading(rotation: string): string {
    const logs = compileWithContext(HEADING.replace('%ROT%', rotation)).logs;
    return logs[0].parts.map((part) => String(part.value)).join(' ');
  }

  it('gives a deg-suffixed rotation the same heading as the bare degrees', () => {
    expect(heading('45deg')).toBe(heading('45'));
  });

  it('gives an Angle in a variable the same heading as the bare degrees', () => {
    const viaVariable = compileWithContext('let tilt = 45deg; M 0 0 A 80 30 tilt 0 1 100 0 log(`h=${ctx.heading}`);')
      .logs[0];
    expect(viaVariable.parts.map((part) => String(part.value)).join(' ')).toBe(heading('45'));
  });

  it('records the rotation in the structured command args, in degrees', () => {
    const commands = compile('M 0 0; A 80 30 45deg 0 1 100 0;', { trace: true }).commands;
    const arc = commands.find((command) => command.command === 'A');
    expect(arc?.args[2]).toBe(45);
  });

  it('gives a deg-suffixed rotation the same bounding box as the bare degrees', () => {
    const box = (rotation: string) =>
      compileWithContext(
        `let arcy = @{ m 0 0 a 80 30 ${rotation} 0 1 100 0 }; log(\`b=\${arcy.boundingBox().height}\`); M 0 0;`,
      )
        .logs[0].parts.map((part) => String(part.value))
        .join(' ');
    expect(box('45deg')).toBe(box('45'));
  });
});

describe('ellipticalFillet rotation stays radians', () => {
  // The counter-example that makes the arc slot special: this rotation IS
  // radians and is converted at src/evaluator/path-transforms.ts, so it must
  // NOT follow the arc slot into degrees.
  it('treats 45deg as a quarter turn, not as 45 radians', () => {
    const deg = compilePath('@{ m 0 0 h 40 v 40 }.ellipticalFillet(8, 4, 45deg).draw();');
    const rad = compilePath('@{ m 0 0 h 40 v 40 }.ellipticalFillet(8, 4, 0.7853981633974483rad).draw();');
    expect(deg).toBe(rad);
  });
});
