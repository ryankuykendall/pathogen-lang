// Snapshot capture flow for the workspace view (docs/snapshots.md).
//
// Owns the <snapshot-popover> (appended to document.body so breadcrumb
// re-renders and the fullscreen preview can't destroy or cover it) and runs:
//
//   click Snapshot ─▶ capture the preview NOW (sync clone) ─▶ popover: name
//                     └▶ render the card PNG in the background ─▶ thumbnail
//   Save ─▶ (scratch: create the workspace) ─▶ upload ─▶ Saved · View · Undo
//
// The capture is taken at click time, so the saved image is the one the user
// was looking at even if they press Refresh while naming it.
//
// Lifetimes:
//   - Closing the popover drops an UNSAVED capture, but never one that is
//     uploading: the save finishes in the background and reports through a
//     toast, or re-opens the popover with Retry if it fails (no silent loss).
//   - The card PNG is kept as a Blob; every consumer (popover thumbnail,
//     fullscreen tray, toast) gets its own object URL, so revoking one never
//     breaks another.
//   - A workspace switch bumps the generation; a save that finishes after
//     the switch reports by toast and leaves the new workspace's state alone.

import '../components/shared/snapshot-popover.js';
import type { SnapshotPopover, SnapshotPopoverPlacement } from '../components/shared/snapshot-popover.js';
import { store } from '../state/store.js';
import { formatBytes } from '../utils/format-bytes.js';
import { buildWorkspaceSlugId, navigateTo } from '../utils/router.js';
import { snapshotApi, workspaceApi } from './api.js';
import {
  captureSnapshot,
  firstChangedLine,
  renderSnapshotCard,
  SNAPSHOT_CLIENT_LIMITS,
  utf8Bytes,
} from './snapshot-capture.js';
import type { CapturedSnapshot } from './snapshot-capture.js';

export interface CaptureSnapshotDetail {
  anchor: DOMRect;
  placement: SnapshotPopoverPlacement;
  anchorEl?: Element | null;
}

interface SnapshotHost {
  /** The live preview <svg> (emptied in place on workspace switch). */
  getPreview: () => SVGSVGElement | null;
  /** Leave fullscreen before navigating away. */
  exitFullscreen: () => void;
  /** Open the normal Export dialog on the live preview. */
  openExport: () => void;
}

interface PendingCapture {
  capture: CapturedSnapshot;
  svgBytes: number;
  card: Promise<Blob>;
  cardBlob: Blob | null;
  /** Object URL owned by the popover thumbnail; revoked with the capture. */
  thumbUrl: string | null;
  /** Fixed at capture: this capture came from a scratch buffer. */
  isScratch: boolean;
  /** Scratch only: the workspace created on the first Save attempt. */
  createdWorkspace: { id: string; slug?: string; name: string } | null;
  workspaceId: string | null;
  workspaceSlugId: string | null;
  defaultName: string;
  name: string;
  note: string;
  staleLine: number | null;
  savedId: string | null;
  saving: boolean;
  generation: number;
  /** Where to re-open the popover if a background save fails. */
  anchor: DOMRect;
  placement: SnapshotPopoverPlacement;
}

interface ApiErrorLike {
  kind?: 'network' | 'http';
  status?: number;
  message?: string;
  data?: { code?: string; error?: string } | null;
}

type RecentSnapshot = { id: string; n: number; cardUrl: string };

/** How long a toast's own thumbnail URL lives before it's revoked (ms). */
const TOAST_IMAGE_TTL_MS = 15_000;

function toast(detail: {
  type?: 'success' | 'error';
  title: string;
  message?: string;
  image?: string;
  action?: { label: string; onSelect: () => void };
}): void {
  document.dispatchEvent(new CustomEvent('show-toast', { bubbles: true, composed: true, detail }));
}

function currentSlugId(): string | null {
  const params = (store.get('routeParams') || {}) as Record<string, string>;
  return params.slugId || null;
}

function shortLivedUrl(blob: Blob | null): string | undefined {
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), TOAST_IMAGE_TTL_MS);
  return url;
}

export class SnapshotController {
  private _popover: SnapshotPopover | null = null;

  private _pending: PendingCapture | null = null;

  /** Bumped on every workspace switch; see the header comment. */
  private _generation = 0;

  constructor(private host: SnapshotHost) {}

  /** Remove the popover and drop any in-memory capture. */
  destroy(): void {
    this._generation++;
    this._discardPending(true);
    this._popover?.remove();
    this._popover = null;
  }

