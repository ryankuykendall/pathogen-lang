// @vitest-environment jsdom
//
// Every program in the chip's list, drawn small (phase 2d, step 5b; mockup v6
// screen G). services/program-drawings.ts with a fake compiler and fake timers:
// what's compiled and when, the rows (error, spinner, imports), the
// miniatures (only while the list is open), and what a workspace switch, a
// move and a delete do to it. The pure parts run the real engine.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compile, generateSvg } from '../src';
import {
  drawingOf,
  MINIATURE_MAX_CHARS,
  ProgramDrawings,
  withBackground,
} from '../playground/services/program-drawings.js';

import type { Drawing, ProgramDrawingsDeps } from '../playground/services/program-drawings.js';
import type { Change } from '../playground/services/workspace-edits.js';
import type { CompileResult } from '../playground/types/compiler.js';

describe('drawingOf and withBackground (the real engine)', () => {
  const SOURCE = [
    "let wheel = ConicGradient('wheel', 100, 100) {|g|",
    "  g.stop(0, Color('#e63946'));",
    "  g.stop(1, Color('#264653'));",
    '};',
    'circle(100, 100, 40);',
    "let labels = TextLayer('labels') #{ font-size: 14; };",
    'labels.apply { text(10, 30)`Hi`; }',
    "let ring = PathLayer('ring') #{ fill: wheel; };",
    'ring.apply { circle(100, 100, 30); }',
  ].join('\n');

  it('keeps what draws: the same SVG as the whole result, without records or commands', () => {
    const result = compile(SOURCE, { trace: true });
    // A compile result crosses from the worker by structured clone.
    const cloned = structuredClone(result) as unknown as CompileResult;
    const drawing = drawingOf(cloned)!;
    expect(drawing.layers.some((l) => 'records' in l || 'commands' in l)).toBe(false);
    expect(generateSvg(drawing as never)).toBe(generateSvg(result));
  });

  it('keeps the drawing’s box, from define ViewBox', () => {
    const drawing = drawingOf(compile('define ViewBox(-50, -20, 300, 100);\nM 0 0 L 10 10') as never)!;
    expect(drawing.viewBox).toEqual({ originX: -50, originY: -20, width: 300, height: 100 });
  });

  it('a drawing too large to draw small: none', () => {
    const big = `M 0 0 ${'L 123.456 789.012 '.repeat(Math.ceil(MINIATURE_MAX_CHARS / 18) + 10)}`;
    expect(drawingOf(compile(big) as never)).toBeNull();
    expect(drawingOf(compile('M 0 0 L 10 10') as never)).not.toBeNull();
  });

  it('puts the canvas colour behind the drawing, over its box only', () => {
    const svg = generateSvg(compile('define ViewBox(-50, -20, 300, 100);\nM 0 0 L 10 10'));
    const out = withBackground(svg, '#f5f5f5', { originX: -50, originY: -20, width: 300, height: 100 });
    const open = svg.slice(0, svg.indexOf('>') + 1);
    expect(out.startsWith(`${open}<rect x="-50" y="-20" width="300" height="100" fill="#f5f5f5"/>`)).toBe(true);
    expect(out.slice(open.length).replace(/^<rect[^>]*\/>/, '')).toBe(svg.slice(open.length));
  });

  it("a colour can't break out of its attribute", () => {
    const out = withBackground('<svg viewBox="0 0 1 1"></svg>', '"><script>', {
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
    });
    expect(out).toBe('<svg viewBox="0 0 1 1"><rect x="0" y="0" width="1" height="1" fill="&quot;>&lt;script>"/></svg>');
  });
});

// ---------- the scheduler, with fakes ----------

interface PendingCompile {
  program: string;
  text: string | undefined;
  resolve: (result: CompileResult) => void;
  reject: (err: unknown) => void;
}

const MAIN = 'main.pathogen';
const GEARS_DEMO = 'demos/gears.pathogen';
const TRY = 'try-sizes.pathogen';
const GEARS_LIB = 'parts/gears.pathogen';
const KIT = 'parts/kit.pathogen';

/** A result whose one layer draws the program's text, so a test can tell which text a miniature came from. */
const resultFor = (text: string | undefined): CompileResult =>
  ({
    layers: [{ name: 'default', type: 'path', data: `M ${text ?? ''}`, styles: {}, isDefault: true, records: [] }],
    masks: [],
    clipPaths: [],
    gradients: [],
    patterns: [],
    markers: [],
    filters: [],
    cssProperties: [],
    logs: [],
    warnings: [],
    calledStdlibFunctions: [],
  }) as unknown as CompileResult;

