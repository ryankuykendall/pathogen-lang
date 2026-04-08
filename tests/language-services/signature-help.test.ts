import { describe, it, expect } from 'vitest';
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
        'innerR', 'outerR', 'fromAngle', 'toAngle', 'cornerR',
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