  /** A different workspace is loading: close the popover, forget captures. */
  resetForWorkspace(): void {
    this._generation++;
    this._popover?.close();
    // An upload in flight keeps running and reports by toast; anything else
    // belonged to the previous workspace.
    this._discardPending(false);
    for (const item of (store.get('recentSnapshots') as RecentSnapshot[] | undefined) || []) {
      URL.revokeObjectURL(item.cardUrl);
    }
  }

  /** Navigate to the current workspace's snapshots page. */
  openSnapshotsPage(slugId: string | null = currentSlugId()): void {
    if (!slugId) return;
    this._closePopover();
    this.host.exitFullscreen();
    navigateTo(`/workspace/${slugId}/snapshots`);
  }

  /** Snapshot button pressed (breadcrumb split button or fullscreen chrome). */
  handleCapture(detail: CaptureSnapshotDetail): void {
    const popover = this._ensurePopover();
    if (popover.isOpen) {
      // Second press on the button toggles the popover shut.
      this._closePopover();
      return;
    }

    const state = store.getAll() as unknown as Record<string, unknown>;
    const capture = captureSnapshot(this.host.getPreview(), {
      renderedCode: state.renderedCode as string | null,
      width: state.width as number,
      height: state.height as number,
      background: (state.background as string) || '#ffffff',
    });
    if (!capture) return;

    const workspaceId = (state.workspaceId as string | null) ?? null;
    const count = state.snapshotCount as number | null;
    const workspaceName = (state.workspaceName as string | null) || 'Untitled';
    const defaultName = `${workspaceName} #${(count ?? 0) + 1}`;
    const pending: PendingCapture = {
      capture,
      svgBytes: utf8Bytes(capture.svg),
      card: renderSnapshotCard(capture),
      cardBlob: null,
      thumbUrl: null,
      isScratch: !workspaceId,
      createdWorkspace: null,
      workspaceId,
      workspaceSlugId: workspaceId ? currentSlugId() : null,
      defaultName,
      name: defaultName,
      note: '',
      staleLine: firstChangedLine(capture.code, (state.code as string) ?? ''),
      savedId: null,
      saving: false,
      generation: this._generation,
      anchor: detail.anchor,
      placement: detail.placement,
    };
    this._discardPending(false);
    this._pending = pending;
    pending.card
      .then((blob) => {
        pending.cardBlob = blob;
        if (this._pending === pending && !pending.thumbUrl) {
          pending.thumbUrl = URL.createObjectURL(blob);
          this._popover?.setThumb(pending.thumbUrl);
        }
      })
      .catch((err) => console.warn('Snapshot card render failed:', err));

    popover.openAt(detail.anchor, detail.placement, detail.anchorEl ?? null);

    if (!state.currentUser) {
      popover.setState({ kind: 'signed-out', thumbUrl: null });
      return;
    }
    if (pending.svgBytes > SNAPSHOT_CLIENT_LIMITS.svgBytes) {
      popover.setState({
        kind: 'error',
        thumbUrl: null,
        name: defaultName,
        note: '',
        exportInstead: true,
        message: `This render is ${formatBytes(pending.svgBytes)}. Snapshots are limited to 12 MB. Try a lower Precision, or export it directly.`,
      });
      return;
    }
    if (utf8Bytes(capture.code) > SNAPSHOT_CLIENT_LIMITS.codeBytes) {
      popover.setState({
        kind: 'error',
        thumbUrl: null,
        name: defaultName,
        note: '',
        message: 'This program is larger than 1 MB, the most code a snapshot can hold.',
      });
      return;
    }
    if (pending.isScratch) {
      popover.setState({ kind: 'scratch', thumbUrl: null, workspaceName: 'Untitled', staleLine: pending.staleLine });
      return;
    }
    popover.setState({ kind: 'naming', thumbUrl: null, name: defaultName, staleLine: pending.staleLine });
  }

