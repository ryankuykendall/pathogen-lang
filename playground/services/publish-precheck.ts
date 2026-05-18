// Precheck helper used by every UI surface that publishes a workspace
// (app-breadcrumb's Make-public action, landing-view's overflow menu).
// Compiles the workspace code in the browser before issuing
// `PUT /workspace/:id {isPublic:true}`; if the compile fails, the
// caller surfaces a toast and aborts the publish so the moderation
// queue never accumulates broken submissions.
//
// The API Worker can't enforce the same gate (the compiler bundle is
// ~9 MB, well past the Workers size limit), so the client is the
// authority here. Belt-and-suspenders against bypasses (curl /
// scripted) is left to the existing empty-code rejection in
// `submitWorkspaceForReview`.

import compilerWorker from './compiler-worker.js';

export type PrecheckResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'compile-error'; message: string };

let _compilationCounter = 0;

// Minimal structural typing of the evaluator result we care about for
// the publish gate. LayerOutput in src/evaluator/types.ts has more
// fields (styles, transform, isDefault, fragmentDefs, etc.) but the
// gate only needs to know "is there anything visible to render?" —
// the union over the visible-content fields below.
interface PrecheckLayer {
  type?: 'path' | 'text' | 'fragment' | 'group';
  data?: string;
  textElements?: unknown[];
  fragmentVisuals?: string;
  children?: PrecheckLayer[];
}
interface PrecheckResultShape {
  layers?: PrecheckLayer[];
  gradients?: unknown[];
  patterns?: unknown[];
  markers?: unknown[];
  masks?: unknown[];
  clipPaths?: unknown[];
  filters?: unknown[];
}

// "Does this layer (or any nested child layer) produce something
// visible?" Group layers carry empty `data` by design — their content
// lives in `children`. Fragment layers carry their visible markup in
// `fragmentVisuals`. Text layers carry their content in `textElements`.
// Anything that returns true here is enough to clear the publish gate.
function layerHasContent(layer: PrecheckLayer | null | undefined): boolean {
  if (!layer) return false;
  if ((layer.data ?? '').trim().length > 0) return true;
  if (layer.textElements && layer.textElements.length > 0) return true;
  if ((layer.fragmentVisuals ?? '').trim().length > 0) return true;
  if (layer.children && layer.children.some(layerHasContent)) return true;
  return false;
}

export async function precheckCompile(code: string | null | undefined): Promise<PrecheckResult> {
  if (!code || !code.trim()) {
    return { ok: false, reason: 'empty', message: 'Workspace is empty.' };
  }
  try {
    const id = ++_compilationCounter;
    const result = (await compilerWorker.compileWithContext(code, id, undefined)) as PrecheckResultShape;

    // A workspace renders if any of: a leaf path layer carries data,
    // a text layer has elements, a fragment has visuals, a group has
    // any visible descendant, or a defs-only construct (gradient /
    // pattern / mask / clip-path / marker / filter) exists. The
    // defs-only branches matter for workspaces that compose entirely
    // out of, e.g., a single ConicGradient mask — the top-level layer
    // can read as empty even though the SVG is full.
    const layerContent = (result.layers ?? []).some(layerHasContent);
    const defsContent =
      (result.gradients?.length ?? 0) > 0 ||
      (result.patterns?.length ?? 0) > 0 ||
      (result.markers?.length ?? 0) > 0 ||
      (result.masks?.length ?? 0) > 0 ||
      (result.clipPaths?.length ?? 0) > 0 ||
      (result.filters?.length ?? 0) > 0;

    if (!layerContent && !defsContent) {
      return {
        ok: false,
        reason: 'compile-error',
        message: 'Workspace compiles to an empty SVG. Add some shapes before publishing.',
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'compile-error',
      message: (err as Error).message || 'Workspace failed to compile.',
    };
  }
}

// Toast helpers — both surfaces want the same wording on the same
// events, so centralize the dispatch here.

export function toastPublishSuccess(): void {
  document.dispatchEvent(
    new CustomEvent('show-toast', {
      bubbles: true,
      composed: true,
      detail: {
        type: 'success',
        title: 'Thank you for sharing your workspace.',
        message: 'We review public workspaces before they appear on Explore.',
      },
    }),
  );
}

export function toastPrivateSuccess(): void {
  document.dispatchEvent(
    new CustomEvent('show-toast', {
      bubbles: true,
      composed: true,
      detail: {
        type: 'success',
        title: 'Workspace is now private.',
      },
    }),
  );
}

export function toastPublishBlocked(reason: PrecheckResult): void {
  if (reason.ok) return;
  document.dispatchEvent(
    new CustomEvent('show-toast', {
      bubbles: true,
      composed: true,
      detail: {
        type: 'error',
        title:
          reason.reason === 'empty'
            ? "Can't publish an empty workspace."
            : "Can't publish — workspace has compile errors.",
        message: reason.message,
        duration: 6000,
      },
    }),
  );
}
