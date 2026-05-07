// <account-menu> — small header chip.
// Not-signed-in: "Sign in" pill button.
// Signed-in: chip with display name; clicking opens a dropdown with
// "View profile" and "Sign out".

import { signOut, type CurrentUser } from '../../services/auth.js';
import { store } from '../../state/store.js';

class AccountMenu extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private menuOpen = false;
  private outsideClick: ((e: MouseEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.unsubscribe = store.subscribe(['currentUser'], () => this.render());
    this.outsideClick = (e: MouseEvent): void => {
      if (!this.menuOpen) return;
      const path = e.composedPath();
      if (!path.some((n) => n === this)) {
        this.menuOpen = false;
        this.render();
      }
    };
    document.addEventListener('click', this.outsideClick);
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    if (this.outsideClick) document.removeEventListener('click', this.outsideClick);
  }

  private openSignIn(): void {
    store.set('authModalOpen', true);
  }

  private async handleSignOut(): Promise<void> {
    this.menuOpen = false;
    await signOut();
    this.render();
  }

  private render(): void {
    const user = store.get('currentUser') as CurrentUser | null;
    if (!user) {
      this.shadowRoot!.innerHTML = `
        <style>${baseStyles}</style>
        <button class="signin-btn" type="button">Sign in</button>
      `;
      this.shadowRoot!.querySelector('.signin-btn')!.addEventListener('click', () => this.openSignIn());
      return;
    }

    this.shadowRoot!.innerHTML = `
      <style>${baseStyles}</style>
      <div class="wrap">
        <button class="chip" type="button" aria-haspopup="menu" aria-expanded="${this.menuOpen}">
          <span class="initial">${escapeHtml(initialOf(user.displayName))}</span>
          <span class="name">${escapeHtml(user.displayName)}</span>
          <svg class="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        ${this.menuOpen ? `
          <div class="menu" role="menu">
            <a class="menu-item" role="menuitem" href="/pathogen/u/${encodeURIComponent(user.handle)}">
              <span class="menu-label">View profile</span>
              <span class="menu-handle">@${escapeHtml(user.handle)}</span>
            </a>
            <button class="menu-item" type="button" role="menuitem" data-action="signout">
              Sign out
            </button>
          </div>
        ` : ''}
      </div>
    `;

    this.shadowRoot!.querySelector('.chip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.menuOpen = !this.menuOpen;
      this.render();
    });
    this.shadowRoot!.querySelector('[data-action="signout"]')?.addEventListener('click', () => {
      this.handleSignOut();
    });
  }
}

function initialOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const [first, second] = trimmed.split(/\s+/);
  if (second) return (first[0] + second[0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch),
  );
}

const baseStyles = `
  :host { display: inline-flex; position: relative; }
  /*
   * .signin-btn is a "tonal" button: accent-colored border + label on a
   * transparent background. Sits one step below the solid-accent primary
   * style used inside the modal — appropriate here because the header has
   * other accent-tinted elements (active nav link, etc.) and a third solid
   * green pill creates color crowding.
   */
  .signin-btn {
    background: transparent;
    color: var(--accent-color, #10b981);
    border: 1px solid var(--accent-color, #10b981);
    border-radius: 8px;
    padding: 0.4rem 0.9rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-base, 0.15s ease),
                color var(--transition-base, 0.15s ease),
                border-color var(--transition-base, 0.15s ease);
  }
  .signin-btn:hover {
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
    color: var(--accent-hover, #059669);
    border-color: var(--accent-hover, #059669);
  }
  .signin-btn:focus-visible {
    outline: 2px solid var(--focus-ring, rgba(16, 185, 129, 0.4));
    outline-offset: 2px;
  }

  .wrap { position: relative; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.4rem;
    background: var(--bg-elevated, #f1f5f9);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 999px;
    padding: 0.25rem 0.5rem 0.25rem 0.25rem;
    cursor: pointer;
    color: var(--text-primary, #1a1a2e);
    font: inherit;
    font-size: 0.8125rem;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .chip:hover { background: var(--hover-bg, rgba(0,0,0,0.04)); }
  .initial {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: var(--accent-color, #10b981);
    color: var(--accent-text, #fff);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .name {
    max-width: 12ch;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .chev { opacity: 0.6; }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 200px;
    background: var(--bg-secondary, #fff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,0.08));
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }
  .menu-item {
    display: flex; flex-direction: column; align-items: flex-start;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    text-align: left;
    text-decoration: none;
    color: var(--text-primary, #1a1a2e);
    font: inherit;
    font-size: 0.8125rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .menu-item:hover { background: var(--hover-bg, rgba(0,0,0,0.04)); }
  .menu-label { font-weight: 500; }
  .menu-handle { font-size: 0.75rem; color: var(--text-secondary, #64748b); font-family: var(--font-mono, ui-monospace, monospace); }
`;

customElements.define('account-menu', AccountMenu);

export default AccountMenu;
