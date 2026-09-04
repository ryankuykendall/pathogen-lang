// Global toast notifications for confirmation + error feedback.
//
// Listens for `show-toast` document events. Each toast renders as a
// stacked card in the top-right with optional thumbnail image, title,
// message, type (success | error), and auto-dismiss timer. Clicking
// the dismiss button or waiting `duration` ms removes it.
//
// Dispatch pattern:
//   document.dispatchEvent(new CustomEvent('show-toast', {
//     bubbles: true, composed: true,
//     detail: { type: 'success', title: 'Thumbnail set', message: '...', image: '/foo.png', duration: 4000 }
//   }));

export type ToastType = 'success' | 'error';

export interface ToastDetail {
  type?: ToastType;
  title: string;
  message?: string;
  image?: string;
  duration?: number;
  /** Optional call-to-action; selecting it runs the handler and dismisses the toast. */
  action?: { label: string; onSelect: () => void };
}

const DEFAULT_DURATION = 4500;

const styles = `
  :host {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: var(--z-toast, 400);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    max-width: min(360px, calc(100vw - 2rem));
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }

  .toast {
    pointer-events: auto;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 0.875rem;
    background: var(--bg-elevated, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-left: 3px solid var(--accent-color, #10b981);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.15));
    color: var(--text-primary, #1a1a2e);
    font-size: 0.8125rem;
    line-height: 1.4;
    animation: slide-in 180ms ease-out;
    min-width: 0;
  }

  .toast.error {
    border-left-color: var(--error-color, #ef4444);
  }

  .toast.leaving {
    animation: slide-out 160ms ease-in forwards;
  }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(12px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes slide-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(12px); }
  }

  .thumb {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm, 6px);
    object-fit: cover;
    background: var(--bg-secondary, #f3f4f6);
    border: 1px solid var(--border-color, #e2e8f0);
    display: block;
    flex-shrink: 0;
  }

  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--text-primary, #1a1a2e);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .message {
    font-size: 0.75rem;
    color: var(--text-secondary, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .action {
    align-self: flex-start;
    margin-top: 0.35rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid currentColor;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.85em;
    cursor: pointer;
  }
  .action:hover {
    background: rgba(127, 127, 127, 0.15);
  }
  .dismiss {
    background: transparent;
    border: none;
    color: var(--text-tertiary, #94a3b8);
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  .dismiss:hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.05));
    color: var(--text-primary, #1a1a2e);
  }
`;

let toastSeq = 0;

export class AppToast extends HTMLElement {
  private _onShow: ((e: Event) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.shadowRoot!.innerHTML = `<style>${styles}</style>`;
    this._onShow = (e: Event): void => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail || !detail.title) return;
      this.show(detail);
    };
    document.addEventListener('show-toast', this._onShow);
  }

  disconnectedCallback(): void {
    if (this._onShow) {
      document.removeEventListener('show-toast', this._onShow);
      this._onShow = null;
    }
  }

  show(opts: ToastDetail): void {
    const type: ToastType = opts.type ?? 'success';
    const duration = opts.duration ?? DEFAULT_DURATION;
    const id = `toast-${++toastSeq}`;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.id = id;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    if (opts.image) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = '';
      img.src = opts.image;
      toast.appendChild(img);
    } else {
      // Reserve the column so the body alignment matches with/without image.
      const spacer = document.createElement('span');
      spacer.style.width = '0';
      toast.appendChild(spacer);
    }

    const body = document.createElement('div');
    body.className = 'body';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = opts.title;
    body.appendChild(title);
    if (opts.message) {
      const msg = document.createElement('span');
      msg.className = 'message';
      msg.textContent = opts.message;
      body.appendChild(msg);
    }
    if (opts.action) {
      const act = document.createElement('button');
      act.className = 'action';
      act.textContent = opts.action.label;
      act.addEventListener('click', () => {
        opts.action!.onSelect();
        this._dismiss(toast);
      });
      body.appendChild(act);
    }
    toast.appendChild(body);

    const dismiss = document.createElement('button');
    dismiss.className = 'dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => this._dismiss(toast));
    toast.appendChild(dismiss);

    this.shadowRoot!.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this._dismiss(toast), duration);
    }
  }

  private _dismiss(toast: HTMLElement): void {
    if (!toast.isConnected || toast.classList.contains('leaving')) return;
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }
}

customElements.define('app-toast', AppToast);

export default AppToast;