  private _ensurePopover(): SnapshotPopover {
    if (this._popover) return this._popover;
    const popover = document.createElement('snapshot-popover') as SnapshotPopover;
    document.body.appendChild(popover);
    const fields = (e: Event): { name: string; note: string } =>
      (e as CustomEvent<{ name: string; note: string }>).detail ?? { name: '', note: '' };
    popover.addEventListener('snapshot-popover-save', (e) => void this._save(fields(e)));
    popover.addEventListener('snapshot-popover-retry', (e) => void this._save(fields(e)));
    popover.addEventListener('snapshot-popover-undo', () => void this._undo());
    popover.addEventListener('snapshot-popover-view', () => this.openSnapshotsPage(this._pending?.workspaceSlugId));
    popover.addEventListener('snapshot-popover-close', () => this._closePopover());
    popover.addEventListener('snapshot-popover-sign-in', () => {
      this._closePopover();
      store.set('authModalOpen', true);
    });
    popover.addEventListener('snapshot-popover-download-svg', () => this._downloadSvg());
    popover.addEventListener('snapshot-popover-open-export', () => {
      this._closePopover();
      this.host.openExport();
    });
    this._popover = popover;
    return popover;
  }

  /** Hide the popover; an unsaved, idle capture goes with it. */
  private _closePopover(): void {
    this._popover?.close();
    this._discardPending(false);
  }

  /**
   * Forget the current capture unless it is uploading (the save reports on
   * its own) — `force` drops it regardless (teardown).
   */
  private _discardPending(force: boolean): void {
    const pending = this._pending;
    if (!pending) return;
    if (pending.saving && !force) return;
    if (pending.thumbUrl) URL.revokeObjectURL(pending.thumbUrl);
    pending.thumbUrl = null;
    this._pending = null;
  }

  /** Popover calls only while it still shows this capture. */
  private _showing(pending: PendingCapture): SnapshotPopover | null {
    return this._pending === pending && this._popover?.isOpen ? this._popover : null;
  }

  private async _save(fields: { name: string; note: string }): Promise<void> {
    const pending = this._pending;
    const popover = this._popover;
    if (!pending || !popover || pending.savedId || pending.saving) return;
    pending.note = fields.note;
    if (!pending.isScratch) pending.name = fields.name || pending.defaultName;
    const scratchName = fields.name || pending.createdWorkspace?.name || 'Untitled';

    pending.saving = true;
    popover.setState({
      kind: 'saving',
      thumbUrl: pending.thumbUrl,
      name: pending.isScratch ? scratchName : pending.name,
      sizeLabel: formatBytes(pending.svgBytes),
    });

    try {
      if (pending.isScratch && !pending.createdWorkspace) {
        pending.createdWorkspace = (await workspaceApi.create({
          name: scratchName,
          // The workspace keeps everything typed in the scratch buffer; the
          // snapshot below keeps the code that drew the image (the popover
          // warned if those differ).
          code: store.get('code') ?? pending.capture.code,
          isPublic: false,
          preferences: {
            background: store.get('background'),
            gridEnabled: store.get('gridEnabled'),
            gridColor: store.get('gridColor'),
            gridSize: store.get('gridSize'),
            toFixed: store.get('toFixed'),
          },
        })) as { id: string; slug?: string; name: string };
        // A retry reuses this workspace instead of making another.
        pending.workspaceId = pending.createdWorkspace.id;
        pending.workspaceSlugId = buildWorkspaceSlugId(
          pending.createdWorkspace.slug ?? null,
          pending.createdWorkspace.id,
        );
      }

      const card = await pending.card;
      pending.cardBlob = card;
      // Keeping the suggested name sends none, so the server numbers it
      // from the real sequence ("<workspace> #n") even after deletions.
      const sendName = pending.isScratch || pending.name === pending.defaultName ? '' : pending.name;
      const { snapshot, count } = await snapshotApi.create(pending.workspaceId!, {
        svg: pending.capture.svg,
        code: pending.capture.code,
        card,
        meta: {
          name: sendName,
          note: pending.note,
          width: pending.capture.width,
          height: pending.capture.height,
          background: pending.capture.background,
        },
      });
      pending.savedId = snapshot.id;
      pending.saving = false;
      this._afterSaved(pending, snapshot, count);
    } catch (err) {
      pending.saving = false;
      this._afterFailed(pending, err as ApiErrorLike);
    }
  }