function harness() {
  const texts = new Map<string, string>([
    [MAIN, 'main: gear'],
    [GEARS_DEMO, 'demo: gear'],
    [TRY, 'try: kit'],
    [GEARS_LIB, 'module; gear'],
    [KIT, 'module; kit uses gear'],
  ]);
  // What each program's imports reach (main and the demo use gears; try-sizes uses kit, which uses gears).
  const graphs: Record<string, string[]> = {
    [MAIN]: [GEARS_LIB],
    [GEARS_DEMO]: [GEARS_LIB],
    [TRY]: [KIT, GEARS_LIB],
  };
  const state = {
    programs: [MAIN, GEARS_DEMO, TRY],
    shown: MAIN as string | null,
    busy: false,
    listOpen: false,
    background: '#f5f5f5',
    /** Hold each graph read until a test lets it go (heldGraphs). */
    holdGraphs: false,
  };
  const heldGraphs: (() => void)[] = [];
  const pending: PendingCompile[] = [];
  const compiled: string[] = [];
  let urls = 0;
  const live = new Set<string>();
  const deps: ProgramDrawingsDeps = {
    workspace: () => ({ texts: new Map(texts), folders: [], entryPoints: state.programs, openFile: null }),
    programs: () => state.programs,
    shown: () => state.shown,
    busy: () => state.busy,
    listOpen: () => state.listOpen,
    background: () => state.background,
    graph: async (program) => {
      if (state.holdGraphs) await new Promise<void>((resolve) => heldGraphs.push(resolve));
      return { files: graphs[program] ?? [], complete: true };
    },
    compile: (program, workspace) =>
      new Promise<CompileResult>((resolve, reject) => {
        compiled.push(program);
        pending.push({ program, text: workspace.texts.get(program), resolve, reject });
      }),
    cancel: vi.fn(() => {
      for (const p of pending.splice(0))
        p.reject(Object.assign(new Error('Compile cancelled (superseded)'), { name: 'CompileCancelled' }));
    }),
    generate: vi.fn((d: Drawing) => `<svg viewBox="0 0 200 200">${d.layers.map((l) => l.data).join('|')}</svg>`),
    url: vi.fn((svg: string) => {
      const url = `blob:${++urls}`;
      live.add(url);
      (deps as unknown as { svgs: Map<string, string> }).svgs.set(url, svg);
      return url;
    }),
    revoke: vi.fn((url: string) => live.delete(url)),
    changed: vi.fn(),
    delayMs: 100,
  };
  (deps as unknown as { svgs: Map<string, string> }).svgs = new Map();
  const drawings = new ProgramDrawings(deps);
  /** Settle the first compile waiting, with its text's drawing, or fail it. */
  const finish = async (outcome: 'ok' | string = 'ok'): Promise<string> => {
    const next = pending.shift();
    if (!next) throw new Error('no compile is waiting');
    if (outcome === 'ok') next.resolve(resultFor(next.text));
    else next.reject(new Error(outcome));
    await vi.advanceTimersByTimeAsync(0);
    return next.program;
  };
  const svgOf = (url: string | null): string | undefined =>
    url === null ? undefined : (deps as unknown as { svgs: Map<string, string> }).svgs.get(url);
  /** The editor compiled the program shown. */
  const shownCompiled = async (outcome: 'ok' | string = 'ok'): Promise<void> => {
    const workspace = deps.workspace();
    drawings.shownDrawn(
      state.shown!,
      workspace,
      outcome === 'ok' ? { result: resultFor(workspace.texts.get(state.shown!)) } : { message: outcome },
    );
    await vi.advanceTimersByTimeAsync(0);
  };
  const edit = async (path: string, text: string): Promise<void> => {
    texts.set(path, text);
    drawings.edited();
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    texts,
    graphs,
    state,
    heldGraphs,
    pending,
    compiled,
    live,
    deps,
    drawings,
    finish,
    svgOf,
    shownCompiled,
    edit,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

/** Let the miniatures be drawn: one per task, and a fake timer set inside another runs 1 ms later. */
const tasks = (): Promise<unknown> => vi.advanceTimersByTimeAsync(10);

afterEach(() => {
  vi.useRealTimers();
});

describe('what is compiled, and when', () => {
  it('nothing before the program shown has compiled; then the others, one at a time, in the list’s order', async () => {
    const h = harness();
    h.drawings.edited();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([]);
    await h.shownCompiled();
    expect(h.compiled).toEqual([GEARS_DEMO]);
    expect(await h.finish()).toBe(GEARS_DEMO);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
    await h.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
  });

  it('every row spins until drawn, except the one shown; each says what its imports reach', async () => {
    const h = harness();
    expect([...h.drawings.rows()].map(([p, r]) => [p, r.updating])).toEqual([
      [MAIN, false],
      [GEARS_DEMO, true],
      [TRY, true],
    ]);
    await h.shownCompiled();
    await h.finish();
    const rows = h.drawings.rows();
    expect([rows.get(GEARS_DEMO)!.updating, rows.get(TRY)!.updating]).toEqual([false, true]);
    expect(rows.get(TRY)!.files).toEqual([KIT, GEARS_LIB]);
    expect(rows.get(MAIN)!.files).toEqual([GEARS_LIB]);
  });

  it('an edit to kit: only try-sizes spins at once, and only it is compiled once the typing stops', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await h.edit(KIT, 'module; kit, edited');
    const rows = h.drawings.rows();
    expect([rows.get(MAIN)!.updating, rows.get(GEARS_DEMO)!.updating, rows.get(TRY)!.updating]).toEqual([
      false,
      false,
      true,
    ]);
    await vi.advanceTimersByTimeAsync(99);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY, TRY]);
    await h.finish();
    expect(h.drawings.rows().get(TRY)!.updating).toBe(false);
  });

  it('an edit to gears redraws both programs not shown; the main, shown, is the editor’s', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await h.edit(GEARS_LIB, 'module; gear, edited');
    await vi.advanceTimersByTimeAsync(100);
    await h.finish();
    await h.finish();
    expect(h.compiled).toEqual([GEARS_DEMO, TRY, GEARS_DEMO, TRY]);
  });

  it('typing again while a program compiles: when the typing stops, that compile is stopped and run again on the new text', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await h.edit(GEARS_DEMO, 'demo: one');
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pending.map((p) => p.text)).toEqual(['demo: one']);
    await h.edit(GEARS_DEMO, 'demo: two');
    // Not per keystroke: the compile in flight is stopped only once the typing stops.
    expect(h.deps.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.deps.cancel).toHaveBeenCalledTimes(1);
    expect(h.pending.map((p) => p.text)).toEqual(['demo: two']);
    await h.finish();
    expect(h.drawings.rows().get(GEARS_DEMO)!.updating).toBe(false);
  });

  it('an edit elsewhere leaves the compile in flight alone', async () => {
    const h = harness();
    await h.shownCompiled();
    expect(h.pending.map((p) => p.program)).toEqual([GEARS_DEMO]);
    await h.edit(MAIN, 'main: edited');
    await vi.advanceTimersByTimeAsync(100);
    expect(h.deps.cancel).not.toHaveBeenCalled();
    expect(await h.finish()).toBe(GEARS_DEMO);
  });

  it('never while the editor compiles: the next compile of the program shown starts them again', async () => {
    const h = harness();
    h.state.busy = true;
    await h.shownCompiled();
    expect(h.compiled).toEqual([]);
    h.state.busy = false;
    await h.shownCompiled();
    expect(h.compiled).toEqual([GEARS_DEMO]);
  });

  it('the editor’s compile cancelled (its Cancel): the programs not shown go on, at a load too', async () => {
    const h = harness();
    h.state.busy = true;
    h.drawings.edited();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([]);
    h.state.busy = false;
    h.drawings.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.compiled).toEqual([GEARS_DEMO]);
  });

  it('nothing with fewer than two programs', async () => {
    const h = harness();
    h.state.programs = [MAIN];
    await h.shownCompiled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([]);
  });

  it('a program shown, then another: the first keeps the drawing the editor made, and isn’t compiled again', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    h.state.shown = TRY;
    await h.shownCompiled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
    expect(h.drawings.rows().get(MAIN)!.updating).toBe(false);
  });
});

