// Thumbnail Service - Orchestrates SVG rasterization and upload
// Rasterizes SVG -> Web Worker (OffscreenCanvas) -> PNG blobs -> API upload

import { thumbnailApi } from './api.js';
import { createSvgSnapshot } from '../utils/svg-snapshot.js';

const SIZES = [1024, 512, 256];
const MAX_RASTER_SIZE = 4096; // Supersample ceiling (pixels) — balances quality vs memory
const HERO_MAX_DIM = 1440; // Hero longest-edge target (px) — ~2× the 720px detail display
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MIN_AUTO_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes between auto-generations

let worker: Worker | null = null;
let workerReady: boolean = false;

// Auto-generation state
let _workspaceId: string | null = null;
let _thumbnailContentHash: string | null = null; // Last known thumbnail content hash
let _latestContentHash: string | null = null; // Current content hash
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _lastAutoGenTime: number = 0;
let _generating: boolean = false;

function initWorker(): void {
  if (worker) return;

  try {
    // Relative to this file (services/) -> up one level to reach workers/
    worker = new Worker(new URL('../workers/thumbnail.worker.js', import.meta.url), {
      type: 'module',
    });
    workerReady = true;

    worker.onerror = (e: ErrorEvent) => {
      console.warn('Thumbnail worker error:', e.message);
      workerReady = false;
      worker = null;
    };
  } catch (err) {
    console.warn('Failed to create thumbnail worker:', err);
    workerReady = false;
  }
}

/**
 * Process an ImageBitmap through the worker to get PNG blobs at multiple sizes.
 * Falls back to main-thread OffscreenCanvas if worker unavailable.
 */
async function processInWorker(bitmap: ImageBitmap): Promise<Record<number, Blob> | null> {
  initWorker();

  if (worker && workerReady) {
    try {
      return await new Promise((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          worker!.removeEventListener('message', handler);
          if (e.data.success) {
            resolve(e.data.results);
          } else {
            reject(new Error(e.data.error || 'Worker processing failed'));
          }
        };

        worker!.addEventListener('message', handler);
        worker!.postMessage({ bitmap, sizes: SIZES }, [bitmap]);
      });
    } catch (err) {
      console.warn('Worker processing failed, falling back to main thread:', err);
      // bitmap was transferred and is neutered — re-create it
      return null;
    }
  }

  // Fallback: main-thread OffscreenCanvas
  return processOnMainThread(bitmap);
}

/**
 * Fallback: process on main thread with step-down halving for quality.
 */
async function processOnMainThread(bitmap: ImageBitmap): Promise<Record<number, Blob>> {
  const results: Record<number, Blob> = {};
  const sorted = [...SIZES].sort((a, b) => b - a);
  let src: ImageBitmap = bitmap;

  for (const size of sorted) {
    // Step-down halve until within 2x of target
    while (src.width > size * 2) {
      const halfW = Math.max(size, Math.ceil(src.width / 2));
      const halfH = Math.max(size, Math.ceil(src.height / 2));

      if (typeof OffscreenCanvas !== 'undefined') {
        const half = new OffscreenCanvas(halfW, halfH);
        const hCtx = half.getContext('2d')!;
        hCtx.imageSmoothingEnabled = true;
        hCtx.imageSmoothingQuality = 'high';
        hCtx.drawImage(src, 0, 0, halfW, halfH);
        if (src !== bitmap) (src as ImageBitmap).close?.();
        src = await createImageBitmap(half);
      } else {
        const half = document.createElement('canvas');
        half.width = halfW;
        half.height = halfH;
        const hCtx = half.getContext('2d')!;
        hCtx.imageSmoothingEnabled = true;
        hCtx.imageSmoothingQuality = 'high';
        hCtx.drawImage(src, 0, 0, halfW, halfH);
        if (src !== bitmap) (src as ImageBitmap).close?.();
        src = await createImageBitmap(half);
      }
    }

    // Final draw to target size
    let blob: Blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(src, 0, 0, size, size);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(src, 0, 0, size, size);
      blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
    }

    results[size] = blob;
  }

  if (src !== bitmap) (src as ImageBitmap).close?.();
  bitmap.close();
  return results;
}

