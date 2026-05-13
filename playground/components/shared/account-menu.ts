// <account-menu> — small header chip.
// Not-signed-in: "Sign in" pill button.
// Signed-in: chip with display name; clicking opens a dropdown with
// "View profile" and "Sign out".

import { bootstrapCurrentUser, signOut, type CurrentUser } from '../../services/auth.js';
import { store } from '../../state/store.js';
import { hasEverSignedIn } from '../../services/user-id.js';

class AccountMenu extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private menuOpen = false;
  private outsideClick: ((e: MouseEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Server-rendered pages (homepage, /explore, /featured, /u/:handle, blog)
    // ship with `window.__SSR_CURRENT_USER` populated when the request had a
    // valid session cookie. Hydrate the store from that seed so the chip
    // renders the signed-in state on first paint, before any SPA bootstrap
    // has run. The SPA's own bootstrapCurrentUser() will overwrite this
    // later with the full /api/me response.
    if (!store.get('currentUser')) {
      const seed = (window as unknown as { __SSR_CURRENT_USER?: CurrentUser }).__SSR_CURRENT_USER;
      if (seed && seed.handle && seed.displayName) {
        store.set('currentUser', seed as unknown);
      }
    }

    this.render();
    this.unsubscribe = store.subscribe(['currentUser'], () => this.render());

    // SSR-only pages (homepage, /explore, /featured, blog, /u/:handle) don't
    // run the SPA's app-shell bootstrap, so /me is never called from there.
    // In dev, the session cookie is scoped to the API host (localhost:8787)
    // and the Pages worker at localhost:3000 can't read it for SSR seeding,
    // which leaves the chip stuck on "Sign in" even for signed-in users.
    // Self-bootstrap from /me when there's no SSR seed AND no store user
    // AND we have a hint the user has signed in before — that last condition
    // avoids an /me call for first-time visitors who have never authed.
    if (!store.get('currentUser') && hasEverSignedIn()) {
      void bootstrapCurrentUser();
    }
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
            <a class="menu-item" role="menuitem" href="/u/${encodeURIComponent(user.handle)}">
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
    background: var(--bg-tertiary, rgba(28, 23, 34, 0.05));
    color: var(--secondary-accent-text, #5e3590);
    border: 1px solid var(--border-subtle, rgba(28, 23, 34, 0.06));
    border-radius: 999px;
    padding: 0.3rem 0.85rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background var(--transition-base, 0.15s ease),
                color var(--transition-base, 0.15s ease),
                border-color var(--transition-base, 0.15s ease),
                transform var(--transition-base, 0.15s ease);
  }
  .signin-btn:hover {
    background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16));
    border-color: var(--secondary-accent, #9461c4);
    transform: translateY(-1px);
  }
  .signin-btn:focus-visible {
    outline: 2px solid var(--focus-ring, rgba(192, 81, 142, 0.4));
    outline-offset: 2px;
  }

  .wrap { position: relative; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.5rem;
    background: var(--bg-tertiary, rgba(28, 23, 34, 0.05));
    border: 1px solid var(--border-subtle, rgba(28, 23, 34, 0.06));
    border-radius: 999px;
    padding: 0.2rem 0.7rem 0.2rem 0.2rem;
    cursor: pointer;
    color: var(--text-primary, #1c1722);
    font: inherit;
    font-size: 0.8125rem;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .chip:hover {
    background: var(--secondary-accent-subtle, rgba(148, 97, 196, 0.16));
    border-color: var(--secondary-accent, #9461c4);
  }
  .initial {
    width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--secondary-from, #b384e0) 0%, var(--secondary-to, #6d3aa6) 100%);
    color: #ffffff;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
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
