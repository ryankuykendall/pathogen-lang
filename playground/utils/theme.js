// Theme management - handles light/dark mode with system preference detection

const STORAGE_KEY = 'pathogen-theme';

/**
 * Theme values:
 * - 'light': Force light mode
 * - 'dark': Force dark mode
 * - 'system': Follow OS preference (default)
 */

class ThemeManager {
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
   * @returns {'light' | 'dark' | 'system'}
   */
  getPreference() {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  }

  /**
   * Get the currently active theme (resolved from preference)
   * @returns {'light' | 'dark'}
   */
  getActiveTheme() {
    const preference = this.getPreference();
    if (preference === 'system') {
      return this._mediaQuery.matches ? 'dark' : 'light';
    }
    return preference;
  }

  /**
   * Set the theme preference
   * @param {'light' | 'dark' | 'system'} theme
   */
  setPreference(theme) {
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
  cycle() {
    const current = this.getPreference();
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    this.setPreference(next);
  }

  /**
   * Subscribe to theme changes
   * @param {(theme: {preference: string, active: string}) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Initialize theme on page load
   */
  init() {
    this._applyTheme();
  }

  _applyTheme() {
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

  _notifyListeners() {
    const state = {
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