/**
 * Serialize BOTH raster sources (square-crop thumbnail + full-aspect hero)
 * from the live SVG element in one synchronous pass. Exported for tests.
 *
 * MUST stay synchronous end-to-end: callers on the workspace-switch path
 * capture the outgoing workspace's render while its element is still
 * populated — the preview pane is a singleton whose `#preview` node is
 * emptied IN PLACE by `svg-preview-pane.clear()` when the next workspace
 * initializes, so any read of the element after an await sees the next
 * workspace's (or empty) content.
 */
export function buildRenderSnapshots(
  svgElement: SVGElement,
  storeState: Record<string, unknown>,
  cropRegion?: { x: number; y: number; size: number },
): { thumbSvgString: string; heroSvgString: string; canvasWidth: number; canvasHeight: number } {
  const canvasWidth = (storeState.width as number) || 200;
  const canvasHeight = (storeState.height as number) || 200;

  // Square crop for the card thumbnails: explicit region or auto center-crop.
  let cropX: number;
  let cropY: number;
  let cropSize: number;
  if (cropRegion) {
    cropX = cropRegion.x;
    cropY = cropRegion.y;
    cropSize = cropRegion.size;
  } else {
    cropSize = Math.min(canvasWidth, canvasHeight);
    cropX = (canvasWidth - cropSize) / 2;
    cropY = (canvasHeight - cropSize) / 2;
  }
  // Supersample: rasterize at up to 1:1 SVG-unit-to-pixel, capped at MAX_RASTER_SIZE.
  const rasterSize = Math.max(1024, Math.min(Math.ceil(cropSize), MAX_RASTER_SIZE));
  const thumbClone = createSvgSnapshot(svgElement, {
    width: rasterSize,
    height: rasterSize,
    viewBox: `${cropX} ${cropY} ${cropSize} ${cropSize}`,
  });

  // Hero: full viewBox (no crop), aspect-fit to HERO_MAX_DIM (never upscale
  // beyond source units) — preserves non-square `define ViewBox(...)` shapes.
  const scale = Math.min(1, HERO_MAX_DIM / Math.max(canvasWidth, canvasHeight));
  const heroW = Math.max(1, Math.round(canvasWidth * scale));
  const heroH = Math.max(1, Math.round(canvasHeight * scale));
  const heroClone = createSvgSnapshot(svgElement, {
    width: heroW,
    height: heroH,
    viewBox: `0 0 ${canvasWidth} ${canvasHeight}`,
  });

  const serializer = new XMLSerializer();
  return {
    thumbSvgString: serializer.serializeToString(thumbClone),
    heroSvgString: serializer.serializeToString(heroClone),
    canvasWidth,
    canvasHeight,
  };
}

/**
 * Hero render from a pre-built FULL-aspect SVG string — the hero half of a
 * buildRenderSnapshots capture, or the admin "Regenerate" path's compiled
 * string (which has no live <svg> element at all). Without an uncropped hero,
 * the detail page falls back to the SQUARE 1024 thumbnail — which
 * distorts/clips non-square artwork. This rasterizes the full viewBox at
 * aspect-fit HERO_MAX_DIM, preserving the source ratio. Best-effort; callers
 * ignore failure.
 */
