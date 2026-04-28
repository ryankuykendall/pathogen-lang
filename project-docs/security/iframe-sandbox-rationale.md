# Iframe Sandbox Rationale — `allow-same-origin` only

> Internal decision log. If we ever revisit how the playground / blog mini-workspace / VS Code preview sandboxes compiled SVG, this document captures the trade-off space we considered and why we chose what we did.

**Date:** 2026-04-27
**Phase:** SVG sanitization hardening, Phase 3 (see [the implementation plan](../../.claude/plans/i-was-reading-the-polished-peacock.md))
**Source motivation:** [*On Scratch SVG Sanitization*, muffin.ink, 2026](https://muffin.ink/blog/scratch-svg-sanitization/) — the article that prompted this entire workstream. After five years of growing the Scratch SVG sanitizer to chase new attack classes (CSS escapes, `image-set`, `var()` indirection, css-tree parser mismatches), the author concludes:
>
> *"The browser uses its pre-existing code to do the hard part for us… The SVG can't affect the main document."*
>
> The proposed structural fix is rendering compiled SVG inside an iframe with a strict CSP, so even a sanitizer regression cannot reach the host page.

We adopted that structural defense for the playground, the static blog mini-workspace, and the VS Code preview. The rest of this document explains why we chose `sandbox="allow-same-origin"` rather than the more restrictive options and what the alternative would have cost.

---

## Decision

The iframe carries `sandbox="allow-same-origin"` and a strict `<meta http-equiv="Content-Security-Policy">`. Specifically:

- **No `allow-scripts`** — scripts inside the iframe (inline or otherwise) never execute.
- **`allow-same-origin`** — the iframe's document shares the parent's origin, so the parent can read and write `iframe.contentDocument` directly via the same-origin DOM API.
- **CSP** `default-src 'none'; style-src 'unsafe-inline' data:; font-src data:; img-src data:; connect-src 'none'` — every external resource fetch is blocked at the browser level. Inline styles are allowed because compiled SVG legitimately uses `<style>` for `@property` declarations and the strict CSS-value validator (`src/evaluator/sanitize.ts`) already gates what those styles can contain. `data:` URIs are allowed for GPU-rasterized gradient images and embedded fonts.

This combination gives us:

1. **Structural style isolation** — a `<style>` inside the iframe SVG cannot leak to the parent document, regardless of whether the compiler validator catches every malicious shape.
2. **Structural script isolation** — even if some path lets a `<script>` slip through (it cannot, the compiler doesn't emit one and the fragment sanitizer rejects user-supplied ones, but defense in depth), it does not run.
3. **Structural network isolation** — no outbound HTTP requests can be initiated from the iframe (modulo `data:`), regardless of CSS escape tricks the compiler validator might miss in the future.
4. **Direct parent → iframe DOM access** — the parent can mount compiled SVG, attach event listeners for layer-click/hover, run zoom/pan logic, and read for the navigator preview, all via plain DOM API. No postMessage plumbing is required.

---

## Alternatives considered

### Option A: full `sandbox` (no `allow-same-origin`)

The iframe would receive a "null origin" — fully isolated from the parent JavaScript environment. The article's literal text describes this stronger boundary.

**Pros:**

- Maximum formal isolation. The parent cannot reach into the iframe to read or modify anything; the iframe cannot reach back into the parent.
- If a malicious actor ever finds a way to execute scripts inside the iframe (a future browser bug, a CSP bypass, etc.), they cannot reach the parent at all.

**Cons:**

- Layer-click / hover bridging breaks: the parent cannot attach event listeners to elements inside the iframe document. We would need an inline script *inside* the iframe to capture pointer events and `postMessage` them to the parent. That inline script then has to be CSP-allowed (`script-src 'unsafe-inline'`), which expands the script-execution surface inside the iframe — exactly the thing we are trying to minimize. Net: we'd be loosening CSP to compensate for losing same-origin reach.
- All zoom/pan, navigator content sync, layer-visibility toggling, and inspector layer-selection bridging would need a postMessage protocol. Realistic estimate ~1–2 days of UI plumbing, plus ongoing maintenance.
- Same-origin guards on the parent side (Shadow DOM, the strict CSP itself, the validators in `src/evaluator/sanitize.ts` and `src/evaluator/svg-sanitize.ts`) already cover the realistic attack surface our threat model worries about. The marginal protection of full sandbox would be against a hypothetical future browser bug, not a reachable attacker.

**Verdict:** rejected. The added isolation is not worth the script-execution surface we'd have to grant to compensate (the inline iframe script for postMessage), nor the rebuild cost.

### Option B: full `sandbox` + relax CSP to allow our own iframe script

Variant of A where we accept the postMessage rebuild and explicitly include the inline script's hash or a nonce in CSP `script-src`.

**Pros:**

- Keeps full origin isolation while letting layer-click bridging work.

**Cons:**

- We end up running a script inside the iframe anyway. The whole reason for "no scripts" was to make the iframe a script-free render surface; granting one inline script via hash partly defeats that property.
- More moving parts to maintain (script content hash must match the hardcoded shell exactly; any future shell change needs the hash regenerated).
- The article's recommended CSP is `default-src 'none'; style-src 'unsafe-inline' data:; font-src data:; img-src data:`, with no `script-src` allowance. Our adopted CSP matches that recommendation exactly, which makes the comparison cleaner if the article is ever updated.

**Verdict:** rejected. No real-world attacker is closer to reach with our chosen approach than with this one, and the maintenance cost is higher.

### Option C: no iframe; rely on Shadow DOM + the compiler-side validators

This is what the playground had before Phase 3. Compiled SVG is mounted directly into the Shadow DOM of `<svg-preview-pane>`.

**Pros:**

- Zero plumbing. Shadow DOM provides reasonable style isolation.

**Cons:**

- The article's whole point is that "reasonable style isolation" is not enough. `@property` registrations, CSS escape sequences, future CSS additions (`src()`, `image()`), and unknown future syntax all become attack vectors that the validator must keep up with. Each layer of compiler-side scrubbing becomes another piece of code to regress on.
- A network request from CSS `url(...)` cannot be blocked at the Shadow-DOM boundary; only a CSP can do that, and CSPs apply to documents (or iframes), not to shadow trees.
- This is the option Scratch chose for five years before pivoting to iframe + CSP. We are explicitly choosing not to repeat that path.

**Verdict:** rejected. We continue to maintain the compiler-side validators (Phase 1) as defense in depth, but the iframe is the structural backstop.

---

## When to revisit

Reconsider this decision if any of these things change:

- **Browser CSP support changes.** If `default-src 'none' + style-src 'unsafe-inline'` becomes too coarse — e.g. if a future browser adds a way for `style-src 'unsafe-inline'` to load fonts via `@font-face url(http…)` despite our `default-src 'none'` — then the iframe's CSP guarantees weaken and we may want to switch to full sandbox.
- **Same-origin DOM access becomes a privacy concern.** Today `allow-same-origin` does not let the iframe access cookies, localStorage, IndexedDB, or session storage outside its own document. If a future spec change relaxes that, we'd revisit.
- **The playground starts hosting third-party Pathogen content.** Currently the source is authored by the visitor or by a known shared link; we do not host an arbitrary-tenant playground. If we ever add per-user sandboxed namespaces with stronger trust boundaries, the marginal value of full sandbox goes up.
- **A specific exploit emerges that our compiler-side validators miss but full sandbox would have caught.** That would be a clear signal to upgrade.

If we revisit, this document is the decision record. The trade-off matrix below should be the starting point for the new decision.

---

## Trade-off matrix (summary)

| Property                                  | A: full sandbox (no same-origin) | A+B: full sandbox + inline script | **Chosen: allow-same-origin** | C: no iframe (Shadow DOM only) |
|-------------------------------------------|----------------------------------|------------------------------------|--------------------------------|--------------------------------|
| Structural style isolation                | ✓                                | ✓                                  | ✓                              | partial (Shadow DOM)           |
| Structural network isolation              | ✓                                | ✓                                  | ✓                              | ✗                              |
| Structural script isolation               | ✓                                | partial (one inline script allowed) | ✓                              | ✗                              |
| Layer click / hover bridging works as-is  | ✗ (rebuild)                      | ✓ (via postMessage)                | ✓ (direct DOM)                 | ✓                              |
| Maintenance load                          | high                             | high                               | low                            | low (but validator pressure)    |
| Implementation cost                       | 1–2 days                         | 1–2 days                           | 2–3 hours                      | 0 (existing)                   |

---

## Pitfall log

Captured during Phase 3 implementation so future maintainers don't repeat the diagnosis.

### The "Blocked script execution in 'about:srcdoc'" console warning

When the iframe is inserted into the DOM **before** `srcdoc` is set (e.g. via `<iframe>` in shadow-DOM `innerHTML` followed by `iframe.srcdoc = ...`), Chrome briefly loads `about:blank` first, fires one "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set" warning per iframe, *then* loads the srcdoc. The warning is a preemptive Chrome notice — there are no actual scripts in the iframe. Diagnostic confirmed it: with N iframes on a page, querying `iframe.contentDocument.querySelectorAll('script')` returns 0 for every one of them, yet the warning fires.

**Fix:** create the iframe via `document.createElement('iframe')`, set `sandbox` and `srcdoc` *before* appending to the parent. The first (and only) load is then the srcdoc, no `about:blank` phase, no spurious warning. See `playground/utils/preview-iframe.ts` `bootstrapPreviewIframe`.

### Persistent "Blocked script execution in 'about:srcdoc'" warnings (Chrome stable)

Distinct from the spurious-on-load warning above: a small number of "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set." warnings appear in the user's installed Chrome stable (e.g. on the blog-static page with 6 mini-workspace iframes, 2–3 warnings reproducibly fire). Puppeteer's bundled Chromium does **not** fire them; only Chrome stable does, and only with DevTools open (the warnings come through the CDP `security` log channel).

We instrumented exhaustively before concluding:

- A `MutationObserver` installed on every iframe document at `_setupIframe` time captured every node insertion (`childList: true, subtree: true, attributes: true`). Across 6 iframes on the failing page: zero `<script>` insertions, zero `on*` attribute mutations, zero `href`/`xlink:href="javascript:..."` mutations. After every `setSvgContent` call, `iframe.contentDocument.querySelectorAll('script').length === 0`.
- A minimal repro page with 6 sandboxed iframes containing only our srcdoc shell — no SVG content imported — fires zero warnings. Adding actual SVG samples via `importNode` reproduces the warnings.
- Bisecting content shapes: `<style>+<rect>`, `<defs>+<rect>` with fragment ref, and even `<rect/>` alone (no style, no defs) sometimes trigger the warning, while `<style>` alone, `<defs>` alone, or `<rect fill="url(#g)"/>` alone do not. The trigger isn't a specific element class; it's a Chrome internal heuristic on certain combinations of rendered geometry inside a sandboxed iframe.
- Re-running with `--disable-extensions` does not silence the warnings — they are emitted by Chrome's own internal pipeline, not by an extension's blocked content-script injection.

**Disposition:** harmless console noise. The sandbox is doing its job; no script execution is ever attempted in our iframes (`MutationObserver` proved this conclusively). Do not add `allow-scripts` to the sandbox flag and do not widen CSP `script-src` to silence the warning — both would regress the structural defense that motivates this whole document. The warning is not an actionable security signal.

If a future Chrome-stable update changes the warning's wording or makes it CDP-actionable (e.g. surfaces the offending element), revisit this entry.

### `<script type="application/json">` in compiled SVG samples

Every SVG file produced by the CLI's `--output-svg-file` mode bundles a `<script type="application/json" id="pathogen-metadata">` block carrying inspector data. The browser's sandbox correctly blocks its execution, but importing the element via `Document.importNode` triggers the same console warning. The blog mini-preview never reads this metadata, so we strip every `<script>` descendant from the parsed SVG before the import loop. See `playground/components/blog/mini-preview.ts` `setSvgContent`.

### Mouse events inside an iframe do not bubble

Mousedown / mouseup / mousemove / wheel events fired inside a sandboxed-allow-same-origin iframe **do not bubble to the parent document**, even though the parent can read `iframe.contentDocument` directly. Pan handlers must be attached to `iframe.contentDocument` (mousemove and mouseup, not just mousedown) or the pan state gets stuck "on" — startPan fires, but doPan and endPan never run. Document-level move/up listeners remain useful for catching drags that travel out of the iframe boundary, but cannot replace the iframe-doc listeners.

### CSS custom properties do not cross the iframe boundary

Code that previously wrote `previewElement.style.setProperty('--brand', value)` and relied on the variable cascading into an inline SVG inside shadow DOM stops working once the SVG moves into the iframe. Each iframe document is its own DOM with its own root element; parent CSS doesn't reach in. The fix is a `setCssVar` / `removeCssVar` method on each preview component that writes to `iframe.contentDocument.documentElement.style.setProperty(...)`. See the inspector cssvar-override flow in `playground/components/workspace-view.ts` and the chip-group flow in `playground/components/blog/mini-workspace.ts`.

## Implementation references

- Iframe shell + CSP: `playground/utils/preview-iframe.ts` (introduced in Phase 3)
- Playground integration: `playground/components/svg-preview-pane.ts`
- Blog mini-workspace: `scripts/build-blog.ts` and the rendered `<mini-workspace>` web component
- VS Code preview: `packages/vscode-pathogen/src/preview.ts` — webview already iframe-isolated by VS Code; CSP tightened to match this document
- Compiler-side validators (defense in depth): `src/evaluator/sanitize.ts`, `src/evaluator/svg-sanitize.ts`
- User-facing docs: [`docs/security.md`](../../docs/security.md)
- Threat model: [`project-docs/security/threat-model.md`](threat-model.md)
