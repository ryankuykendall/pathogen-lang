// Theme Toggle — standalone web component
// Works in both the SPA and static SEO pages with no external imports.
// Reads/writes the same localStorage key as utils/theme.js.

const STORAGE_KEY = 'pathogen-theme';

type ThemePreference = 'system' | 'light' | 'dark';

const icons: Record<ThemePreference, string> = {
  system: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <path d="M8 21h8M12 17v4"/>
  </svg>`,
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>`,
  dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,
};

const titles: Record<ThemePreference, string> = {
  system: 'System theme (click to switch to light)',
  light: 'Light mode (click to switch to dark)',
  dark: 'Dark mode (click to switch to system)',
};

const styles = `
  :host { display: inline-flex; }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-secondary, #ffffff);
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    transition: all var(--transition-base, 0.15s ease);
    padding: 0;
  }
  button:hover {
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }
  button svg {
    width: 18px;
    height: 18px;
    transition: transform var(--transition-base, 0.15s ease);
  }
  button:hover svg {
    transform: rotate(15deg);
  }
`;

class ThemeToggle extends HTMLElement {
  private _onSystemChange: () => void;
  private _mediaQuery: MediaQueryList | undefined;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._onSystemChange = () => {
      if (this._getPreference() === 'system') this._applyTheme();
    };
  }

  connectedCallback(): void {
    this._render();
    (this.shadowRoot!.querySelector('button') as HTMLButtonElement).addEventListener('click', () => this._cycle());
    this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this._mediaQuery.addEventListener('change', this._onSystemChange);
    this._applyTheme();
  }

  disconnectedCallback(): void {
    if (this._mediaQuery) {
      this._mediaQuery.removeEventListener('change', this._onSystemChange);
    }
  }

  _getPreference(): ThemePreference {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
  }

  _cycle(): void {
    const current = this._getPreference();
    const next: ThemePreference = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    this._applyTheme();
    this._updateButton();
    this.dispatchEvent(
      new CustomEvent('theme-change', {
        bubbles: true,
        composed: true,
        detail: { preference: next },
      }),
    );
  }

  _applyTheme(): void {
    const pref = this._getPreference();
    if (pref === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', pref);
    }
    const active: string =
      pref === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-active-theme', active);
  }

  _updateButton(): void {
    const btn = this.shadowRoot!.querySelector('button') as HTMLButtonElement | null;
    if (!btn) return;
    const pref = this._getPreference();
    btn.innerHTML = icons[pref];
    btn.title = titles[pref];
  }

  _render(): void {
    const pref = this._getPreference();
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>
      <button title="${titles[pref]}">${icons[pref]}</button>
    `;
  }
}

if (!customElements.get('theme-toggle')) {
  customElements.define('theme-toggle', ThemeToggle);
}

export default ThemeToggle;