async function uploadHeroFromSvgString(
  workspaceId: string,
  svgString: string,
  canvasWidth: number,
  canvasHeight: number,
  adminToken?: string,
): Promise<void> {
  const w = canvasWidth > 0 ? canvasWidth : 200;
  const h = canvasHeight > 0 ? canvasHeight : 200;
  // Aspect-fit to HERO_MAX_DIM (never upscale beyond source units). outW:outH
  // equals the source ratio, so drawImage into it preserves aspect.
  const scale = Math.min(1, HERO_MAX_DIM / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load hero SVG image'));
      image.src = url;
    });
    let blob: Blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(outW, outH);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png'),
      );
    }
    await thumbnailApi.uploadHero(workspaceId, blob, { adminToken });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Generate a thumbnail for a workspace.
 *
 * @param workspaceId - Workspace ID
 * @param svgElement - The live SVG element to rasterize
 * @param storeState - Current store state (for canvas dimensions)
 * @param cropRegion - Optional crop region { x, y, size } in SVG coordinates
 * @param options - Optional { adminToken, svgString } to bypass ownership
 *        check or provide a pre-built SVG string (skips clone/serialize)
 * @returns Promise resolving to upload result
 */
async function generateThumbnail(
  workspaceId: string,
  svgElement: SVGElement,
  storeState: Record<string, unknown>,
  cropRegion?: { x: number; y: number; size: number },
  options?: { adminToken?: string; svgString?: string; kind?: 'manual' | 'auto' },
): Promise<unknown> {
  // Wait for any in-progress generation to finish (up to 30s)
  if (_generating) {
    const start = Date.now();
    while (_generating && Date.now() - start < 30000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (_generating) {
      console.warn('Thumbnail generation timed out waiting for previous generation');
      return null;
    }
  }

  _generating = true;

  try {
    // Capture EVERYTHING that reads the live element or module tracking state
    // synchronously, before the first await below. On the workspace-switch
    // path the caller's element is emptied in place (previewPane.clear())
    // and the tracking state is re-targeted at the next workspace
    // (startAutoGeneration/setThumbnailContentHash) while this generation is
    // still in flight — late reads would render the wrong workspace's
    // content or stamp the wrong workspace's hash.
    let snapshots: ReturnType<typeof buildRenderSnapshots> | null = null;
    let svgString: string;

    if (options?.svgString) {
      // Pre-built SVG string provided (admin backfill) — use directly,
      // bypassing DOM clone/serialize which can produce namespace issues.
      svgString = options.svgString;
    } else {
      snapshots = buildRenderSnapshots(svgElement, storeState, cropRegion);
      svgString = snapshots.thumbSvgString;
    }
    const latestHashAtStart = _latestContentHash;

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      // 6. Load Image from URL
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load SVG image'));
        image.src = url;
      });

      // 7. Create ImageBitmap and process through worker (or main thread fallback)
      let blobs: Record<number, Blob> | null = null;

      // Try worker first
      const bitmap = await createImageBitmap(img);
      blobs = await processInWorker(bitmap);

      // If worker failed (bitmap was transferred and neutered), retry on main thread
      if (!blobs) {
        const fallbackBitmap = await createImageBitmap(img);
        blobs = await processOnMainThread(fallbackBitmap);
      }

      // 8. Upload via API (returns { thumbnailAt } or null if skipped)
      const result = await thumbnailApi.upload(workspaceId, blobs, {
        adminToken: options?.adminToken,
        kind: options?.kind ?? 'manual',
      });

      // 8b. Hero: an uncropped, source-aspect-ratio render for the workspace detail
      // page (so non-square art isn't clipped like the square card thumbnails).
      // Rendered from the string captured synchronously above — NEVER from the
      // live element, which may already show the next workspace by now. Skipped
      // on the admin svgString path, which only has the pre-cropped square string.
      // Best-effort: a hero failure must not fail the (already-uploaded) thumbnails.
      if (snapshots) {
        try {
          await uploadHeroFromSvgString(
            workspaceId,
            snapshots.heroSvgString,
            snapshots.canvasWidth,
            snapshots.canvasHeight,
            options?.adminToken,
          );
        } catch (err) {
          console.warn('Hero render failed (thumbnails unaffected):', err);
        }
      }

      // 9. Update tracking — per-generation, and only if no workspace switch
      // happened mid-flight: stamping the CURRENT _latestContentHash here
      // would mark the NEXT workspace's edits as already-thumbnailed (its
      // thumbnail would then never regenerate), and edits typed during this
      // generation must stay dirty.
      if (_workspaceId === workspaceId) {
        _thumbnailContentHash = latestHashAtStart;
      }

      return result;
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    _generating = false;
  }
}

