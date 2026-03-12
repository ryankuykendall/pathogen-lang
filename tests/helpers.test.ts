import { describe, expect, it } from 'vitest';

import { extractSVGCommands, expectSVGPathCommandSequence, parseSVGPath, svgPath } from './helpers';

describe('Test Utilities', () => {
  describe('parseSVGPath', () => {
    it('parses simple M L Z path', () => {
      const result = parseSVGPath('M 0 0 L 100 0 L 100 50 L 0 50 Z');
      expect(result).toEqual([
        { command: 'M', args: [0, 0] },
        { command: 'L', args: [100, 0] },
        { command: 'L', args: [100, 50] },
        { command: 'L', args: [0, 50] },
        { command: 'Z', args: [] },
      ]);
    });

    it('handles negative numbers without space separator', () => {
      const result = parseSVGPath('M 10-20 L-5-10');
      expect(result).toEqual([
        { command: 'M', args: [10, -20] },
        { command: 'L', args: [-5, -10] },
      ]);
    });

    it('handles scientific notation', () => {
      const result = parseSVGPath('M 1.5e2 -3.14e-1');
      expect(result).toEqual([
        { command: 'M', args: [150, -0.314] },
      ]);
    });

    it('handles Z without args', () => {
      const result = parseSVGPath('M 0 0 L 10 10 Z');
      expect(result[2]).toEqual({ command: 'Z', args: [] });
    });

    it('parses arc commands with flags', () => {
      const result = parseSVGPath('A 50 50 0 1 1 150 100');
      expect(result).toEqual([
        { command: 'A', args: [50, 50, 0, 1, 1, 150, 100] },
      ]);
    });

    it('parses lowercase (relative) commands', () => {
      const result = parseSVGPath('m 0 0 l 10 20 h 30 v 40 z');
      expect(result).toEqual([
        { command: 'm', args: [0, 0] },
        { command: 'l', args: [10, 20] },
        { command: 'h', args: [30] },
        { command: 'v', args: [40] },
        { command: 'z', args: [] },
      ]);
    });

    it('parses quadratic curves', () => {
      const result = parseSVGPath('Q 50 100 100 0');
      expect(result).toEqual([
        { command: 'Q', args: [50, 100, 100, 0] },
      ]);
    });

    it('parses cubic curves', () => {
      const result = parseSVGPath('C 10 20 30 40 50 60');
      expect(result).toEqual([
        { command: 'C', args: [10, 20, 30, 40, 50, 60] },
      ]);
    });

    it('handles comma-separated args', () => {
      const result = parseSVGPath('M 10,20 L 30,40');
      expect(result).toEqual([
        { command: 'M', args: [10, 20] },
        { command: 'L', args: [30, 40] },
      ]);
    });

    it('handles decimal numbers without leading digit', () => {
      const result = parseSVGPath('M .5 .25');
      expect(result).toEqual([
        { command: 'M', args: [0.5, 0.25] },
      ]);
    });

    it('handles consecutive commands without space', () => {
      const result = parseSVGPath('M0 0L10 10Z');
      expect(result).toEqual([
        { command: 'M', args: [0, 0] },
        { command: 'L', args: [10, 10] },
        { command: 'Z', args: [] },
      ]);
    });
  });

  describe('svgPath / extractSVGCommands aliases', () => {
    it('svgPath is an alias for parseSVGPath', () => {
      const d = 'M 0 0 L 10 20';
      expect(svgPath(d)).toEqual(parseSVGPath(d));
    });

    it('extractSVGCommands is an alias for parseSVGPath', () => {
      const d = 'M 0 0 L 10 20';
      expect(extractSVGCommands(d)).toEqual(parseSVGPath(d));
    });
  });

  describe('expectSVGPathCommandSequence', () => {
    it('passes for exact match', () => {
      expectSVGPathCommandSequence('M 0 0 L 100 0 Z', [
        ['M', 0, 0],
        ['L', 100, 0],
        ['Z'],
      ]);
    });

    it('fails for wrong command count', () => {
      expect(() => {
        expectSVGPathCommandSequence('M 0 0 L 100 0', [['M', 0, 0]]);
      }).toThrow();
    });

    it('fails for wrong command type', () => {
      expect(() => {
        expectSVGPathCommandSequence('M 0 0 L 100 0', [
          ['M', 0, 0],
          ['H', 100],
        ]);
      }).toThrow(/mismatch/i);
    });

    it('fails for wrong coordinate value', () => {
      expect(() => {
        expectSVGPathCommandSequence('M 0 0 L 100 0', [
          ['M', 0, 0],
          ['L', 200, 0],
        ]);
      }).toThrow(/mismatch/i);
    });

    it('respects precision option', () => {
      // With precision 2, difference of 0.001 is within tolerance
      expectSVGPathCommandSequence('M 0.001 0', [['M', 0, 0]], { precision: 2 });
    });

    it('fails when precision is exceeded', () => {
      expect(() => {
        // With precision 4, difference of 0.1 exceeds tolerance
        expectSVGPathCommandSequence('M 0.1 0', [['M', 0, 0]], { precision: 4 });
      }).toThrow(/mismatch/i);
    });
  });

  describe('custom matchers', () => {
    describe('toMatchSVGPath', () => {
      it('matches exact path', () => {
        expect('M 0 0 L 100 0 Z').toMatchSVGPath(svgPath('M 0 0 L 100 0 Z'));
      });

      it('fails on mismatch', () => {
        expect(() => {
          expect('M 0 0 L 100 0').toMatchSVGPath(svgPath('M 0 0 L 200 0'));
        }).toThrow();
      });

      it('respects precision option', () => {
        expect('M 0.001 0').toMatchSVGPath(svgPath('M 0 0'), { precision: 2 });
      });
    });

    describe('toContainSVGCommands', () => {
      it('matches command sequence', () => {
        expect('M 0 0 L 10 10 A 5 5 0 1 1 20 20 Z').toContainSVGCommands(['M', 'L', 'A', 'Z']);
      });

      it('matches subsequence (not necessarily consecutive)', () => {
        expect('M 0 0 L 10 10 L 20 20 Z').toContainSVGCommands(['M', 'Z']);
      });

      it('fails when command is missing', () => {
        expect(() => {
          expect('M 0 0 L 10 10').toContainSVGCommands(['M', 'A']);
        }).toThrow();
      });

      it('fails when order is wrong', () => {
        expect(() => {
          expect('L 10 10 M 0 0').toContainSVGCommands(['M', 'L']);
        }).toThrow();
      });
    });

    describe('toHaveSVGCommandCount', () => {
      it('counts exact occurrences', () => {
        expect('M 0 0 L 10 0 L 10 10 L 0 10 Z').toHaveSVGCommandCount('L', 3);
      });

      it('case-insensitive matching', () => {
        expect('m 0 0 l 10 10 z').toHaveSVGCommandCount('Z', 1);
      });

      it('fails on wrong count', () => {
        expect(() => {
          expect('M 0 0 L 10 0 L 10 10 Z').toHaveSVGCommandCount('L', 5);
        }).toThrow();
      });
    });

    describe('toClosePath', () => {
      it('passes when path ends with Z', () => {
        expect('M 0 0 L 10 0 L 10 10 Z').toClosePath();
      });

      it('passes when path ends with z', () => {
        expect('M 0 0 l 10 0 l 0 10 z').toClosePath();
      });

      it('fails when path does not end with Z/z', () => {
        expect(() => {
          expect('M 0 0 L 10 10').toClosePath();
        }).toThrow();
      });
    });
  });
});
