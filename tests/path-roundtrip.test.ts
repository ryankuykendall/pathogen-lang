import { describe, expect, it } from 'vitest';
import { compile, compileAnnotated } from '../src/index';
import { compilePath } from './helpers';

/**
 * Phase 0 characterization tests for the draw()/drawTo() serialize→reparse
 * pipeline (commandsToRelativeD → parseAndTrackPathString). These lock the
 * CURRENT byte-level output and context-tracking semantics so the Phase 1
 * refactor (shared path-data module, serializeRelativeAndTrack) can prove
 * behavior parity. Deviations discovered while writing these tests are
 * documented inline — they are existing behavior, not new contracts.
 */

function logValues(source: string): string[] {
  return compile(source).logs.map((l) => l.parts.map((p) => p.value).join(''));
}

describe('path round-trip: draw()', () => {
  it('emits relative commands from the cursor and closes at the subpath start', () => {
    const result = compilePath(`
      let p = @{ h 10 v 10 z };
      M 5 5
      p.draw()
    `);
    expect(result).toBe('M 5 5 h 10 v 10 z');
  });

  it('tracks context through a let-bound draw() (z then trailing command)', () => {
    // `let r = p.draw();` is a standalone statement, so draw()'s context
    // tracking survives: h 10 → v 10 → z (back to 20,20) → h 5 → (25, 20).
    const logs = logValues(`
      let p = @{ h 10 v 10 z h 5 };
      M 20 20
      let r = p.draw();
      log(ctx.position.x); log(ctx.position.y);
    `);
    expect(logs).toEqual(['25', '20']);
  });

  it('CHARACTERIZATION: a bare draw() merges into the preceding path command, whose context update wins', () => {
    // The greedy path-args tokenizer folds `p.draw()` on the next line into the
    // `M 20 20` statement's args. Arg evaluation runs draw() (which tracks the
    // emitted path), but the enclosing M command then applies its OWN context
    // update from its numeric args — clobbering the cursor back to (20, 20).
    // Emission is unaffected; only ctx.position reflects the M target.
    const result = compile(`
      let p = @{ h 10 v 10 z h 5 };
      M 20 20
      p.draw()
      log(ctx.position.x); log(ctx.position.y);
    `);
    expect(result.layers[0].data).toBe('M 20 20 h 10 v 10 z h 5');
    expect(result.logs.map((l) => l.parts[0].value)).toEqual(['20', '20']);
  });

  it('bridges the origin gap for path blocks whose first command starts off-origin (fillet)', () => {
    // fillet(5) shifts the first command's start to (5, 0), so draw() emits a
    // bridge `m 5 0` first (bridgeOriginGap). The float noise
    // (5.000000000000001) comes from the fillet math flowing through formatNum
    // unrounded — locked here byte-for-byte; Phase 1 must reproduce it exactly.
    const result = compilePath(`
      let box = @{ h 60 v 40 h -60 z };
      let f = box.fillet(5);
      M 10 10
      f.draw()
    `);
    expect(result).toBe(
      'M 10 10 m 5.000000000000001 0 l 50 0 a 5 5 0 0 1 5 5.000000000000001 l 0 30 ' +
        'a 5 5 0 0 1 -5 5 l -50 0 a 5 5 0 0 1 -5 -5 l 0 -30 a 5 5 0 0 1 5.000000000000001 -5 z',
    );
  });
});

describe('path round-trip: drawTo()', () => {
  it('prepends an absolute M and tracks the final cursor', () => {
    const result = compile(`
      let p = @{ h 10 v 5 };
      p.drawTo(100, 200);
      log(ctx.position.x); log(ctx.position.y);
    `);
    expect(result.layers[0].data).toBe('M 100 200 h 10 v 5');
    expect(result.logs.map((l) => l.parts[0].value)).toEqual(['110', '205']);
  });

  it('re-projects a ProjectedPath via drawTo (the reProjectedCommands site)', () => {
    const result = compile(`
      let p = @{ h 10 v 5 };
      let proj = p.drawTo(0, 0);
      proj.drawTo(100, 100);
      log(ctx.position.x); log(ctx.position.y);
    `);
    expect(result.layers[0].data).toBe('M 0 0 h 10 v 5 M 100 100 h 10 v 5');
    expect(result.logs.map((l) => l.parts[0].value)).toEqual(['110', '105']);
  });

  it('emits full-precision numbers via formatNum (no rounding by default)', () => {
    const result = compile(`
      let p = @{ h 10.123456789 };
      p.drawTo(1.234567891, 2);
      log(ctx.position.x);
    `);
    expect(result.layers[0].data).toBe('M 1.234567891 2 h 10.123456789');
    expect(result.logs[0].parts[0].value).toBe('11.35802468');
  });
});

describe('path round-trip: annotated-mode divergences (locked, to converge deliberately in Phase 1)', () => {
  it('CHARACTERIZATION: annotated draw() does NOT bridge the origin gap and rounds via toFixed(4)', () => {
    // annotated.ts has its own naive commandsToRelativeD: no bridgeOriginGap
    // (the `m 5 0` bridge from the normal evaluator is absent — the filleted
    // shape starts at the wrong point relative to the cursor) and numbers are
    // toFixed(4)-trimmed (`5` instead of `5.000000000000001`). Both are
    // existing divergences from the normal evaluator, locked here so Phase 1's
    // adoption of the shared serializer changes them only deliberately.
    const output = compileAnnotated(`
      let box = @{ h 60 v 40 h -60 z };
      let f = box.fillet(5);
      M 10 10
      f.draw()
    `);
    // Byte-locked: note the missing `m 5 0` bridge after the header line, and
    // `5` where the normal evaluator emits `5.000000000000001`.
    expect(output).toBe(
      'M 10 10\n//--- f.draw() called from line 5\n  l 50 0\n  a 5 5 0 0 1 5 5\n  l 0 30\n' +
        '  a 5 5 0 0 1 -5 5\n  l -50 0\n  a 5 5 0 0 1 -5 -5\n  l 0 -30\n  a 5 5 0 0 1 5 -5\n  z',
    );
  });

  it('CHARACTERIZATION: annotated drawTo() rounds M coords with toFixed(4)', () => {
    const output = compileAnnotated(`
      let p = @{ h 10.123456789 };
      p.drawTo(1.234567891, 2);
    `);
    expect(output).toContain('M 1.2346 2');
    expect(output).toContain('h 10.1235');
  });
});
