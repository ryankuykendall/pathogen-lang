// Tab coordinator — detects when the same workspace is open in multiple tabs
// Uses BroadcastChannel to coordinate between same-origin tabs

class TabCoordinator {
  private _channel: BroadcastChannel | null = null;
  private _tabId: string;
  private _workspaceId: string | null = null;

  constructor() {
    this._tabId = Math.random().toString(36).slice(2);
  }

  open(workspaceId: string): void {
    this.close();
    this._workspaceId = workspaceId;

    try {
      this._channel = new BroadcastChannel(`pathogen-ws:${workspaceId}`);
    } catch {
      // BroadcastChannel not supported (e.g., some privacy browsers)
      return;
    }

    this._channel.onmessage = (e: MessageEvent) => {
      if (e.data?.tabId === this._tabId) return; // Ignore own messages

      if (e.data?.type === 'open') {
        // Another tab just opened this workspace — respond so they know we're here
        this._channel?.postMessage({ type: 'pong', tabId: this._tabId });
        this._dispatchConflict();
      } else if (e.data?.type === 'pong') {
        // Another tab responded to our open — they already had it open
        this._dispatchConflict();
      }
    };

    // Announce ourselves — any existing tabs will respond with 'pong'
    this._channel.postMessage({ type: 'open', tabId: this._tabId });
  }

  close(): void {
    if (this._channel) {
      try {
        this._channel.postMessage({ type: 'close', tabId: this._tabId });
        this._channel.close();
      } catch {
        // Channel may already be closed
      }
      this._channel = null;
    }
    this._workspaceId = null;
  }

  private _dispatchConflict(): void {
    document.dispatchEvent(
      new CustomEvent('workspace-conflict', {
        bubbles: true,
        composed: true,
        detail: { workspaceId: this._workspaceId },
      }),
    );
  }
}

export const tabCoordinator = new TabCoordinator();
export default tabCoordinator;
