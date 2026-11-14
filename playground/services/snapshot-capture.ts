// Snapshot capture (docs/snapshots.md): turn the live preview into the stored
// SVG + a small PNG card, and pair it with the code that drew it.
//
// captureSnapshot() is SYNCHRONOUS up to the point it returns: the preview
// pane is a singleton whose <svg> is emptied in place on workspace switch, so
// both clones are taken before any await (same constraint as
// buildRenderSnapshots in thumbnail-service). The card PNG is rendered from
// the captured string afterwards.

import type { FilesBodyOut } from './autosave.js';
import type { RenderedFiles } from '../types/store.js';
import { createSvgSnapshot } from '../utils/svg-snapshot.js';
import { aspectFit, rasterizeSvgString } from '../utils/svg-raster.js';

/** Longest edge of the card thumbnail, in pixels. */
export const SNAPSHOT_CARD_MAX = 512;

export interface CapturedSnapshot {
  /** Export-ready SVG document (no grid, no editor chrome). */
  svg: string;
  /** SVG rendered at card size, for rasterizing the PNG thumbnail. */
  cardSvg: string;
  cardWidth: number;
  cardHeight: number;
  /** The code that drew this image (the last successful render): the program's text. */
  code: string;
  /** Every file as that render drew, and the program (2e). Null only where nothing recorded them. */
  files: RenderedFiles | null;
  width: number;
  height: number;
  background: string;
}

interface CaptureState {
  renderedCode: string | null;
  renderedFiles?: RenderedFiles | null;
  width: number;
  height: number;
  background: string;
}

function stripEditorChrome(svg: SVGElement): void {
  svg.querySelectorAll('[data-interactive="true"]').forEach((el) => el.remove());
}

/**
 * Clone the live preview into the stored SVG and a card-sized copy. Returns
 * null when there is no successful render to capture.
 */
export function captureSnapshot(preview: SVGSVGElement | null, state: CaptureState): CapturedSnapshot | null {
  if (!preview || state.renderedCode == null) return null;
  const width = state.width || 200;
  const height = state.height || 200;

  const full = createSvgSnapshot(preview, { includeGrid: false, background: state.background });
  stripEditorChrome(full);

  const card = aspectFit(width, height, SNAPSHOT_CARD_MAX);
  const cardClone = createSvgSnapshot(preview, {
    includeGrid: false,
    background: state.background,
    width: card.width,
    height: card.height,
  });
  stripEditorChrome(cardClone);

  const serializer = new XMLSerializer();
  return {
    svg: serializer.serializeToString(full),
    cardSvg: serializer.serializeToString(cardClone),
    cardWidth: card.width,
    cardHeight: card.height,
    code: state.renderedCode,
    files: state.renderedFiles ?? null,
    width,
    height,
    background: state.background,
  };
}

/** Render the captured card SVG to a PNG blob. */
export async function renderSnapshotCard(capture: CapturedSnapshot): Promise<Blob> {
  return rasterizeSvgString(capture.cardSvg, capture.cardWidth, capture.cardHeight);
}

/**
 * 1-based number of the first line where the editor text differs from the
 * rendered code, or null when they match. Drives the "edited since this
 * rendered" note in the capture popover.
 */
export function firstChangedLine(rendered: string, current: string): number | null {
  if (rendered === current) return null;
  const a = rendered.split('\n');
  const b = current.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return null;
}

/**
 * What changed since a snapshot's render drew: nothing (null); a line of a
 * file both hold (`file` is null in a one-file workspace, where the line
 * alone says it, as before 2e); or the files themselves, one added, removed
 * or renamed, where no line applies. The program that drew is looked at
 * first, then the others by path. Only texts and paths count: a change to the
 * folders or the program list's order leaves the drawing as it was.
 */
export type StaleNote = null | { kind: 'line'; line: number; file: string | null } | { kind: 'files' };

export function staleNote(rendered: RenderedFiles, now: ReadonlyMap<string, string>): StaleNote {
  const paths = [...rendered.texts.keys()];
  if (paths.length !== now.size || paths.some((p) => !now.has(p))) return { kind: 'files' };
  const order = [rendered.program, ...paths.filter((p) => p !== rendered.program).sort()];
  for (const path of order) {
    const before = rendered.texts.get(path);
    if (before === undefined) continue;
    const line = firstChangedLine(before, now.get(path)!);
    if (line !== null) return { kind: 'line', line, file: rendered.texts.size > 1 ? path : null };
  }
  return null;
}

/**
 * A snapshot's `files` field, as sent: the files body with the program that
 * drew, serialized once, and its size in UTF-8 bytes. That size is what the
 * server measures against SNAPSHOT_LIMITS.codeBytes, so the check before
 * uploading measures the very string uploaded.
 */
export function snapshotFilesField(body: FilesBodyOut, program: string): { json: string; bytes: number } {
  const json = JSON.stringify({ ...body, program });
  return { json, bytes: utf8Bytes(json) };
}

/** Bytes the SVG will occupy on the wire (UTF-8). */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** Client-side mirror of the server caps, checked before uploading. */
export const SNAPSHOT_CLIENT_LIMITS = {
  svgBytes: 50 * 1024 * 1024,
  codeBytes: 1024 * 1024,
} as const;
