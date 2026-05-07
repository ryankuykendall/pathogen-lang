// <claim-workspaces-prompt> — shown after first /auth/verify when the device
// has anonymous workspaces. Asks the user whether to claim them under their
// new account. Both Claim and Skip dismiss the prompt; Claim additionally
// re-keys the workspaces in KV via /api/auth/claim.

import { authApi, AuthError } from '../../services/auth.js';
import { store } from '../../state/store.js';
import { BASE_PATH } from '../../utils/router.js';

class ClaimWorkspacesPrompt extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private busy = false;
  private errorMessage: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.unsubscribe = store.subscribe(['pendingClaimCount', 'pendingClaimAnonymousId'], () => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private dismiss(): void {
    store.update({ pendingClaimAnonymousId: null, pendingClaimCount: 0 });
    this.busy = false;
    this.errorMessage = null;
  }

  /** Hard-reload to the workspaces list so it re-fetches as the now-claimed user. */
  private finishAndReload(): void {
    this.dismiss();
    window.location.href = `${BASE_PATH}/`;
  }

  private async claim(): Promise<void> {
    if (this.busy) return;
    const anonId = store.get('pendingClaimAnonymousId') as string | null;
    if (!anonId) {
      this.finishAndReload();
      return;
    }
    this.busy = true;
    this.errorMessage = null;
    this.render();
    try {
      await authApi.claim(anonId);
      this.dispatchEvent(new CustomEvent('workspaces-claimed', { bubbles: true, composed: true }));
      this.finishAndReload();
    } catch (err) {
      this.errorMessage = err instanceof AuthError ? err.message : 'Could not claim workspaces.';
      this.busy = false;
      this.render();
    }
  }

  private render(): void {
    const count = (store.get('pendingClaimCount') as number) || 0;
    const anonId = store.get('pendingClaimAnonymousId') as string | null;
    if (count <= 0 || !anonId) {
      this.shadowRoot!.innerHTML = '';
      return;
    }
    const ws = count === 1 ? 'workspace' : 'workspaces';
    const itThem = count === 1 ? 'it' : 'them';
    const staysStay = count === 1 ? 'stays' : 'stay';
    const remainsRemain = count === 1 ? 'remains' : 'remain';
    this.shadowRoot!.innerHTML = `
      <style>${promptStyles}</style>
      <div class="overlay">
        <div class="dialog" role="dialog" aria-modal="true">
          <h2>Move your ${ws} to this account?</h2>
          <p>
            You created <strong>${count}</strong> ${ws} before signing in.
            Add ${itThem} to your account so ${itThem} ${staysStay} with you on any device —
            and ${count === 1 ? 'survives' : 'survive'} signing out and back in.
          </p>
          <p class="footnote">Skip and ${itThem} ${remainsRemain} on this browser only, available without an account.</p>
          ${this.errorMessage ? `<div class="error" role="alert">${escapeHtml(this.errorMessage)}</div>` : ''}
          <div class="row">
            <button class="ghost" type="button" data-action="skip" ${this.busy ? 'disabled' : ''}>Not now</button>
            <button class="primary" type="button" data-action="claim" ${this.busy ? 'disabled' : ''}>
              ${this.busy ? 'Claiming…' : `Move ${count}`}
            </button>
          </div>
        </div>
      </div>
    `;
    this.shadowRoot!.querySelector('[data-action="skip"]')!.addEventListener('click', () => {
      this.finishAndReload();
    });
    this.shadowRoot!.querySelector('[data-action="claim"]')!.addEventListener('click', () => {
      void this.claim();
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch),
  );
}

const promptStyles = `
  :host { position: fixed; inset: 0; z-index: 2050; pointer-events: none; }
  .overlay {
    position: absolute; inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: grid; place-items: center;
    pointer-events: auto;
    backdrop-filter: blur(2px);
  }
  .dialog {
    width: min(440px, calc(100vw - 32px));
    background: var(--bg-secondary, #fff);
    color: var(--text-primary, #1a1a2e);
    border-radius: 14px;
    border: 1px solid var(--border-color, #e2e8f0);
    box-shadow: var(--shadow-lg, 0 24px 48px rgba(0,0,0,0.18));
    padding: 1.5rem 1.75rem;
  }
  h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  p { margin: 0 0 1rem; color: var(--text-secondary, #475569); font-size: 0.9rem; line-height: 1.45; }
  p.footnote { margin: -0.5rem 0 1rem; font-size: 0.8125rem; color: var(--text-tertiary, #94a3b8); }
  .error {
    background: var(--bg-error, #fee2e2);
    color: var(--text-error, #b91c1c);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    margin-bottom: 0.75rem;
  }
  .row { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; }
  button.primary {
    padding: 0.55rem 1.1rem;
    background: var(--accent-color, #10b981);
    color: var(--accent-text, #fff);
    border: none; border-radius: 8px;
    font: inherit; font-weight: 600;
    cursor: pointer;
  }
  button.primary:disabled { opacity: 0.6; cursor: progress; }
  button.ghost {
    padding: 0.55rem 0.9rem;
    background: none; border: none;
    color: var(--text-secondary, #64748b);
    font: inherit; cursor: pointer;
  }
  button.ghost:disabled { opacity: 0.5; }
`;

customElements.define('claim-workspaces-prompt', ClaimWorkspacesPrompt);

export default ClaimWorkspacesPrompt;
