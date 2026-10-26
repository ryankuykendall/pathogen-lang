# Phase 0b — design-review corrections (2026-10-22)

The approved plan is `03-phase-0b-plan.md`. A Plan-agent design review and an
advisor pass finished around approval time; this file records which of their
findings change how the plan is implemented. Nothing here changes a user
decision; items that would are listed at the end as open.

## Adopted — things that would not have worked as written

| # | Plan said | Correction | Why |
|---|---|---|---|
| 1 | The playground imports the shared functions from `src/host/` | The playground reaches shared code **only through `window.PathogenLang`** (the IIFE bundle). `font-loader.ts` keeps its exported names and delegates to the global, as it already does for `resolveFontDirectives` (font-loader.ts:650) | `scripts/build-playground.ts` transpiles `playground/` file by file (`bundle: false`) and ships only `dist/` |
| 2 | `src/host/node.ts` Node entry holding the loader | `src/node/` holds **Node adapters only** (fs with realpath containment + exact-case check, local font search, cache, fetch). No runtime imports from the compiler; hosts pass the adapter into the loader that lives in the main bundle. tsup block `platform: 'node'`, `target: 'node20'` (Electron's Node in the extension host and LSP) | A second copy of the parser and of font-provider's module-level `_opentype` state in `node.cjs` |
| 3 | `.vsix` ships the node entry | Hand-written `server/node_modules/pathogen-lang/package.json` gains `"exports": {".": "./dist/index.cjs", "./node": "./dist/node.cjs"}`; the external-require scan runs over `node.cjs`; `pathogen-lang/node` joins the resolve check | `require('pathogen-lang/node')` fails without an exports map |
| 4 | CLI ↔ VS Code byte-identical | Compare geometry with `sameGeometry` (1e-9) **and** assert both sides loaded the same TTF bytes (sha256) | Compile runs in the webview's V8, not Node; `verify-vscode.mjs:41` already documents last-bit trig differences |
| 5 | Declare `capabilities.untrustedWorkspaces: limited` | **Leave it undeclared** — no behavior change. The extension stays disabled in Restricted Mode as today, so the Restricted-Mode branches (and that verification item) drop out | An extension with `main` and no declaration is disabled in Restricted Mode; declaring `limited` would turn the preview and LSP **on** there for the first time |
| 6 | `addFont` per font per compile | Add `addFontData` (reuse an existing `FontData`, keeping `_parsed`) to font-provider.ts | In the webview and the LSP, a 10 MB CJK font would otherwise be re-parsed on every keystroke |
| 7 | Host interface `fetchBytes` / `fetchText` | One `fetch?(url, { signal }) → { status, text(), bytes() }` | The loader needs the HTTP status: a 400 with a weight retries without it; a 400 without one is "not found" |
| 8 | One host per surface | One host **per entry file** (`createNodeFontHost({ entryFile, offline, cacheDir })`); `readFile` takes a root-relative POSIX path that only the shared resolver produces | The `fonts/` walk-up starts at the entry file's folder; Windows path mapping lives in one place |
| 9 | One loader call | Split: `resolveFonts(source, ctx) → { fonts: [{ id, family, weight, style, bytes, source }], messages }` (no opentype — the extension host can call it) and `buildFontRegistry(fonts, reuse)` | The extension host resolves; the webview parses |
| 10 | `vscode.workspace.fs` for file fonts | **Node `fs`** in the extension host (same code as the CLI and LSP, testable headless). Untitled documents get a notice for file-path fonts | The extension is not a web extension; remote hosts run it where the files are. Only virtual file systems are lost. *Flagged to the user.* |
| 11 | Stub `vscode` in the harness | Split `preview.ts`: `webview-html.ts` (page HTML + message types, no vscode import), `font-session.ts` (resolve, memo, sent-set, stale guard; no vscode import), panel glue stays in `preview.ts` | Part B loads the real HTML without stubbing VS Code; Part A drives `font-session` in plain Node |
| 12 | Coverage loop moves to `src/host/` | Dropped from 0b (also the advisor's call): share decision logic only; orchestration and slice loops stay in the playground | Node hosts never load slices; moving it only risks the one surface that already works |

## Adopted — implementation details from the review

- Messages carry exact `ArrayBuffer`s (sliced); a post resolving `false` clears the sent-set; a per-panel request counter drops stale loads; the panel tracks the previewed URI and filters `onDidChangeTextDocument` by it; `updateTimeout` is per panel; skip the loader when directives and file mtimes are unchanged; inject each `@font-face` once per font id; a notices strip next to the error overlay.
- LSP: async validate with a version check; `getDiagnostics` keeps the font-availability filter only when no fonts are passed (the playground calls it without fonts); load errors become Error diagnostics at the directive; publish without fonts first and re-validate when a download lands.
- Nested `@font` (inside `if` / `fn`) parses but the pre-scan reads only `program.body`, so it is silently ignored today → make it an error.
- Cache: `index/<hash(family|weight)>.json` + `blobs/<hash(url)>.ttf`; temp file + rename in the same directory (Windows EPERM/EEXIST on an already-valid target counts as success); sfnt magic checked on read; ~30-day css2 revalidation; an unwritable cache dir falls back to memory with a notice.
- Node `fetch` sends `User-Agent: pathogen-lang/<version>` and has timeouts; it ignores `HTTP(S)_PROXY`, so the download error text says so.
- Weight order on Node hosts: local exact → Google exact → Google's substitution (notice) → offline-only nearest local weight (notice).
- A family already provided by a file-path directive is satisfied by that file (keeps `experiments-in-random-variable-offsets-localfont.pathogen` unchanged).
- `packages/vscode-pathogen/test-fixtures/all-syntax.pathogen:288` has `@font "Inter"` and Inter is not in `fonts/`: give the fixture a font it can find offline (or point it at `tests/fixtures/fonts/Inter-Regular.ttf`) so the zero-diagnostics guard holds once the LSP loads fonts.
- Playground file-path notice suggests the family (`Raleway-Bold.ttf` → `@font "Raleway" 700;`) and is also prepended to the thrown compile error (workspace-view clears font warnings on failure).
- A guard test that `src/host/**` imports no `node:` modules, plus a post-build grep of the browser bundles.
- Save `raleway-slices.mjs` (the 856-vs-936 check) in `verify/`.

## Not adopted

- **The review's severity rule** (every unloadable `@font` is an error, offline included): the approved plan keeps intentional offline (`--offline`, `PATHOGEN_OFFLINE=1`) as a warning. Restricted Mode no longer applies (row 5).
- **`.woff2` file paths as an explicit error**: the plan decodes them. `woff2-encoder/decompress` was verified to run in Node during planning.
- **A `pathogen.fonts.download` VS Code setting**: new surface area; `PATHOGEN_OFFLINE=1` covers terminal-launched VS Code. Revisit if users ask.

## Found during implementation (step 0.5, the bug-fix commit)

The `@{ }` font bug turned out to be one of a class: the two synthetic block states were built from two hand-copied field lists.

1. Fonts inside `@{ }` / `&{ }` — confirmed (CLI repro `verify/atblock-fonts.pathogen`).
2. `--strict` ignored for warnings raised inside blocks — confirmed (`verify/strict-in-block.pathogen`: top level exits 1, in-block exited 0).
3. In `&{ }` only: `x = …` created a block-local copy instead of updating the outer variable; `arr[i] = …`, `o['k'] = …` and `enum` were silently skipped.

Fix: one `sharedProgramState(parent)` list used by both block kinds; report maps created eagerly at the root; text-block assignments and enums delegated to the main statement evaluator. Tests: `tests/block-state-sharing.test.ts`.

## Open — for the user

- Row 10: Node `fs` instead of `vscode.workspace.fs` in the extension host.
