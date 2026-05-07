// <auth-modal> — passwordless email + 6-digit OTP sign-in.
// Two steps: enter email/displayName -> POST /auth/start; enter 6-digit code
// -> POST /auth/verify. On success the verify response is applied to the
// store via applyVerifyResponse(). If the response indicates claimable
// workspaces, the claim prompt opens automatically (it subscribes to the
// pendingClaimCount store key).

import {
  applyVerifyResponse,
  authApi,
  AuthError,
  type CurrentUser,
} from '../../services/auth.js';
import { hasEverSignedIn, peekAnonymousUserId } from '../../services/user-id.js';
import { store } from '../../state/store.js';
import { BASE_PATH } from '../../utils/router.js';

// Brief pause after a 6-digit code lands in the inputs (pasted or typed-out)
// before we submit, so the user has a moment to see that the code they entered
// matches what they expected. Cancelled if the user closes the modal.
const AUTO_SUBMIT_DELAY_MS = 600;

type Step = 'email' | 'code';

class AuthModal extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private step: Step = 'email';
  private email = '';
  private displayName = '';
  private busy = false;
  private errorMessage: string | null = null;
  private codeDigits: string[] = ['', '', '', '', '', ''];
  private anonAtStart: string | null = null;
  private autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.unsubscribe = store.subscribe(['authModalOpen'], () => this.render());
    document.addEventListener('keydown', this.handleKeydown);
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (!store.get('authModalOpen')) return;
    if (e.key === 'Escape') this.close();
  };

  private close(): void {
    this.cancelAutoSubmit();
    this.step = 'email';
    this.email = '';
    this.displayName = '';
    this.codeDigits = ['', '', '', '', '', ''];
    this.errorMessage = null;
    this.busy = false;
    store.set('authModalOpen', false);
  }

  private scheduleAutoSubmit(): void {
    this.cancelAutoSubmit();
    this.autoSubmitTimer = setTimeout(() => {
      this.autoSubmitTimer = null;
      void this.submitCode();
    }, AUTO_SUBMIT_DELAY_MS);
  }

  private cancelAutoSubmit(): void {
    if (this.autoSubmitTimer !== null) {
      clearTimeout(this.autoSubmitTimer);
      this.autoSubmitTimer = null;
    }
  }

  private async submitEmail(): Promise<void> {
    if (this.busy) return;
    const email = this.email.trim();
    const displayName = this.displayName.trim();
    const returning = hasEverSignedIn();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Please enter a valid email address.';
      this.render();
      return;
    }
    // Display name is required only on first signin from this browser. For
    // returning users the field is hidden and the server keeps their existing
    // display name.
    if (!returning && (displayName.length < 1 || displayName.length > 60)) {
      this.errorMessage = 'Display name must be 1–60 characters.';
      this.render();
      return;
    }
    if (returning && displayName.length > 60) {
      this.errorMessage = 'Display name must be 60 characters or fewer.';
      this.render();
      return;
    }
    this.busy = true;
    this.errorMessage = null;
    this.anonAtStart = peekAnonymousUserId();
    this.render();
    try {
      await authApi.start(email, displayName);
      this.step = 'code';
      this.codeDigits = ['', '', '', '', '', ''];
    } catch (err) {
      this.errorMessage = err instanceof AuthError ? err.message : 'Could not send code. Please try again.';
    } finally {
      this.busy = false;
      this.render();
      // Focus the first code input on transition
      requestAnimationFrame(() => {
        const first = this.shadowRoot!.querySelector('.code-input') as HTMLInputElement | null;
        first?.focus();
      });
    }
  }

  private async submitCode(): Promise<void> {
    if (this.busy) return;
    this.cancelAutoSubmit();
    const code = this.codeDigits.join('');
    if (!/^\d{6}$/.test(code)) {
      this.errorMessage = 'Enter the 6-digit code from the email.';
      this.render();
      return;
    }
    this.busy = true;
    this.errorMessage = null;
    this.render();
    try {
      const res = await authApi.verify(this.email.trim(), code, this.anonAtStart);
      applyVerifyResponse(res);
      // pendingClaimAnonymousId is needed by the claim prompt; set it now so
      // claim-workspaces-prompt can render even though the local id has flipped.
      const willShowClaimPrompt = res.claimableWorkspaceCount > 0 && Boolean(this.anonAtStart);
      if (willShowClaimPrompt) {
        store.update({
          pendingClaimAnonymousId: this.anonAtStart,
          pendingClaimCount: res.claimableWorkspaceCount,
        });
      }
      this.close();
      this.dispatchEvent(
        new CustomEvent<{ currentUser: CurrentUser; firstTime: boolean }>('auth-success', {
          bubbles: true,
          composed: true,
          detail: { currentUser: res.currentUser, firstTime: res.firstTime },
        }),
      );
      // Hard reload to the workspaces list so it re-fetches as the new user.
      // If the claim prompt is about to open, defer the reload — the prompt
      // owns the reload on its own dismiss.
      if (!willShowClaimPrompt) {
        window.location.href = `${BASE_PATH}/`;
      }
    } catch (err) {
      this.errorMessage = err instanceof AuthError ? err.message : 'Verification failed. Please try again.';
      // Wipe the digits so the user can re-enter.
      this.codeDigits = ['', '', '', '', '', ''];
    } finally {
      this.busy = false;
      this.render();
      requestAnimationFrame(() => {
        const first = this.shadowRoot!.querySelector('.code-input') as HTMLInputElement | null;
        first?.focus();
      });
    }
  }

  private updateDigit(index: number, value: string): void {
    const digit = (value.match(/\d/) || [''])[0];
    this.codeDigits[index] = digit;
    const inputs = Array.from(this.shadowRoot!.querySelectorAll<HTMLInputElement>('.code-input'));
    if (digit && index < inputs.length - 1) {
      inputs[index + 1].focus();
    }
    // Reflect into DOM without full re-render (preserves focus)
    inputs[index].value = digit;
    if (this.codeDigits.every((d) => d.length === 1)) {
      // Brief pause before submitting so the user sees the code in the boxes.
      this.scheduleAutoSubmit();
    }
  }

  private handlePaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text') || '';
    const match = text.match(/\d{6}/);
    if (!match) return;
    e.preventDefault();
    const digits = match[0].split('');
    this.codeDigits = digits;
    const inputs = Array.from(this.shadowRoot!.querySelectorAll<HTMLInputElement>('.code-input'));
    inputs.forEach((input, i) => { input.value = digits[i]; });
    inputs[inputs.length - 1].focus();
    this.scheduleAutoSubmit();
  }

  private handleBackspace(index: number, e: KeyboardEvent): void {
    if (e.key !== 'Backspace') return;
    const input = e.target as HTMLInputElement;
    if (input.value.length === 0 && index > 0) {
      const inputs = Array.from(this.shadowRoot!.querySelectorAll<HTMLInputElement>('.code-input'));
      inputs[index - 1].focus();
    }
  }

  private render(): void {
    const open = Boolean(store.get('authModalOpen'));
    if (!open) {
      this.shadowRoot!.innerHTML = '';
      return;
    }
    this.shadowRoot!.innerHTML = `
      <style>${modalStyles}</style>
      <div class="overlay" role="presentation">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <button class="close" type="button" aria-label="Close" data-action="close">✕</button>
          ${this.step === 'email' ? this.renderEmailStep() : this.renderCodeStep()}
        </div>
      </div>
    `;
    const root = this.shadowRoot!;
    root.querySelector('.overlay')!.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('overlay')) this.close();
    });
    root.querySelector('[data-action="close"]')!.addEventListener('click', () => this.close());

    if (this.step === 'email') {
      const form = root.querySelector('form')!;
      const emailInput = root.querySelector<HTMLInputElement>('input[name="email"]')!;
      const nameInput = root.querySelector<HTMLInputElement>('input[name="displayName"]');
      emailInput.addEventListener('input', (e) => {
        this.email = (e.target as HTMLInputElement).value;
      });
      // Display-name input is conditionally rendered (hidden for returning users).
      nameInput?.addEventListener('input', (e) => {
        this.displayName = (e.target as HTMLInputElement).value;
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void this.submitEmail();
      });
      requestAnimationFrame(() => emailInput.focus());
    } else {
      const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('.code-input'));
      inputs.forEach((input, i) => {
        input.addEventListener('input', (e) => this.updateDigit(i, (e.target as HTMLInputElement).value));
        input.addEventListener('paste', (e) => this.handlePaste(e as ClipboardEvent));
        input.addEventListener('keydown', (e) => this.handleBackspace(i, e));
      });
      const form = root.querySelector('form');
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        void this.submitCode();
      });
      const back = root.querySelector('[data-action="back"]');
      back?.addEventListener('click', () => {
        this.step = 'email';
        this.codeDigits = ['', '', '', '', '', ''];
        this.errorMessage = null;
        this.render();
      });
    }
  }

  private renderEmailStep(): string {
    const returning = hasEverSignedIn();
    return `
      <h2 id="auth-modal-title">${returning ? 'Welcome back' : 'Sign in to Pathogen'}</h2>
      <p class="subtitle">${returning
        ? `We'll email you a 6-digit code to sign in.`
        : `Passwordless — we'll send a 6-digit code to your email.`}</p>
      <form>
        <label class="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            required
            value="${escapeAttr(this.email)}"
            placeholder="you@example.com"
          />
        </label>
        ${returning ? '' : `
        <label class="field">
          <span>Display name</span>
          <input
            type="text"
            name="displayName"
            autocomplete="nickname"
            required
            maxlength="60"
            value="${escapeAttr(this.displayName)}"
            placeholder="How others will see you"
            aria-describedby="display-name-hint"
          />
          <span id="display-name-hint" class="hint">Shown on your public profile at /u/your-handle.</span>
        </label>`}
        ${this.errorMessage ? `<div class="error" role="alert">${escapeHtml(this.errorMessage)}</div>` : ''}
        <button class="primary" type="submit" ${this.busy ? 'disabled' : ''}>
          ${this.busy ? 'Sending…' : 'Email me a code'}
        </button>
      </form>
    `;
  }

  private renderCodeStep(): string {
    return `
      <h2 id="auth-modal-title">Enter your code</h2>
      <p class="subtitle">Sent to <strong>${escapeHtml(this.email)}</strong>. Code expires in 10 minutes.</p>
      <form>
        <div class="code-grid">
          ${this.codeDigits.map((d, i) => `
            <input
              class="code-input"
              type="text"
              inputmode="numeric"
              autocomplete="${i === 0 ? 'one-time-code' : 'off'}"
              maxlength="1"
              value="${escapeAttr(d)}"
              aria-label="Digit ${i + 1}"
            />
          `).join('')}
        </div>
        <p class="paste-hint">Tip: paste the full code into any box.</p>
        ${this.errorMessage ? `<div class="error" role="alert">${escapeHtml(this.errorMessage)}</div>` : ''}
        <div class="row">
          <button class="ghost" type="button" data-action="back">← Use a different email</button>
          <button class="primary" type="submit" ${this.busy ? 'disabled' : ''}>
            ${this.busy ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </form>
    `;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch),
  );
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

const modalStyles = `
  :host { position: fixed; inset: 0; z-index: 2000; pointer-events: none; }
  .overlay {
    position: absolute; inset: 0;
    background: rgba(15, 23, 42, 0.4);
    display: grid; place-items: center;
    pointer-events: auto;
    backdrop-filter: blur(2px);
  }
  .dialog {
    position: relative;
    width: min(420px, calc(100vw - 32px));
    background: var(--bg-secondary, #fff);
    color: var(--text-primary, #1a1a2e);
    border-radius: 14px;
    border: 1px solid var(--border-color, #e2e8f0);
    box-shadow: var(--shadow-lg, 0 24px 48px rgba(0,0,0,0.18));
    padding: 1.75rem;
  }
  .close {
    position: absolute; top: 0.5rem; right: 0.75rem;
    background: none; border: none; font-size: 1.5rem;
    cursor: pointer; color: var(--text-secondary, #64748b);
  }
  h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
  .subtitle { margin: 0 0 1.25rem; color: var(--text-secondary, #64748b); font-size: 0.875rem; }
  .field { display: grid; gap: 0.35rem; margin-bottom: 0.9rem; font-size: 0.8125rem; color: var(--text-secondary, #64748b); }
  .field input {
    font: inherit; font-size: 0.9375rem;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-primary, #f8f9fa);
    color: var(--text-primary, #1a1a2e);
  }
  .field input:focus { outline: 2px solid var(--accent-color, #10b981); outline-offset: 1px; }
  .field .hint { font-size: 0.75rem; color: var(--text-tertiary, #94a3b8); }
  .error {
    background: var(--bg-error, #fee2e2);
    color: var(--text-error, #b91c1c);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    margin-bottom: 0.75rem;
  }
  button.primary {
    width: 100%;
    padding: 0.6rem 1rem;
    background: var(--accent-color, #10b981);
    color: var(--accent-text, #fff);
    border: none;
    border-radius: 8px;
    font: inherit; font-weight: 600;
    cursor: pointer;
  }
  button.primary:disabled { opacity: 0.6; cursor: progress; }
  button.primary:hover:not(:disabled) { filter: brightness(1.05); }
  button.ghost {
    background: none; border: none;
    color: var(--text-secondary, #64748b);
    font: inherit; font-size: 0.8125rem;
    cursor: pointer; padding: 0.5rem 0;
  }
  button.ghost:hover { color: var(--text-primary, #1a1a2e); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .row .primary { width: auto; padding: 0.55rem 1.5rem; }
  .code-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.4rem;
    margin: 0.25rem 0 1rem;
  }
  .code-input {
    /* Inputs have an intrinsic min-width that wins over the 1fr columns and
     * blows the grid out of the modal. Lock width to the cell. */
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
    font: inherit; font-size: 1.5rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    padding: 0.6rem 0;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-primary, #f8f9fa);
    color: var(--text-primary, #1a1a2e);
  }
  .code-input:focus { outline: 2px solid var(--accent-color, #10b981); outline-offset: 1px; }
  .paste-hint {
    margin: -0.25rem 0 0.75rem;
    font-size: 0.75rem;
    color: var(--text-tertiary, #94a3b8);
    text-align: center;
  }
`;

customElements.define('auth-modal', AuthModal);

export default AuthModal;