describe('the rows’ errors', () => {
  it('a failed compile: where it failed, as "Error in … line N"; fixed, it goes', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish(
      'parts/gears.pathogen line 9, col 3: Array index 5 out of bounds (length 2)\n  called from demos/gears.pathogen line 2',
    );
    expect(h.drawings.rows().get(GEARS_DEMO)).toMatchObject({
      error: 'Error in parts/gears.pathogen line 9',
      updating: false,
    });
    await h.finish();
    await h.edit(GEARS_LIB, 'module; gear, fixed');
    await vi.advanceTimersByTimeAsync(100);
    await h.finish();
    expect(h.drawings.rows().get(GEARS_DEMO)!.error).toBeNull();
  });

  it('the program shown: its error from the editor’s compile, read the same way', async () => {
    const h = harness();
    await h.shownCompiled('Line 4, col 1: circle() expects 3 arguments, got 1');
    expect(h.drawings.rows().get(MAIN)!.error).toBe('Error in main.pathogen line 4');
  });

  it('a failed program is compiled again when a file appears (an import that was missing)', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish('Line 1, col 19: import file "./parts/springs.pathogen" was not found.');
    await h.finish();
    h.texts.set('parts/springs.pathogen', 'module; springs');
    h.drawings.edited();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY, GEARS_DEMO]);
  });

  it('a stopped compile is no error: the row keeps spinning, and the next run draws it', async () => {
    const h = harness();
    await h.shownCompiled();
    h.deps.cancel();
    await vi.advanceTimersByTimeAsync(0);
    const row = h.drawings.rows().get(GEARS_DEMO)!;
    expect([row.error, row.updating]).toEqual([null, true]);
    // The run goes on: the same program again.
    expect(h.pending.map((p) => p.program)).toEqual([GEARS_DEMO]);
  });
});

