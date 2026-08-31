// Shared compilation-status chip: one source of truth for the status→text/class
// map and the chip's look (colors, pulse animation). Consumers interpolate
// compilationStatusStyles() into their shadow <style> and keep positioning/
// layout local. Used by app-breadcrumb (workspace bar), svg-preview-pane
// (fullscreen chrome), and playground-header (storybook). Follows the
// fullscreen-toggle.ts style-string + helper pattern.

export interface CompilationStatusView {
  text: string;
  className: string;
}

export function compilationStatusView(status: string | null): CompilationStatusView {
  switch (status) {
    case 'compiling':
      return { text: 'Compiling...', className: 'compiling' };
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
