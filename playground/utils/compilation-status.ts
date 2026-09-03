// Shared compilation-status chip: one source of truth for the status→text/class
// map and the chip's look (colors, pulse animation). Consumers interpolate
// compilationStatusStyles() into their shadow <style> and keep positioning/
// layout local. Used by app-breadcrumb (workspace bar), svg-preview-pane
// (fullscreen chrome), and playground-header (storybook). Follows the
// fullscreen-toggle.ts style-string + helper pattern.
//
// The compiling chip carries an elapsed clock ("Compiling... MM:SS"). The
// value comes from store.compilationElapsedMs, ticked once a second by
// workspace-view's compile ticker (utils/compile-ticker.ts); consumers just
// paint what the store says.

export interface CompilationStatusView {
  text: string;
  className: string;
}

/**
 * Elapsed time as an `MM:SS` clock: whole seconds, minutes zero-padded to two
 * digits and allowed to grow past 99 (`100:00`). Returns `00:00` for negative
 * or non-finite input.
 */
export function formatElapsedClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Status → chip text/class. `elapsedMs` only affects the compiling chip
 * (`Compiling... MM:SS`); every other status ignores it.
 */
export function compilationStatusView(status: string | null, elapsedMs = 0): CompilationStatusView {
  switch (status) {
    case 'compiling':
      return { text: `Compiling... ${formatElapsedClock(elapsedMs)}`, className: 'compiling' };
    case 'rendering':
      return { text: 'Rendering...', className: 'rendering' };
    case 'completed':
      return { text: 'Ready', className: 'completed' };
    case 'error':
      return { text: 'Error', className: 'error' };
    default:
      return { text: '', className: 'hidden' };
  }
}

/**
 * The chip's appearance: base type/padding, per-status colors, and the pulse
 * keyframes. Positioning is the consumer's responsibility.
 */
export function compilationStatusStyles(): string {
  return `
    .compilation-status {
      font-size: 0.75rem;
      font-family: var(--font-mono, 'Inconsolata', monospace);
      font-weight: 500;
      padding: 4px 8px;
      border-radius: var(--radius-sm, 4px);
      transition: all var(--transition-base, 0.2s ease);
    }

    .compilation-status.hidden {
      display: none;
    }

    .compilation-status.compiling {
      background: var(--info-bg, #cce5ff);
      color: var(--info-color, #004085);
      animation: pulse 1s infinite;
    }

    .compilation-status.rendering {
      background: var(--warning-bg, #fff3cd);
      color: var(--warning-color, #856404);
      animation: pulse 0.5s infinite;
    }

    .compilation-status.completed {
      background: var(--success-bg, #d4edda);
      color: var(--success-color, #155724);
    }

    .compilation-status.error {
      background: var(--error-bg, #f8d7da);
      /* --error-text (not --error-color) pairs with --error-bg in both themes:
         dark --error-bg is a 0.6-alpha red, on which --error-color's #ef4444
         is red-on-red and illegible. */
      color: var(--error-text, #721c24);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
}
