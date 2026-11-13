// Every program in the chip's list, drawn small (phase 2d, step 5b; mockup v6
// screen G, docs/workspace-files.md "The preview and the program list").
//
// The programs the preview doesn't show are compiled in the background, one
// at a time, on a worker of their own (compiler-worker's programsCompiler),
// so the editor never waits for them. A program is compiled again only when
// a file its imports reach has changed: its own text, or a module it imports
// (directly or not). An edit marks those programs at once (their rows spin);
// they're compiled once the typing stops (PROGRAMS_DELAY_MS), and a newer edit
// to the one being compiled stops it. Nothing starts while the editor's own
// compile runs (one already running is left to finish, on its own worker), or
// before the program shown has compiled after a load.
//
// The program shown gets its row from the editor's compile (shownDrawn).
//
// A compile gives each row its error ("Error in parts/gears.pathogen line 9",
// services/error-place.ts) and its drawing. The drawing becomes a miniature
// (the engine's generateSvg, as an <img> of a blob URL: no scripts run and
// nothing is fetched) only while the list is open, one per task, so a closed
// list costs no drawing at all. A drawing too large to draw small gets a blank
// tile, never an error (MINIATURE_MAX_CHARS).
//
// Everything outside (the compiler, the import graph, the engine, blob URLs,
// the store) comes in through ProgramDrawingsDeps, so the tests drive it with
// fakes. workspace-view owns one.

import { errorPlace, errorRowText } from './error-place.js';
import { pathAfterChange } from './workspace-edits.js';

import type { Change } from './workspace-edits.js';
import type { WorkspaceTexts } from './workspace-files.js';
import type { CompileResult, LayerOutput } from '../types/compiler.js';

/** About this many characters of drawing (path data, text, defs) at most, for a miniature. */
export const MINIATURE_MAX_CHARS = 250_000;

/** The pause after the last edit before the programs not shown are compiled again. */
export const PROGRAMS_DELAY_MS = 800;

/** A drawing's box: `define ViewBox`, or the 200 × 200 default. */
export interface DrawingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const DEFAULT_BOX: DrawingBox = { originX: 0, originY: 0, width: 200, height: 200 };

/** What a compile result needs to keep to be drawn: no records, logs or font files. */
export type Drawing = Pick<
  CompileResult,
  'layers' | 'masks' | 'clipPaths' | 'gradients' | 'patterns' | 'markers' | 'filters' | 'cssProperties'
> & { viewBox?: DrawingBox };

/** A layer without what only the inspector reads (records, commands). */
function lean(layer: LayerOutput): LayerOutput {
  const copy: LayerOutput = { ...layer };
  delete copy.records;
  delete copy.commands;
  if (layer.children) copy.children = layer.children.map(lean);
  return copy;
}

const NOT_DRAWN = new Set(['records', 'commands']);

/** About how many characters `value` draws, counted until past `limit`. */
function drawingSize(value: unknown, limit: number, size = 0): number {
  if (size > limit) return size;
  if (typeof value === 'string') return size + value.length;
  if (typeof value === 'number') return size + 4;
  if (Array.isArray(value)) {
    for (const item of value) {
      size = drawingSize(item, limit, size);
      if (size > limit) break;
    }
    return size;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (NOT_DRAWN.has(key)) continue;
      size = drawingSize(item, limit, size);
      if (size > limit) break;
    }
  }
  return size;
}

