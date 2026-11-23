/**
 * When the programs of VS Code's program list are drawn small (2f), by the
 * playground's rules (playground/services/program-drawings.ts):
 *   - a program is drawn again only when a file it reads changed: its own
 *     text, or a file its imports reach (one that failed: any change);
 *   - an edit marks those rows at once (they spin), and they're drawn once
 *     the typing stops (PROGRAMS_DELAY_MS); a newer edit to the one being
 *     drawn stops it;
 *   - one at a time, in the list's order, on the drawing thread;
 *   - nothing starts before the preview has shown its program;
 *   - the program shown has the preview itself, so it's drawn small only
 *     while the list is open.
 *
 * Everything outside comes in through DrawingsDeps, so tests drive it with
 * fakes. No `vscode` import.
 */
import { samePathKey } from './preview-modules';

import type { DrawResult } from './program-drawing';
import type { DrawnRow } from './preview-programs';

/** The pause after the last edit before the programs are drawn again (the playground's). */
export const PROGRAMS_DELAY_MS = 800;

/** What a stopped draw rejects with. */
export class DrawCancelled extends Error {
  constructor() {
    super('Drawing stopped');
    this.name = 'DrawCancelled';
  }
}

export interface DrawingsDeps {
  /** Draw `program` small with the open tabs' texts. Rejects with DrawCancelled when cancel() stops it. */
  draw: (program: string, open: [string, string][]) => Promise<DrawResult>;
  /** Stop the draw in flight. */
  cancel: () => void;
  /** The open tabs' texts now: [OS path, text]. */
  openTexts: () => [string, string][];
  /** The programs to draw, in the list's order (a main that can't be shown left out). */
  programs: () => string[];
  /** The program the preview shows. */
  shown: () => string | null;
  /** The chip's list is open. */
  listOpen: () => boolean;
  /** The rows changed. */
  changed: () => void;
  delayMs?: number;
}

interface Entry {
  /** The last draw's result (kept while a newer one is waited for: the old miniature with a spinner). */
  result: DrawResult | null;
  /** The files its last draw read, as path keys. */
  reads: Set<string>;
  /** Bumped by every change to a file it reads. */
  gen: number;
  /** The `gen` its result was drawn at; -1 before the first draw. */
  drawnAt: number;
}

export class ProgramDrawings {
  private readonly entries = new Map<string, Entry>();

  private started = false;

  private disposed = false;

  private timer: ReturnType<typeof setTimeout> | null = null;

  private looping = false;

  private inflight: string | null = null;

  constructor(private readonly deps: DrawingsDeps) {}

  /** A program's row, as programRows reads it; undefined before anything is known. */
  row(file: string): DrawnRow | undefined {
    const entry = this.entries.get(samePathKey(file));
    const stale = !entry || entry.drawnAt !== entry.gen;
    if (!entry && !this.started) return undefined;
    return {
      error: entry?.result?.error ?? null,
      miniature: entry?.result?.miniature ?? null,
      updating: stale,
      files: entry?.result?.files ?? null,
      tooLarge: entry?.result?.tooLarge ?? false,
    };
  }

  /** The preview has shown its program: the others may be drawn. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.deps.changed();
    if (this.timer === null) this.kick();
  }

  /**
   * A file changed: typed in, saved, created, deleted or renamed. The rows
   * that read it (and any that failed) are out of date, and are drawn again
   * once the typing stops. `null`: any file, as when pathogen.json changes.
   */
  touched(file: string | null): void {
    if (this.disposed) return;
    const key = file === null ? null : samePathKey(file);
    let inflightTouched = false;
    let newlyStale = false;
    for (const [program, entry] of this.entries) {
      const reads =
        key === null ||
        key === program ||
        entry.result === null ||
        entry.result.error !== null ||
        entry.result.files === null ||
        entry.reads.has(key);
      if (!reads) continue;
      if (entry.drawnAt === entry.gen) newlyStale = true;
      entry.gen++;
      if (program === this.inflight) inflightTouched = true;
    }
    if (inflightTouched) this.deps.cancel();
    // Only a row that starts spinning changes the list: the rest of a burst of typing changes nothing.
    if (newlyStale) this.deps.changed();
    this.wait();
  }

  /** The list's programs changed: those that left are forgotten, and new ones are drawn. */
  listChanged(): void {
    if (this.disposed) return;
    const keep = new Set(this.deps.programs().map(samePathKey));
    for (const key of [...this.entries.keys()]) if (!keep.has(key)) this.entries.delete(key);
    if (this.timer === null) this.kick();
  }

  /** The list opened: the program shown may need drawing small too. */
  listOpened(): void {
    if (this.timer === null) this.kick();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.inflight !== null) this.deps.cancel();
    this.entries.clear();
  }

  /** Draw again once the typing stops. */
  private wait(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, this.deps.delayMs ?? PROGRAMS_DELAY_MS);
  }

  private kick(): void {
    if (!this.started || this.disposed || this.looping) return;
    this.loop().catch((err: unknown) => console.warn('[pathogen] program drawings stopped:', err));
  }

  /** Draw the programs that are out of date, in the list's order, one at a time, until none is or an edit waits. */
  private async loop(): Promise<void> {
    this.looping = true;
    try {
      for (;;) {
        if (this.disposed || this.timer !== null) return;
        const next = this.next();
        if (next === null) return;
        await this.drawOne(next);
      }
    } finally {
      this.looping = false;
    }
  }

  private next(): string | null {
    const shown = this.deps.shown();
    const shownKey = shown === null ? null : samePathKey(shown);
    const open = this.deps.listOpen();
    for (const program of this.deps.programs()) {
      const key = samePathKey(program);
      if (key === shownKey && !open) continue;
      const entry = this.entries.get(key);
      if (!entry || entry.drawnAt !== entry.gen) return program;
    }
    return null;
  }

  private async drawOne(program: string): Promise<void> {
    const key = samePathKey(program);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { result: null, reads: new Set(), gen: 0, drawnAt: -1 };
      this.entries.set(key, entry);
    }
    const gen = entry.gen;
    this.inflight = key;
    let result: DrawResult;
    try {
      result = await this.deps.draw(program, this.deps.openTexts());
    } catch (err) {
      // Stopped by a newer edit: it stays out of date, and is drawn after the pause.
      if (err instanceof DrawCancelled || (err as Error)?.name === 'DrawCancelled') return;
      // The drawing thread failed (not the program): a blank tile, tried again after the next change.
      console.warn(`[pathogen] ${program} not drawn small:`, err);
      result = { error: null, miniature: null, tooLarge: false, files: null };
    } finally {
      if (this.inflight === key) this.inflight = null;
    }
    if (this.disposed || this.entries.get(key) !== entry) return;
    // As in the playground, a program that fails keeps its last drawing, faded under its error.
    const kept =
      result.error !== null && result.miniature === null ? (entry.result?.miniature ?? null) : result.miniature;
    entry.result = { ...result, miniature: kept };
    entry.reads = new Set((result.files ?? []).map(samePathKey));
    entry.drawnAt = gen;
    this.deps.changed();
  }
}
