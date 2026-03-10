// Theme management - handles light/dark mode with system preference detection

const STORAGE_KEY = 'pathogen-theme';

/**
 * Theme values:
 * - 'light': Force light mode
 * - 'dark': Force dark mode
 * - 'system': Follow OS preference (default)
 */

type ThemePreference = 'light' | 'dark' | 'system';
type ActiveTheme = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  active: ActiveTheme;
}

type ThemeListener = (state: ThemeState) => void;

class ThemeManager {
  _listeners: Set<ThemeListener>;
  _mediaQuery: MediaQueryList;

  constructor() {
    this._listeners = new Set();
    this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Listen for OS preference changes
    this._mediaQuery.addEventListener('change', () => {
      if (this.getPreference() === 'system') {
        this._applyTheme();
        this._notifyListeners();
      }
    });
  }

  /**
   * Get the stored theme preference
   */
  getPreference(): ThemePreference {
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
  }

  /**
   * Get the currently active theme (resolved from preference)
   */
  getActiveTheme(): ActiveTheme {
    const preference = this.getPreference();
    if (preference === 'system') {
      return this._mediaQuery.matches ? 'dark' : 'light';
    }
    return preference;
  }

  /**
   * Set the theme preference
   */
  setPreference(theme: ThemePreference): void {
    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    this._applyTheme();
    this._notifyListeners();
  }

  /**
   * Cycle through themes: system -> light -> dark -> system
   */
  cycle(): void {
    const current = this.getPreference();
    const next: ThemePreference =
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    this.setPreference(next);
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(callback: ThemeListener): () => void {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Initialize theme on page load
   */
  init(): void {
    this._applyTheme();
  }

  _applyTheme(): void {
    const preference = this.getPreference();
    const active = this.getActiveTheme();

    // Update document attribute for CSS
    if (preference === 'system') {
      // Remove explicit theme to let media query handle it
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', preference);
    }

    // Also set a data attribute for the active theme (useful for components)
    document.documentElement.setAttribute('data-active-theme', active);
  }

  _notifyListeners(): void {
    const state: ThemeState = {
      preference: this.getPreference(),
      active: this.getActiveTheme(),
    };
    this._listeners.forEach((fn) => fn(state));
  }
}

// Singleton instance
export const themeManager = new ThemeManager();

// Initialize on module load
themeManager.init();
