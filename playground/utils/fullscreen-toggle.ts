// Shared fullscreen toggle behavior for SVG preview components
// Adds a button next to the navigator minimap that toggles :host(.fullscreen)

export const FULLSCREEN_EXPAND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

export const FULLSCREEN_COLLAPSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/**
 * Returns CSS rules for the fullscreen toggle button and :host(.fullscreen).
 * @param navWidth Navigator minimap width in px (120 for workspace, 100 for mini)
 * @param offset Navigator offset from edge in rem (1 for workspace, 0.5 for mini)
 */
export function fullscreenStyles(navWidth: number, offset: number): string {
  return `
    #fullscreen-toggle {
      position: absolute;
      top: ${offset}rem;
      left: calc(${offset}rem + ${navWidth}px + 0.5rem);
      width: 32px;
      height: 32px;
      padding: 0;
      display: grid;
      place-items: center;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      background: var(--bg-elevated, #ffffff);
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      box-shadow: var(--shadow-md);
      z-index: 10;
    }

    /* Opaque hover fill: 0.9 accent tint over the solid base — the old
       --accent-subtle wash replaced the base at 0.10/0.15 alpha and let
       artwork bleed through. Matches the preview pane's chrome buttons;
       see the hover-colors .mw prototype in website/bbwp/. */
    #fullscreen-toggle:hover {
      border-color: var(--accent-hover, #b04680);
      color: var(--accent-contrast, #1c1722);
      /* Plain background = no-color-mix() fallback (dark base fill equals
         --accent-contrast, which would hide the icon). */
      background: var(--accent-color, #c0518e);
      background: color-mix(in srgb, var(--accent-color, #c0518e) 90%, var(--bg-elevated, #ffffff));
    }

    #fullscreen-toggle svg {
      width: 16px;
      height: 16px;
    }

    :host(.fullscreen) {
      position: fixed !important;
      inset: 0 !important;
      z-index: 9999 !important;
      box-sizing: border-box !important;
      width: 100vw !important;
      height: 100vh !important;
      height: 100dvh !important;
      max-height: none !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border-radius: 0 !important;
      border: none !important;
      overflow: hidden !important;
      background: var(--bg-primary, #f8f9fa) !important;
    }
  `;
}

/**
 * Returns the fullscreen toggle button HTML with the expand icon.
 */
export function fullscreenButtonHTML(): string {
  return `<button id="fullscreen-toggle" title="Toggle fullscreen">${FULLSCREEN_EXPAND_ICON}</button>`;
}

/**
 * Wires up click and ESC key handlers for the fullscreen toggle button.
 * Returns a cleanup function for disconnectedCallback.
 */
export function attachFullscreenBehavior(
  host: HTMLElement,
  shadowRoot: ShadowRoot,
): () => void {
  const btn = shadowRoot.querySelector('#fullscreen-toggle') as HTMLButtonElement;
  if (!btn) return () => {};

  let isFullscreen = false;

  const toggle = (): void => {
    isFullscreen = !isFullscreen;
    host.classList.toggle('fullscreen', isFullscreen);
    btn.innerHTML = isFullscreen ? FULLSCREEN_COLLAPSE_ICON : FULLSCREEN_EXPAND_ICON;
    btn.title = isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen';

    host.dispatchEvent(
      new CustomEvent('fullscreen-change', {
        bubbles: true,
        composed: true,
        detail: { fullscreen: isFullscreen },
      }),
    );
  };

  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && isFullscreen) {
      e.stopPropagation();
      toggle();
    }
  };

  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', handleKeydown);

  return () => {
    btn.removeEventListener('click', toggle);
    document.removeEventListener('keydown', handleKeydown);
    if (isFullscreen) {
      host.classList.remove('fullscreen');
    }
  };
}
