// Shared escaping helpers for components that render rows via innerHTML
// string building (layers-panel, palette-panel).

/** Escape a string for interpolation into HTML text or a double-quoted attribute. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Gate a CSS value before interpolating it into a `style="…"` attribute.
 *
 * Style values reaching the panels are already constrained by the evaluator's
 * `validateCSSValue` allow-list (src/evaluator/sanitize.ts), which forbids
 * `;`/`{`/`}`. This guard is deliberate defense-in-depth so the playground's
 * safety does not depend solely on that separate subsystem's invariant:
 * innerHTML-interpolated style attributes are in the PARENT document, not the
 * sandboxed preview iframe. Returns null (caller falls back to a neutral
 * swatch) when the value could break out of its declaration.
 */
export function cssValueForStyleAttr(value: string): string | null {
  return /[;{}]/.test(value) ? null : value;
}
