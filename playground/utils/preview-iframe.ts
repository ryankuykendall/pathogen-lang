/**
 * Sandboxed iframe shell for rendering compiled SVG.
 *
 * Why an iframe: see project-docs/security/iframe-sandbox-rationale.md and
 * docs/security.md. The short version is that compiler-side validators
 * (src/evaluator/sanitize.ts, svg-sanitize.ts) are defense-in-depth; this
 * iframe is the structural defense the article at
 * https://muffin.ink/blog/scratch-svg-sanitization/ recommends — even if the
 * compiler regresses, a `<style>` injection inside the SVG cannot reach the
 * parent document, and `default-src 'none'` blocks every external request.
 *
 * Sandbox flags: `allow-same-origin` only. No `allow-scripts` — scripts in
 * the iframe never execute. The parent attaches event listeners directly to
 * `iframe.contentDocument` because same-origin makes that reach legal.
 */

const IFRAME_CSP =
  "default-src 'none'; " +
  "script-src 'none'; " +
  "style-src 'unsafe-inline' data:; " +
  'font-src data:; ' +
  'img-src data:; ' +
  "connect-src 'none';";

/**
 * The static HTML shell loaded into the sandboxed iframe via `srcdoc`.
 *
 * The shell mirrors the previous Shadow-DOM `<svg id="preview">` structure so
 * the rest of the playground (zoom/pan, navigator, layer visibility) can keep
 * the same `#preview-bg`, `#preview-grid`, `#preview-layers`, `#preview-path`
 * IDs and selectors — only the document those queries run against changes.
 *
 * The grid pattern definition lives in the shell rather than being injected
 * by JS so that compiled SVG cannot interfere with it.
 */
/**
 * Shared HTML head — CSP, styles, and reset rules. The `<body>` content is
 * appended per shell variant (full playground preview, blog mini-preview).
 */
const COMMON_HEAD = `<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: transparent; }
  body { display: block; }
  svg#preview { display: block; width: 100%; height: 100%; position: absolute; left: 50%; top: 50%; translate: -50% -50%; }
  body.panning { cursor: grabbing; }
  body.can-pan { cursor: grab; }
</style>
</head>`;

/**
 * Full playground preview shell — defs (grid pattern), preview background,
 * grid overlay, layers group, and the legacy single-path fallback.
 */
export const IFRAME_SRCDOC = `<!DOCTYPE html>
<html>
${COMMON_HEAD}
<body>
<svg id="preview" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid-pattern" patternUnits="userSpaceOnUse">
      <path id="grid-path" fill="none" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect id="preview-bg" width="100%" height="100%"></rect>
  <rect id="preview-grid" width="100%" height="100%" fill="url(#grid-pattern)"></rect>
  <g id="preview-layers"></g>
  <path id="preview-path" fill="none"></path>
</svg>
</body>
</html>`;

/**
 * Blog mini-preview shell — simpler than the full playground preview. The
 * `#preview-content` group receives the parsed children of a pre-rendered
 * SVG (see playground/components/blog/mini-preview.ts).
 */
export const IFRAME_SRCDOC_MINI = `<!DOCTYPE html>
<html>
${COMMON_HEAD}
<body>
<svg id="preview" xmlns="http://www.w3.org/2000/svg">
  <rect id="preview-bg" width="100%" height="100%"></rect>
  <g id="preview-content"></g>
</svg>
</body>
</html>`;

/**
 * Configure an `<iframe>` with sandbox + srcdoc and return a promise that
 * resolves when the inner document has parsed.
 *
 * Sets `sandbox` and `srcdoc` BEFORE the iframe is appended to the DOM. If
 * the iframe is already attached when this runs, Chrome will load `about:blank`
 * first, fire one sandbox-warning, then load the srcdoc — even though no
 * scripts ever exist. Pre-setting both attributes makes the initial document
 * the srcdoc, eliminating the spurious warning.
 *
 * The caller is responsible for appending the iframe to the DOM AFTER this
 * function returns (we can't do it here without knowing the parent), but the
 * `srcdoc` and `sandbox` attributes are already set on the element.
 */
export function bootstrapPreviewIframe(
  iframe: HTMLIFrameElement,
  variant: 'full' | 'mini' = 'full',
): Promise<Document> {
  // Set sandbox + srcdoc before the iframe enters the DOM so the initial
  // load IS the srcdoc — skipping the about:blank phase that triggers a
  // spurious "Blocked script execution" warning per iframe in Chrome.
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('title', 'Compiled SVG preview (sandboxed)');
  iframe.srcdoc = variant === 'mini' ? IFRAME_SRCDOC_MINI : IFRAME_SRCDOC;
  return new Promise<Document>((resolve, reject) => {
    const onLoad = (): void => {
      iframe.removeEventListener('load', onLoad);
      const doc = iframe.contentDocument;
      if (!doc) {
        reject(new Error('iframe.contentDocument unavailable after load — same-origin sandbox may have failed'));
        return;
      }
      resolve(doc);
    };
    iframe.addEventListener('load', onLoad);
    // If the iframe is already in the DOM, the load event will fire on its
    // own. If not, the caller appends it after this returns and the load
    // event fires from that insertion.
  });
}