describe('the miniatures', () => {
  it('none while the list is closed; once it opens, one per task, each on the canvas colour', async () => {
    const h = harness();
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    expect(h.deps.generate).not.toHaveBeenCalled();
    expect([...h.drawings.rows().values()].map((r) => r.miniature)).toEqual([null, null, null]);
    h.state.listOpen = true;
    h.drawings.listOpened();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.deps.generate).toHaveBeenCalledTimes(1);
    // The next ones, each in a task of its own (a fake timer set inside another runs 1 ms later).
    await vi.advanceTimersByTimeAsync(1);
    expect(h.deps.generate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5);
    expect(h.deps.generate).toHaveBeenCalledTimes(3);
    const rows = h.drawings.rows();
    expect(h.svgOf(rows.get(MAIN)!.miniature)).toBe(
      '<svg viewBox="0 0 200 200"><rect x="0" y="0" width="200" height="200" fill="#f5f5f5"/>M main: gear</svg>',
    );
    expect(h.svgOf(rows.get(TRY)!.miniature)).toContain('M try: kit');
    expect(h.deps.changed).toHaveBeenCalled();
  });

  it('a redraw keeps the old miniature until the new one is made, then releases it', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await tasks();
    const before = h.drawings.rows().get(GEARS_DEMO)!.miniature!;
    await h.edit(GEARS_DEMO, 'demo: edited');
    expect(h.drawings.rows().get(GEARS_DEMO)!.miniature).toBe(before);
    await vi.advanceTimersByTimeAsync(100);
    await h.finish();
    await tasks();
    const after = h.drawings.rows().get(GEARS_DEMO)!.miniature!;
    expect([after === before, h.live.has(before), h.svgOf(after)?.includes('M demo: edited')]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('a new canvas colour wraps the same drawings again, with no compile', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await tasks();
    const generated = vi.mocked(h.deps.generate).mock.calls.length;
    h.state.background = '#202020';
    h.drawings.listOpened();
    await tasks();
    expect(h.svgOf(h.drawings.rows().get(MAIN)!.miniature)).toContain('fill="#202020"');
    expect(vi.mocked(h.deps.generate).mock.calls.length).toBe(generated);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
  });

  it('a drawing too large to draw small: a blank tile, the old miniature released', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await tasks();
    const before = h.drawings.rows().get(GEARS_DEMO)!.miniature!;
    await h.edit(GEARS_DEMO, 'x'.repeat(MINIATURE_MAX_CHARS + 1));
    await vi.advanceTimersByTimeAsync(100);
    await h.finish();
    const row = h.drawings.rows().get(GEARS_DEMO)!;
    expect([row.miniature, row.error, row.updating, h.live.has(before)]).toEqual([null, null, false, false]);
  });
});