/**
 * Start auto-generation tracking for a workspace.
 */
function startAutoGeneration(workspaceId: string): void {
  stopAutoGeneration();
  _workspaceId = workspaceId;
  _latestContentHash = null;
}

/**
 * Stop auto-generation tracking.
 */
function stopAutoGeneration(): void {
  _workspaceId = null;
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

/**
 * Set the content hash of the current thumbnail (from workspace metadata).
 */
function setThumbnailContentHash(hash: string | null): void {
  _thumbnailContentHash = hash;
}

/**
 * Record that content has changed. Resets idle timer.
 */
function onContentChanged(contentHash: string): void {
  _latestContentHash = contentHash;

  // Reset idle timer
  if (_idleTimer) {
    clearTimeout(_idleTimer);
  }

  _idleTimer = setTimeout(() => {
    _idleTimer = null;
    _tryAutoGenerate();
  }, IDLE_TIMEOUT_MS);
}

/**
 * Internal: attempt auto-generation if content is dirty and enough time has passed.
 */
async function _tryAutoGenerate(): Promise<void> {
  if (!_workspaceId) return;
  if (_generating) return;
  if (!_isDirty()) return;

  // Rate limit: minimum interval between auto-generations
  const now = Date.now();
  if (now - _lastAutoGenTime < MIN_AUTO_INTERVAL_MS) return;

  // We need an SVG element - dispatch a custom event to request it
  document.dispatchEvent(
    new CustomEvent('thumbnail-auto-generate', {
      bubbles: true,
      composed: true,
      detail: { workspaceId: _workspaceId },
    }),
  );
}

/**
 * Check if content has changed since last thumbnail.
 */
function _isDirty(): boolean {
  if (!_latestContentHash) return false;
  return _latestContentHash !== _thumbnailContentHash;
}

/**
 * Generate thumbnail if content is dirty (called on navigate-away or auto-trigger).
 * Accepts a getter function for the SVG element to avoid stale references.
 *
 * @param workspaceId
 * @param getSvgElement - () => SVGElement
 * @param storeState
 */
async function generateIfDirty(
  workspaceId: string,
  getSvgElement: () => SVGElement | null,
  storeState: Record<string, unknown>,
): Promise<unknown> {
  if (!_isDirty()) return;
  if (_generating) return;

  const svgElement = getSvgElement();
  if (!svgElement) return;

  try {
    _lastAutoGenTime = Date.now();
    // The idle/beforeunload path writes to the auto layer so it never clobbers
    // a manually-set thumbnail. Manual sets come through generateThumbnail with
    // an explicit kind='manual' (or default).
    return await generateThumbnail(workspaceId, svgElement, storeState, undefined, { kind: 'auto' });
  } catch (err) {
    console.warn('Auto thumbnail generation failed:', err);
    // Surface to the user instead of failing silently — a thumbnail that never
    // updates is otherwise invisible until they notice a stale card.
    document.dispatchEvent(
      new CustomEvent('show-toast', {
        bubbles: true,
        composed: true,
        detail: {
          type: 'error',
          title: 'Thumbnail not updated',
          message:
            'Auto-generating the workspace preview failed. Your code is unaffected; the thumbnail may be out of date.',
        },
      }),
    );
  }
}

/**
 * Whether a generation is currently in progress.
 */
function isGenerating(): boolean {
  return _generating;
}

export default {
  generateThumbnail,
  uploadHeroFromSvgString,
  startAutoGeneration,
  stopAutoGeneration,
  setThumbnailContentHash,
  onContentChanged,
  generateIfDirty,
  isGenerating,
};
