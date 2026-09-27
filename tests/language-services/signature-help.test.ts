import { describe, expect, it } from 'vitest';

import { StringTextDocument } from '../../src/language-services/document';
import { getSignatureHelp } from '../../src/language-services/signature-help';

function sigHelp(source: string, line: number, character: number) {
  return getSignatureHelp(new StringTextDocument(source), { line, character });
}

/** Get signature help at end of source. */
function sigHelpAtEnd(source: string) {
  const lines = source.split('\n');
  return sigHelp(source, lines.length - 1, lines[lines.length - 1].length);
}

describe('getSignatureHelp', () => {
  it('returns null when not inside function call', () => {
    expect(sigHelpAtEnd('let x = 10;')).toBeNull();
  });

  it('returns null for empty source', () => {
    expect(sigHelp('', 0, 0)).toBeNull();
  });

  describe('stdlib functions', () => {
    it('shows signature for lerp after opening paren', () => {
      const result = sigHelpAtEnd('let x = lerp(');
      expect(result).not.toBeNull();
      expect(result!.signatures).toHaveLength(1);
      expect(result!.signatures[0].label).toContain('lerp');
      expect(result!.activeParameter).toBe(0);
    });

    it('shows active parameter after first comma', () => {
      const result = sigHelpAtEnd('let x = lerp(0, ');
      expect(result).not.toBeNull();
      expect(result!.activeParameter).toBe(1);
    });

    it('shows active parameter after second comma', () => {
      const result = sigHelpAtEnd('let x = lerp(0, 100, ');
      expect(result).not.toBeNull();
      expect(result!.activeParameter).toBe(2);
    });

    it('shows signature for circle', () => {
      const result = sigHelpAtEnd('circle(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].label).toContain('circle');
      expect(result!.signatures[0].parameters).toHaveLength(3); // cx, cy, r
    });

    it('shows signature for clamp with parameter names', () => {
      const result = sigHelpAtEnd('let y = clamp(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['value', 'min', 'max']);
    });

    it('shows signature for smoothstep with parameter names', () => {
      const result = sigHelpAtEnd('let y = smoothstep(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['edge0', 'edge1', 'x']);
    });

    it('shows signature for hash01 including the optional seed', () => {
      const result = sigHelpAtEnd('let y = hash01(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['n', 'seed']);
      expect(result!.activeParameter).toBe(0);
    });

    it('shows signature for noise2 with parameter names', () => {
      const result = sigHelpAtEnd('let y = noise2(1.5, ');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['x', 'y', 'seed']);
      expect(result!.activeParameter).toBe(1);
    });

    it('shows signature for hashRange and bump with parameter names', () => {
      const range = sigHelpAtEnd('let y = hashRange(1, 10, ');
      expect(range).not.toBeNull();
      expect(range!.signatures[0].parameters.map((p) => p.label)).toEqual(['n', 'min', 'max', 'seed']);
      expect(range!.activeParameter).toBe(2);
      const bump = sigHelpAtEnd('let y = bump(');
      expect(bump).not.toBeNull();
      expect(bump!.signatures[0].parameters.map((p) => p.label)).toEqual(['t', 'center', 'spread']);
    });

    it('shows signature for ease with curve then t', () => {
      const result = sigHelpAtEnd("let y = ease('sine-in', ");
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['curve', 't']);
      expect(result!.activeParameter).toBe(1);
    });

    it('shows signature for cubicBezier with the four handles then t', () => {
      const result = sigHelpAtEnd('let y = cubicBezier(0.42, 0, ');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['x1', 'y1', 'x2', 'y2', 't']);
      expect(result!.activeParameter).toBe(2);
    });

    it('handles nested function calls', () => {
      // cursor inside sin(), not lerp()
      const result = sigHelpAtEnd('let x = lerp(sin(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].label).toContain('sin');
    });
  });

  describe('parameter index', () => {
    it('parameter 0 right after opening paren', () => {
      expect(sigHelpAtEnd('rect(')!.activeParameter).toBe(0);
    });

    it('parameter 1 after first arg', () => {
      expect(sigHelpAtEnd('rect(10, ')!.activeParameter).toBe(1);
    });

    it('parameter 2 after two args', () => {
      expect(sigHelpAtEnd('rect(10, 20, ')!.activeParameter).toBe(2);
    });

    it('parameter 3 after three args', () => {
      expect(sigHelpAtEnd('rect(10, 20, 30, ')!.activeParameter).toBe(3);
    });

    it('clamps to last parameter index', () => {
      // rect has 4 params (x, y, w, h), giving 5th arg should clamp to 3
      expect(sigHelpAtEnd('rect(1, 2, 3, 4, ')!.activeParameter).toBe(3);
    });
  });

  describe('previously-missing functions', () => {
    it('shows signature for radialWedge', () => {
      const result = sigHelpAtEnd('radialWedge(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].label).toContain('radialWedge');
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual([
        'innerR',
        'outerR',
        'fromAngle',
        'toAngle',
        'cornerR',
      ]);
    });

    it('shows signature for sinh', () => {
      const result = sigHelpAtEnd('let y = sinh(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters).toHaveLength(1);
      expect(result!.signatures[0].parameters[0].label).toBe('x');
    });

    it('shows signature for polarX', () => {
      const result = sigHelpAtEnd('let x = polarX(');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].parameters.map((p) => p.label)).toEqual(['cx', 'angle', 'radius']);
    });
  });

  describe('edge cases', () => {
    it('returns null after closing paren', () => {
      expect(sigHelpAtEnd('circle(50, 50, 25)')).toBeNull();
    });

    it('handles whitespace between name and paren', () => {
      const result = sigHelpAtEnd('circle (');
      expect(result).not.toBeNull();
      expect(result!.signatures[0].label).toContain('circle');
    });
  });
});

describe('method signature help', () => {
  /** Get signature help at end of source. */
  function atEnd(source: string) {
    const lines = source.split('\n');
    return getSignatureHelp(new StringTextDocument(source), {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    });
  }

  const BLOCK = 'let b = @{ h 10 v 10 };\n';
  const TEXT = 'let t = &{ text(0, 10)`Hi` };\n';

  it('shows a signature for a method on a receiver', () => {
    const result = atEnd(`${BLOCK}let r = b.rotate(`);
    expect(result).not.toBeNull();
    expect(result!.signatures[0].label).toBe('rotate(angle, origin?)');
    expect(result!.activeParameter).toBe(0);
  });

  it('tracks the active parameter across commas', () => {
    expect(atEnd(`${BLOCK}let r = b.rotate(45deg, `)!.activeParameter).toBe(1);
    expect(atEnd(`${TEXT}let q = t.radialProject(1, 2, `)!.activeParameter).toBe(2);
  });

  it('marks optional parameters', () => {
    // The one detail signature help is uniquely placed to show.
    expect(atEnd(`${TEXT}let q = t.radialProject(`)!.signatures[0].label).toBe(
      'radialProject(cx, cy, angle, distance, anchor?, autoFlip?, verticalAlign?)',
    );
  });

  it('picks the signature belonging to the RECEIVER, not the method name', () => {
    // drawTo takes a rotation on a TextBlock and not on a PathBlock. A flat
    // name-keyed table could not tell these apart.
    expect(atEnd(`${TEXT}let q = t.drawTo(`)!.signatures[0].label).toBe('drawTo(x, y, rotation?)');
    expect(atEnd(`${BLOCK}let r = b.drawTo(`)!.signatures[0].label).toBe('drawTo(x, y)');
  });

  it('does not fall back to a same-named stdlib function', () => {
    // `map` is both a stdlib function (value, inMin, inMax, outMin, outMax) and
    // an array method taking a trailing block. Showing the stdlib one here
    // would describe a different function entirely.
    const result = atEnd('let xs = [1, 2, 3];\nlet r = xs.map(');
    expect(result!.signatures[0].label).toBe('map()');
    expect(result!.signatures[0].label).not.toContain('inMin');
  });

  it('returns null when the receiver type cannot be resolved', () => {
    // Better nothing than a confidently wrong signature.
    expect(atEnd('let r = mystery.whatever(')).toBeNull();
  });

  it('chains through a method return type', () => {
    expect(atEnd(`${TEXT}let q = t.project(0, 0).drawTo(`)!.signatures[0].label).toBe('drawTo(x, y, rotation?)');
  });

  it('reports a valid active parameter for a zero-parameter signature', () => {
    // Math.min(0, -1) used to yield -1, which is not a valid LSP index.
    expect(atEnd('let x = PI(')!.activeParameter).toBe(0);
    expect(atEnd('let xs = [1];\nlet r = xs.map(')!.activeParameter).toBe(0);
  });
});