describe('a switch, a move, a delete', () => {
  it('a workspace switch: the compile in flight is stopped and dropped, every URL released, nothing runs until the next one compiles', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await tasks();
    expect(h.live.size).toBeGreaterThan(0);
    expect(h.pending.map((p) => p.program)).toEqual([TRY]);
    h.drawings.reset();
    expect(h.deps.cancel).toHaveBeenCalledTimes(1);
    expect(h.live.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
    expect([...h.drawings.rows().values()].map((r) => r.miniature)).toEqual([null, null, null]);
  });

  it('a switch while a graph is being read: the next workspace’s run still starts (code review, 5b)', async () => {
    const h = harness();
    h.state.holdGraphs = true;
    await h.shownCompiled();
    expect(h.heldGraphs.length).toBe(1);
    h.drawings.reset();
    // The next workspace: its program shown compiles, while the old read is still out.
    h.state.holdGraphs = false;
    await h.shownCompiled();
    expect(h.compiled).toEqual([GEARS_DEMO]);
    // The old read comes back: it changes nothing, and the run goes on.
    h.heldGraphs.shift()!();
    await vi.advanceTimersByTimeAsync(0);
    await h.finish();
    expect(h.compiled).toEqual([GEARS_DEMO, TRY]);
  });

  it('the editor’s compile from before a switch lands nowhere, and doesn’t start the next workspace’s run', async () => {
    const h = harness();
    const before = h.drawings.session;
    h.drawings.reset();
    h.drawings.shownDrawn(MAIN, h.deps.workspace(), { result: resultFor('old') }, before);
    await vi.advanceTimersByTimeAsync(1000);
    expect([h.compiled, h.drawings.rows().get(MAIN)!.miniature]).toEqual([[], null]);
  });

  it('a program deleted while its graph is read: no row made for it', async () => {
    const h = harness();
    // try-sizes shown, so main (first in the list, its graph read first) has no row yet.
    h.state.shown = TRY;
    h.state.holdGraphs = true;
    await h.shownCompiled();
    h.texts.delete(MAIN);
    h.state.programs = [GEARS_DEMO, TRY];
    h.state.holdGraphs = false;
    h.heldGraphs.shift()!();
    await vi.advanceTimersByTimeAsync(0);
    expect((h.drawings as unknown as { _entries: Map<string, unknown> })._entries.has(MAIN)).toBe(false);
  });

  it('a compile that finishes after a switch lands nowhere', async () => {
    const h = harness();
    await h.shownCompiled();
    const late = h.pending.shift()!;
    h.drawings.reset();
    late.resolve(resultFor('old workspace'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.drawings.rows().get(GEARS_DEMO)).toMatchObject({ error: null, miniature: null, updating: true });
  });

  it('a program renamed while it compiles: that result is dropped; its row and miniature follow the new name', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await tasks();
    const miniature = h.drawings.rows().get(GEARS_DEMO)!.miniature;
    expect(miniature).not.toBeNull();
    // try-sizes is compiling; demos/gears is renamed to demos/cogs.
    const change: Change = {
      steps: [{ kind: 'move', from: GEARS_DEMO, to: 'demos/cogs.pathogen' }],
      importsUpdated: [],
    } as unknown as Change;
    // As workspace-view makes it: the store update (which calls edited()) first, then follow().
    h.texts.set('demos/cogs.pathogen', h.texts.get(GEARS_DEMO)!);
    h.texts.delete(GEARS_DEMO);
    h.state.programs = [MAIN, 'demos/cogs.pathogen', TRY];
    h.drawings.edited();
    h.drawings.follow(change);
    await h.finish();
    expect(h.live.has(miniature!)).toBe(true);
    const rows = h.drawings.rows();
    expect(rows.get('demos/cogs.pathogen')).toMatchObject({ miniature, updating: false });
    // try-sizes' result came after the move: dropped, and it's compiled again.
    expect(rows.get(TRY)!.updating).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.pending.map((p) => p.program)).toEqual([TRY]);
  });

  it('a program deleted: its row goes, and its miniature’s URL is released', async () => {
    const h = harness();
    h.state.listOpen = true;
    await h.shownCompiled();
    await h.finish();
    await h.finish();
    await tasks();
    const url = h.drawings.rows().get(TRY)!.miniature!;
    expect(url).not.toBeNull();
    h.texts.delete(TRY);
    h.state.programs = [MAIN, GEARS_DEMO];
    h.drawings.edited();
    expect(h.drawings.rows().has(TRY)).toBe(false);
    // Released a microtask later (after a change's follow()).
    await vi.advanceTimersByTimeAsync(0);
    expect(h.live.has(url)).toBe(false);
  });
});
