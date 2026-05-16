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

export async function precheckCompile(code: string | null | undefined): Promise<PrecheckResult> {
  if (!code || !code.trim()) {
    return { ok: false, reason: 'empty', message: 'Workspace is empty.' };
  }
  try {
    const id = ++_compilationCounter;
    const result = (await compilerWorker.compileWithContext(code, id, undefined)) as {
      layers?: Array<{ data?: string }>;
    };
    // A clean compile produces at least one layer with non-empty path
    // data. Empty/whitespace-only programs slip through the parser as a
    // single empty default layer; treat those as a compile failure for
    // the publish gate so visitors never land on a blank workspace.
    const hasContent = (result.layers ?? []).some((l) => (l?.data ?? '').trim().length > 0);
    if (!hasContent) {
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