/** The drawing to keep from a compile result, or null when it's too large to draw small. */
export function drawingOf(result: CompileResult & { viewBox?: DrawingBox }): Drawing | null {
  const drawing: Drawing = {
    layers: (result.layers ?? []).map(lean),
    masks: result.masks ?? [],
    clipPaths: result.clipPaths ?? [],
    gradients: result.gradients ?? [],
    patterns: result.patterns ?? [],
    markers: result.markers ?? [],
    filters: result.filters ?? [],
    cssProperties: result.cssProperties ?? [],
    ...(result.viewBox ? { viewBox: result.viewBox } : {}),
  };
  return drawingSize(drawing, MINIATURE_MAX_CHARS) > MINIATURE_MAX_CHARS ? null : drawing;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The SVG with the workspace's canvas colour behind the drawing, as the
 * preview has it (the inspector's Background), over the drawing's box only.
 * The rect goes right after the root tag, found as the first `>` after
 * `<svg`: generateSvg's root tag holds only xmlns, viewBox, width and height
 * (src/render/build-tree.ts), none of which can hold a `>`.
 */
export function withBackground(svg: string, background: string, box: DrawingBox): string {
  const open = svg.indexOf('<svg');
  const end = open < 0 ? -1 : svg.indexOf('>', open);
  if (end < 0 || !background) return svg;
  const rect = `<rect x="${box.originX}" y="${box.originY}" width="${box.width}" height="${box.height}" fill="${attr(background)}"/>`;
  return `${svg.slice(0, end + 1)}${rect}${svg.slice(end + 1)}`;
}

/** The texts a drawing or a graph was made from, to tell when they change. */
interface Inputs {
  texts: Map<string, string | undefined>;
  /** Every path and folder, when the files that matter aren't all known (a missing import, a failed compile); else null. */
  layout: string | null;
}

function layoutOf(workspace: WorkspaceTexts): string {
  return JSON.stringify([[...workspace.texts.keys()].sort(), workspace.folders]);
}

/** A program's inputs: its text and its imports' (every file's when its imports aren't known). */
function inputsOf(
  program: string,
  files: readonly string[] | null,
  workspace: WorkspaceTexts,
  withLayout: boolean,
): Inputs {
  const paths = files === null ? [...workspace.texts.keys()] : [program, ...files];
  return {
    texts: new Map(paths.map((p) => [p, workspace.texts.get(p)])),
    layout: withLayout || files === null ? layoutOf(workspace) : null,
  };
}

/** `layoutOf(workspace)`, worked out once however many rows ask. */
function layoutOnce(workspace: WorkspaceTexts): () => string {
  let layout: string | null = null;
  return () => {
    layout ??= layoutOf(workspace);
    return layout;
  };
}

function changed(inputs: Inputs, workspace: WorkspaceTexts, layout: () => string = layoutOnce(workspace)): boolean {
  if (inputs.layout !== null && inputs.layout !== layout()) return true;
  for (const [path, text] of inputs.texts) if (workspace.texts.get(path) !== text) return true;
  return false;
}

function followInputs(inputs: Inputs, change: Change): Inputs {
  return {
    texts: new Map([...inputs.texts].map(([path, text]) => [pathAfterChange(path, change), text])),
    layout: inputs.layout,
  };
}

interface Entry {
  /** The workspace files its imports reach, as last read; null before that. */
  files: string[] | null;
  graphFor: Inputs | null;
  /** What its row's error and drawing were made from; null before its first compile. */
  drawnFor: Inputs | null;
  error: string | null;
  /** A compile's drawing, kept until the list opens to draw it. */
  drawing: Drawing | null;
  svg: string | null;
  box: DrawingBox;
  url: string | null;
  urlBackground: string | null;
}

/** One program's row, as ProgramDrawings has it. */
export interface ProgramDrawingRow {
  error: string | null;
  miniature: string | null;
  /** Its drawing is out of date, and a compile will redraw it (the spinner). */
  updating: boolean;
  /** The workspace files its imports reach; null before they're read. */
  files: readonly string[] | null;
}

export interface ProgramDrawingsDeps {
  /** The workspace as it stands, the open file's typed text included. */
  workspace: () => WorkspaceTexts;
  /** The programs to draw, in the list's order (a main that's a module left out). */
  programs: () => string[];
  /** The program the preview shows. */
  shown: () => string | null;
  /** The editor's compile is running. */
  busy: () => boolean;
  /** The chip's list is open. */
  listOpen: () => boolean;
  /** The workspace's canvas colour. */
  background: () => string;
  /** The files `program`'s imports reach (workspace paths), and whether they all loaded; null without the library. */
  graph: (program: string, workspace: WorkspaceTexts) => Promise<{ files: string[]; complete: boolean } | null>;
  /** Compile `program` from `workspace`'s files, off the main thread. */
  compile: (program: string, workspace: WorkspaceTexts) => Promise<CompileResult>;
  /** Stop the compile in flight (it then rejects as cancelled). */
  cancel: () => void;
  /** The engine's SVG for a drawing. */
  generate: (drawing: Drawing) => string;
  url: (svg: string) => string;
  revoke: (url: string) => void;
  /** The rows changed. */
  changed: () => void;
  delayMs?: number;
}

const isCancelled = (e: unknown): boolean =>
  (e as { name?: string } | null)?.name === 'CompileCancelled' ||
  (e as { message?: string } | null)?.message === 'Stale result';

export class ProgramDrawings {
  private readonly _entries = new Map<string, Entry>();

  /** Bumped by reset(): anything started before it is dropped. */
  private _session = 0;

  /** Bumped by follow(): a compile started before a move is dropped (its paths may be old). */
  private _epoch = 0;

  /** The program shown has compiled since the last reset: the others may start. */
  private _ready = false;

  private _timer: ReturnType<typeof setTimeout> | null = null;

  private _miniTimer: ReturnType<typeof setTimeout> | null = null;

  private _looping = false;

  private _prunePending = false;

  private _inflight: { path: string; inputs: Inputs } | null = null;

  private _signature = '';

  constructor(private readonly deps: ProgramDrawingsDeps) {}

  /** Each program's row: its error, its miniature, whether it's being redrawn, and the files its imports reach. */
  rows(): Map<string, ProgramDrawingRow> {
    const workspace = this.deps.workspace();
    const layout = layoutOnce(workspace);
    const shown = this.deps.shown();
    const rows = new Map<string, ProgramDrawingRow>();
    for (const path of this.deps.programs()) {
      const entry = this._entries.get(path);
      rows.set(path, {
        error: entry?.error ?? null,
        miniature: entry?.url ?? null,
        updating: path !== shown && this._stale(entry, workspace, layout),
        files: entry?.files ?? null,
      });
    }
    return rows;
  }

  /**
   * The workspace changed (a keystroke, a file added, renamed or deleted, the
   * list): programs that left are forgotten, the rows follow, and the
   * programs not shown are compiled again once the typing stops.
   */
  edited(): void {
    // Forgetting the programs that left waits a microtask: a change's store
    // update reaches here before follow() has moved a renamed program's row.
    if (!this._prunePending) {
      this._prunePending = true;
      queueMicrotask(() => {
        this._prunePending = false;
        this._prune();
      });
    }
    if (this._ready && this.deps.programs().length >= 2) {
      if (this._timer !== null) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._kick(), this.deps.delayMs ?? PROGRAMS_DELAY_MS);
    }
    this._notify();
  }

  /**
   * The editor compiled the program shown: its row takes that compile's
   * error or drawing. `workspace` is what the compile read. The programs not
   * shown may start now.
   */
  shownDrawn(
    program: string,
    workspace: WorkspaceTexts,
    outcome: { result: CompileResult } | { message: string },
    session: number = this._session,
  ): void {
    // A compile the editor started before a reset (another workspace) lands nowhere.
    if (session !== this._session) return;
    const entry = this._entry(program);
    const failed = 'message' in outcome;
    entry.drawnFor = inputsOf(program, entry.files, workspace, failed);
    if (failed) entry.error = errorRowText(errorPlace(outcome.message, program));
    else {
      entry.error = null;
      this._setDrawing(entry, drawingOf(outcome.result));
    }
    this._ready = true;
    this._notify();
    if (this.deps.listOpen()) this.listOpened();
    if (this._timer === null) this._kick();
  }

  /** Which reset this is: the editor passes it back with its compile (shownDrawn), to drop one started before. */
  get session(): number {
    return this._session;
  }

  /**
   * The editor's compile stopped without a result (its Cancel): the programs
   * not shown, which wait while it runs, may go on. Counts as the program
   * shown having compiled, so a cancel during a load doesn't leave the rows
   * spinning until the next edit.
   */
  resume(): void {
    this._ready = true;
    if (this._timer === null) this._kick();
  }

  /** The list opened: draw the miniatures it lacks, one per task. */
  listOpened(): void {
    if (this._miniTimer !== null) return;
    this._miniTimer = setTimeout(() => this._drawOne(), 0);
  }

  /** A change to the files was made: the rows follow its moves, and a compile in flight is dropped. */
  follow(change: Change): void {
    if (!change.steps.some((s) => s.kind === 'move')) return;
    this._epoch++;
    const moved = [...this._entries].map(([path, entry]) => {
      entry.files = entry.files?.map((f) => pathAfterChange(f, change)) ?? null;
      if (entry.graphFor) entry.graphFor = followInputs(entry.graphFor, change);
      if (entry.drawnFor) entry.drawnFor = followInputs(entry.drawnFor, change);
      return [pathAfterChange(path, change), entry] as const;
    });
    this._entries.clear();
    for (const [path, entry] of moved) this._entries.set(path, entry);
  }

  /** Another workspace: everything goes, a compile in flight is stopped, and the miniatures' URLs are released. */
  reset(): void {
    this._session++;
    if (this._timer !== null) clearTimeout(this._timer);
    if (this._miniTimer !== null) clearTimeout(this._miniTimer);
    this._timer = null;
    this._miniTimer = null;
    if (this._inflight !== null) this.deps.cancel();
    this._inflight = null;
    for (const entry of this._entries.values()) if (entry.url) this.deps.revoke(entry.url);
    this._entries.clear();
    this._ready = false;
    this._signature = '';
    // A run still awaiting a graph read or a compile is the old session's: it
    // stops at its next check, and mustn't keep the next workspace's run from starting.
    this._looping = false;
  }

  /** Forget the programs no longer in the list (deleted, or a module now), releasing their miniatures. */
  private _prune(): void {
    const programs = new Set(this.deps.programs());
    for (const [path, entry] of this._entries) {
      if (programs.has(path)) continue;
      if (entry.url) this.deps.revoke(entry.url);
      this._entries.delete(path);
    }
  }

  private _entry(path: string): Entry {
    let entry = this._entries.get(path);
    if (!entry) {
      entry = {
        files: null,
        graphFor: null,
        drawnFor: null,
        error: null,
        drawing: null,
        svg: null,
        box: DEFAULT_BOX,
        url: null,
        urlBackground: null,
      };
      this._entries.set(path, entry);
    }
    return entry;
  }

  /**
   * Out of date: never drawn, a file it was drawn from changed, or its imports
   * now reach a file it wasn't drawn with (the program shown, drawn before
   * its graph was read again).
   */
  private _stale(
    entry: Entry | undefined,
    workspace: WorkspaceTexts,
    layout: () => string = layoutOnce(workspace),
  ): boolean {
    if (!entry?.drawnFor) return true;
    if (changed(entry.drawnFor, workspace, layout)) return true;
    const drawnFor = entry.drawnFor;
    return entry.files?.some((f) => !drawnFor.texts.has(f)) ?? false;
  }

  private _setDrawing(entry: Entry, drawing: Drawing | null): void {
    if (drawing === null) {
      // Too large to draw small: a blank tile.
      if (entry.url) this.deps.revoke(entry.url);
      entry.url = null;
      entry.svg = null;
      entry.drawing = null;
      return;
    }
    // The old miniature stays until the list draws the new one.
    entry.drawing = drawing;
    entry.svg = null;
  }

  private _notify(): void {
    const signature = JSON.stringify([...this.rows()]);
    if (signature === this._signature) return;
    this._signature = signature;
    this.deps.changed();
  }

  /** The typing stopped (or the program shown compiled): stop a compile whose files changed, and run. */
  private _kick(): void {
    this._timer = null;
    if (!this._ready) return;
    if (this._inflight !== null && changed(this._inflight.inputs, this.deps.workspace())) this.deps.cancel();
    if (!this._looping) {
      this._loop(this._session).catch((err: unknown) => console.warn('[program-drawings] run stopped:', err));
    }
  }

  /**
   * Read the graphs that changed (every program's: the dots need them), then
   * compile the programs not shown that are out of date, in the list's order,
   * one at a time. Stops when an edit is waiting, the editor is compiling, or
   * a reset happened; whatever stops it starts it again.
   */
  private async _loop(session: number): Promise<void> {
    this._looping = true;
    try {
      for (;;) {
        if (session !== this._session || this._timer !== null || !this._ready || this.deps.busy()) return;
        const programs = this.deps.programs();
        if (programs.length < 2) return;
        const workspace = this.deps.workspace();
        const layout = layoutOnce(workspace);
        const unread = programs.find((p) => {
          const entry = this._entries.get(p);
          return !entry?.graphFor || changed(entry.graphFor, workspace, layout);
        });
        if (unread !== undefined) {
          await this._readGraph(unread, workspace, session);
          continue;
        }
        const shown = this.deps.shown();
        const next = programs.find((p) => p !== shown && this._stale(this._entries.get(p), workspace, layout));
        if (next === undefined) return;
        await this._draw(next, workspace, session);
      }
    } finally {
      // Only this session's run marks the loop stopped: after a reset, a new run may already be going.
      if (session === this._session) this._looping = false;
    }
  }

  private async _readGraph(program: string, workspace: WorkspaceTexts, session: number): Promise<void> {
    const epoch = this._epoch;
    let graph: { files: string[]; complete: boolean } | null = null;
    try {
      graph = await this.deps.graph(program, workspace);
    } catch (err) {
      console.warn('[program-drawings] imports not read:', err);
    }
    // Dropped after a reset or a move, and for a program deleted meanwhile (no row to make for it).
    if (session !== this._session || epoch !== this._epoch || !this.deps.programs().includes(program)) return;
    const entry = this._entry(program);
    entry.files = graph?.files ?? null;
    entry.graphFor = inputsOf(program, entry.files, workspace, !(graph?.complete ?? false));
    this._notify();
  }

  private async _draw(program: string, workspace: WorkspaceTexts, session: number): Promise<void> {
    const epoch = this._epoch;
    const entry = this._entry(program);
    const inputs = inputsOf(program, entry.files, workspace, false);
    const flight = { path: program, inputs };
    this._inflight = flight;
    let outcome: { result: CompileResult } | { message: string } | null = null;
    try {
      outcome = { result: await this.deps.compile(program, workspace) };
    } catch (err) {
      // A stopped compile stays out of date: the next run draws it.
      if (!isCancelled(err)) outcome = { message: err instanceof Error ? err.message : String(err) };
    } finally {
      // Only this compile's mark: after a reset, the next workspace's run may have its own.
      if (this._inflight === flight) this._inflight = null;
    }
    if (outcome === null || session !== this._session || epoch !== this._epoch) return;
    if ('message' in outcome) {
      entry.drawnFor = { ...inputs, layout: layoutOf(workspace) };
      entry.error = errorRowText(errorPlace(outcome.message, program));
    } else {
      entry.drawnFor = inputs;
      entry.error = null;
      this._setDrawing(entry, drawingOf(outcome.result));
    }
    this._notify();
    if (this.deps.listOpen()) this.listOpened();
  }

  /** One miniature per task while the list is open: a kept drawing to SVG, or an SVG on a new canvas colour. */
  private _drawOne(): void {
    this._miniTimer = null;
    if (!this.deps.listOpen()) return;
    const background = this.deps.background();
    for (const path of this.deps.programs()) {
      const entry = this._entries.get(path);
      if (!entry) continue;
      if (entry.drawing !== null) {
        const drawing = entry.drawing;
        entry.drawing = null;
        try {
          entry.svg = this.deps.generate(drawing);
          entry.box = drawing.viewBox ?? DEFAULT_BOX;
        } catch (err) {
          console.warn(`[program-drawings] ${path} not drawn small:`, err);
          entry.svg = null;
          if (entry.url) this.deps.revoke(entry.url);
          entry.url = null;
          this._notify();
          this._miniTimer = setTimeout(() => this._drawOne(), 0);
          return;
        }
        entry.urlBackground = null;
      }
      if (entry.svg !== null && (entry.url === null || entry.urlBackground !== background)) {
        const url = this.deps.url(withBackground(entry.svg, background, entry.box));
        if (entry.url) this.deps.revoke(entry.url);
        entry.url = url;
        entry.urlBackground = background;
        this._notify();
        this._miniTimer = setTimeout(() => this._drawOne(), 0);
        return;
      }
    }
  }
}