  private _afterSaved(pending: PendingCapture, snapshot: { id: string; n: number; name: string }, count: number): void {
    const sameWorkspace = pending.generation === this._generation && store.get('workspaceId') === pending.workspaceId;

    if (pending.createdWorkspace) {
      // Scratch: the new workspace opens fresh; confirm with a toast.
      if (this._pending === pending) this._closePopover();
      toast({
        type: 'success',
        title: `Saved as “${pending.createdWorkspace.name}” + snapshot #${snapshot.n}`,
        message: 'Snapshots need a workspace, so we created one.',
        image: shortLivedUrl(pending.cardBlob),
      });
      if (pending.generation === this._generation) {
        navigateTo('/workspace/:slugId', { params: { slugId: pending.workspaceSlugId! } });
      }
      return;
    }

    if (sameWorkspace && pending.cardBlob) {
      const recent = (store.get('recentSnapshots') as RecentSnapshot[] | undefined) || [];
      store.update({
        snapshotCount: count,
        recentSnapshots: [
          { id: snapshot.id, n: snapshot.n, cardUrl: URL.createObjectURL(pending.cardBlob) },
          ...recent,
        ],
      });
    } else if (sameWorkspace) {
      store.set('snapshotCount', count);
    }

    const popover = this._showing(pending);
    if (popover) {
      popover.setState({ kind: 'saved', thumbUrl: pending.thumbUrl, name: snapshot.name, total: count });
      return;
    }
    // The popover was closed (or the workspace changed) while uploading.
    const slugId = pending.workspaceSlugId;
    toast({
      type: 'success',
      title: `Saved “${snapshot.name}”`,
      image: shortLivedUrl(pending.cardBlob),
      action: slugId ? { label: 'View snapshots', onSelect: () => this.openSnapshotsPage(slugId) } : undefined,
    });
    if (this._pending === pending) this._discardPending(false);
  }

  private _afterFailed(pending: PendingCapture, err: ApiErrorLike): void {
    if (pending.generation !== this._generation) {
      // The user moved to another workspace; the capture can't be retried
      // from here, so say plainly that it wasn't saved.
      toast({ type: 'error', title: 'Snapshot not saved', message: err.message || 'The upload failed.' });
      return;
    }
    // Keep the capture and make sure the user sees the failure: re-open the
    // popover where it was if they had closed it during the upload.
    this._pending = pending;
    const popover = this._ensurePopover();
    if (!popover.isOpen) popover.openAt(pending.anchor, pending.placement, null);
    this._showSaveError(popover, pending, err);
  }

  private _showSaveError(popover: SnapshotPopover, pending: PendingCapture, err: ApiErrorLike): void {
    const code = err.data?.code;
    const base = { kind: 'error' as const, thumbUrl: pending.thumbUrl, name: pending.name, note: pending.note };
    if (err.status === 401 || code === 'snapshot-sign-in-required') {
      popover.setState({ kind: 'signed-out', thumbUrl: pending.thumbUrl });
    } else if (code === 'snapshot-quota-reached') {
      popover.setState({ ...base, message: err.message || "You've used all 500 snapshots. Delete some to make room." });
    } else if (code === 'snapshot-svg-too-large') {
      popover.setState({
        ...base,
        exportInstead: true,
        message: `${err.message} Try a lower Precision, or export it directly.`,
      });
    } else if (code === 'snapshot-code-too-large' || code === 'snapshots-unavailable' || err.status === 403) {
      popover.setState({ ...base, message: err.message || 'This snapshot could not be saved.' });
    } else {
      // Network failures and server errors: the capture is held here.
      const message =
        err.kind === 'network'
          ? "Couldn't reach the server. Your snapshot is held here."
          : `${err.message || 'Saving failed'}. Your snapshot is held here.`;
      popover.setState({
        ...base,
        name: pending.isScratch ? (pending.createdWorkspace?.name ?? 'Untitled') : pending.name,
        retry: true,
        message,
      });
    }
  }

  private async _undo(): Promise<void> {
    const pending = this._pending;
    if (!pending?.savedId) return;
    const id = pending.savedId;
    this._closePopover();
    try {
      const { count } = await snapshotApi.remove(id);
      if (pending.generation === this._generation && store.get('workspaceId') === pending.workspaceId) {
        const recent = (store.get('recentSnapshots') as RecentSnapshot[] | undefined) || [];
        const removed = recent.find((r) => r.id === id);
        if (removed) URL.revokeObjectURL(removed.cardUrl);
        store.update({ snapshotCount: count, recentSnapshots: recent.filter((r) => r.id !== id) });
      }
      toast({ type: 'success', title: 'Snapshot removed' });
    } catch (err) {
      toast({ type: 'error', title: 'Could not undo the snapshot', message: (err as Error).message });
    }
  }

  private _downloadSvg(): void {
    const pending = this._pending;
    if (!pending) return;
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${pending.capture.svg}`], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(pending.name || 'snapshot').replace(/[^a-zA-Z0-9_-]+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
