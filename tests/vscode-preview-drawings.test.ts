/**
 * 2f: when VS Code's program list draws its programs small
 * (packages/vscode-pathogen/src/preview-drawings.ts), by the playground's
 * rules: only what a change reaches, once the typing stops, one at a time, a
 * draw in flight stopped by an edit to it, nothing before the preview has
 * shown its program, and the program shown only while the list is open.
 * The drawing thread is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DrawCancelled, PROGRAMS_DELAY_MS, ProgramDrawings } from '../packages/vscode-pathogen/src/preview-drawings';
import { PROGRAMS_DELAY_MS as PLAYGROUND_DELAY_MS } from '../playground/services/program-drawings.js';

import type { DrawResult } from '../packages/vscode-pathogen/src/program-drawing';

const MAIN = '/p/main.pathogen';
const TRAIN = '/p/demos/train.pathogen';
const TRY = '/p/try-sizes.pathogen';
const GEARS = '/p/parts/gears.pathogen';

interface Pending {
  program: string;
  resolve: (r: DrawResult) => void;
  reject: (e: unknown) => void;
}

function harness(options: { shown?: string; uses?: Record<string, string[]> } = {}) {
  const pending: Pending[] = [];
  const drawn: string[] = [];
  let listOpen = false;
  let changes = 0;
  const uses = options.uses ?? { [MAIN]: [GEARS], [TRY]: [GEARS], [TRAIN]: [] };
  const drawings = new ProgramDrawings({
    draw: (program) =>
      new Promise<DrawResult>((resolve, reject) => {
        drawn.push(program);
        pending.push({ program, resolve, reject });
      }),
    cancel: () => {
      const p = pending.shift();
      p?.reject(new DrawCancelled());
    },
    openTexts: () => [],
    programs: () => [MAIN, TRAIN, TRY],
    shown: () => options.shown ?? MAIN,
    listOpen: () => listOpen,
    changed: () => void changes++,
  });
  /** Finish the draw in flight. */
  const finish = async (extra: Partial<DrawResult> = {}): Promise<string> => {
    const p = pending.shift()!;
    p.resolve({ error: null, miniature: `data:${p.program}`, tooLarge: false, files: uses[p.program] ?? [], ...extra });
    await vi.advanceTimersByTimeAsync(0);
    return p.program;
  };
  return {
    drawings,
    drawn,
    pending,
    finish,
    open: (v: boolean) => (listOpen = v),
    changes: () => changes,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProgramDrawings', () => {
  it("waits the playground's pause after typing", () => {
    expect(PROGRAMS_DELAY_MS).toBe(PLAYGROUND_DELAY_MS);
  });

  it('nothing is drawn before the preview has shown its program; then the others, in order, one at a time', async () => {
    const h = harness();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.drawn).toEqual([]);
    expect(h.drawings.row(TRAIN)).toBeUndefined();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.drawn).toEqual([TRAIN]);
    // Not drawn yet: it spins on a blank tile.
    expect(h.drawings.row(TRY)).toMatchObject({ miniature: null, updating: true });
    await h.finish();
    expect(h.drawn).toEqual([TRAIN, TRY]);
    await h.finish();
    expect(h.pending).toEqual([]);
    expect(h.drawings.row(TRAIN)).toEqual({
      error: null,
      miniature: `data:${TRAIN}`,
      updating: false,
      files: [],
      tooLarge: false,
    });
  });

  it('the program shown is drawn small only while the list is open', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    await h.finish();
    expect(h.drawn).not.toContain(MAIN);
    h.open(true);
    h.drawings.listOpened();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.drawn.at(-1)).toBe(MAIN);
  });

  it('a change reaches only the rows that read the file: they spin at once, and are drawn once the typing stops', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    await h.finish();
    h.drawn.length = 0;
    h.drawings.touched(GEARS);
    expect([h.drawings.row(TRY)?.updating, h.drawings.row(TRAIN)?.updating]).toEqual([true, false]);
    // The old miniature stays under the spinner.
    expect(h.drawings.row(TRY)?.miniature).toBe(`data:${TRY}`);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS - 1);
    h.drawings.touched(GEARS);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS - 1);
    expect(h.drawn).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.drawn).toEqual([TRY]);
    await h.finish();
    expect(h.drawn).toEqual([TRY]);
    expect(h.drawings.row(TRY)?.updating).toBe(false);
  });

  it('an edit to the program being drawn stops that draw; it is drawn again after the pause', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.drawn).toEqual([TRAIN]);
    h.drawings.touched(TRAIN);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.pending).toEqual([]);
    expect(h.drawings.row(TRAIN)?.updating).toBe(true);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    expect(h.drawn).toEqual([TRAIN, TRAIN]);
  });

  it("an edit to a file the program being drawn imports stops it too; an edit it doesn't read lets it finish", async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    await h.finish();
    h.drawings.touched(GEARS);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    expect(h.pending.map((p) => p.program)).toEqual([TRY]);
    h.drawings.touched(GEARS);
    expect(h.pending.map((p) => p.program)).toEqual([]);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    expect(h.pending.map((p) => p.program)).toEqual([TRY]);
    // try-sizes doesn't read train: its draw goes on, and train waits for the pause.
    h.drawings.touched(TRAIN);
    expect(h.pending.map((p) => p.program)).toEqual([TRY]);
    await h.finish();
    expect(h.drawings.row(TRY)?.updating).toBe(false);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    expect(h.pending.map((p) => p.program)).toEqual([TRAIN]);
  });

  it('a row with an error: any change may fix it (a file it was missing), so any change redraws it', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish({ error: 'Error in demos/train.pathogen line 2', files: [] });
    await h.finish();
    expect(h.drawings.row(TRAIN)?.error).toBe('Error in demos/train.pathogen line 2');
    h.drawings.touched('/p/parts/new.pathogen');
    expect([h.drawings.row(TRAIN)?.updating, h.drawings.row(TRY)?.updating]).toEqual([true, false]);
  });

  it('a program that starts failing keeps its last drawing under the error; too large to draw small blanks it', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    await h.finish();
    h.drawings.touched(TRAIN);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    await h.finish({ error: 'Error in demos/train.pathogen line 3', miniature: null });
    expect(h.drawings.row(TRAIN)).toMatchObject({
      error: 'Error in demos/train.pathogen line 3',
      miniature: `data:${TRAIN}`,
    });
    h.drawings.touched(TRAIN);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS);
    await h.finish({ miniature: null, tooLarge: true });
    expect(h.drawings.row(TRAIN)).toMatchObject({ error: null, miniature: null, tooLarge: true });
  });

  it('touched(null) (pathogen.json changed): every row', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    await h.finish();
    h.drawings.touched(null);
    expect([h.drawings.row(TRAIN)?.updating, h.drawings.row(TRY)?.updating]).toEqual([true, true]);
  });

  it('a draw that fails for another reason (the thread): a blank tile, not spinning, tried again after a change', async () => {
    const h = harness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    h.pending.shift()!.reject(new Error('worker exited'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.drawings.row(TRAIN)).toEqual({
      error: null,
      miniature: null,
      updating: false,
      files: null,
      tooLarge: false,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a program that left the list is forgotten', async () => {
    let programs = [MAIN, TRAIN, TRY];
    const drawings = new ProgramDrawings({
      draw: async (program) => ({ error: null, miniature: `data:${program}`, tooLarge: false, files: [] }),
      cancel: () => undefined,
      openTexts: () => [],
      programs: () => programs,
      shown: () => MAIN,
      listOpen: () => false,
      changed: () => undefined,
    });
    drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(drawings.row(TRY)?.miniature).toBe(`data:${TRY}`);
    programs = [MAIN, TRAIN];
    drawings.listChanged();
    expect(drawings.row(TRY)).toMatchObject({ miniature: null, updating: true });
  });

  it('after dispose, nothing more is drawn and a draw in flight is stopped', async () => {
    const h = harness();
    h.drawings.start();
    await vi.advanceTimersByTimeAsync(0);
    h.drawings.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.pending).toEqual([]);
    h.drawings.touched(GEARS);
    await vi.advanceTimersByTimeAsync(PROGRAMS_DELAY_MS * 2);
    expect(h.drawn).toEqual([TRAIN]);
  });
});
