<!-- Approved by the user on 2026-10-22 (plan mode → ExitPlanMode). The survey and decision log it references are 01-survey-v1.md and 02-decision-log-v1.md. -->

# Phase 0b plan: shared resource loader + fonts in the VS Code preview

> This plan is the top section. Below it, the **Appendix** holds the survey and the decision log (rounds 1–5) you've already reviewed. Step 0 saves both to `project-docs/modules/`.

## ⚠ Approving this also changes (not asked yet; say so if any should go)
1. **CLI: font misses become errors.** Every one is a warning today. Under the new rule (see "One severity rule"), these stop the compile:
   - a missing file font
   - an unknown family
   - a generic family (`@font "serif"`)
   - a failed download

   Only an *intentional* offline mode (`--offline` / `PATHOGEN_OFFLINE=1`, VS Code Restricted Mode) keeps a miss as a warning.
2. **CLI and every surface: stricter font paths.** These become errors with a fix-it:
   - `@font "Inter.ttf"` (needs `./`)
   - `"fonts/Inter"`
   - absolute paths such as `/System/…`
   - Windows drive paths
   - paths that escape the project root
3. **The language server becomes a fourth host.** `getDiagnostics` gains a `{ fonts }` option, a public `src/language-services` API change, so diagnostics stop going quiet after the first font call.
4. **A CLI folder argument.** `pathogen-lang my-folder` compiles the `main` in its `pathogen.json`.
5. **The CLI uses the network by default** to download Google fonts. This one you did choose.
6. **A bug fix lands first, as its own commit:** `PathBlock.fromGlyph` inside `@{ }` says "no fonts were loaded" even when the font loaded. I confirmed this with a CLI repro while planning; it affects every surface.

## Context

**Why this phase comes first.** The modules design (appendix, decision log §17) needs every surface to find and load files the same way. Phase 0b changes no language syntax. It builds that loading layer, and its first use fixes a gap users can see today: **the VS Code preview loads no fonts**, so `@font` with `PathBlock.fromGlyph` or `Font.*` fails there with "no fonts were loaded". docs/fonts.md:32 and the "What's in the font" post both say so.

**Today's state** (from the code):
- **Five places compile Pathogen**, and each loads fonts its own way:
  - CLI: reads font files and searches the system font folders. It can't download Google Fonts, and a missing font is a warning.
  - Playground: fetches Google Fonts slices, then fetches more slices and recompiles. A missing font is an error, and file-path fonts are *silently skipped*.
  - VS Code: no loader at all. The webview CSP has `connect-src 'none'` and no access to the workspace.
- **Two different "is this a file path?" rules** (cli.ts:760 vs font-loader.ts:767).
- **Fonts are resolved before evaluation.** A static pre-scan (`resolveFontDirectives`) runs, then the host builds a `FontRegistry` and calls the synchronous `compile()`. This is the pattern imports will reuse.

**Measured while planning:**
- Google Fonts gives non-browser clients (Node) **one complete TTF per family and weight**, with no unicode-range slicing. Browsers get WOFF2 slices.
- Raleway Bold:
  - Google's current TTF has **936** characters, the same as the repo's `fonts/` file.
  - The union of the 5 WOFF2 slices Google sends browsers has **856** (verified by decoding them).
  - So the gap is Google's browser subsetting, not the release. **docs/fonts.md's "an older download" explanation is wrong** and gets corrected in this phase.
- Noto Sans SC 400 as one TTF is 10.5 MB, a one-time download if cached.
- Google's css2 returns **HTTP 400 both for an unknown family and for a weight the family lacks** (e.g. Baumans 700). So the Node loader needs the playground's weight-fallback and substitution logic (the default-weight retry, `formatFontSubstitutions`), not just a single fetch.
- fonts.gstatic.com sends `Access-Control-Allow-Origin: *`.

**Intended outcome**
- In `src/host/`: the shared decision logic (path rule, project root, generic families, css2 parsing, weight resolution) and one Node loader. The playground keeps its own slice orchestration on top of the same decision functions.
- A small host per surface: CLI (Node), playground (browser main thread), VS Code extension host (Node), and the language server (Node).
- One set of rules: file paths, family lookup, missing-font severity, caching, network policy.
- The VS Code preview renders `@font` / `fromGlyph` / `Font.*` like the CLI.
- Phase 1 (modules) then adds "read an imported file" to an interface that already exists on every surface.

## Design

### The host interface (`src/host/types.ts`)
```ts
export interface ResourceHost {
  /** Read a project file. `file` is already resolved and checked by the shared path rules. */
  readFile(file: ProjectFile): Promise<Uint8Array>;
  /** Network access. Absent = offline (CLI --offline, VS Code untrusted folder). */
  fetchBytes?(url: string): Promise<Uint8Array>;
  fetchText?(url: string): Promise<string>;
  /** Local font discovery by family name (Node hosts: PATHOGEN_FONT_DIRS, a fonts/ dir, system dirs). */
  findLocalFont?(family: string, weight: number): Promise<LocalFont | null>;
  /** Persistent cache for downloaded fonts (Node hosts share one OS user cache dir; playground: in-memory). */
  cache?: ByteCache;
}
```
In phase 1, the same `readFile` serves imports. Nothing in `src/host/` imports Node or DOM APIs.

### Shared modules in `src/host/`
- **`paths.ts`, one rule for file specifiers:**
  - `./`, `../` or `/` means a file. Anything else is a family name.
  - Resolution is against the file the directive is written in.
  - Forward slashes only.
  - The path must stay inside the project root. Escaping it is an error with a fix-it.
  - This replaces the two diverging regexes.
  - A bare name ending in `.ttf`, `.otf`, `.woff` or `.woff2`, in any letter case (e.g. `@font "Inter.ttf"`), gets an error that suggests `"./Inter.ttf"`.
  - So does a bare name containing `/` or `\` (e.g. `"fonts/Inter"`).
  - These are the inputs where the two current rules disagree today: `Inter.TTF`, `fonts/Inter`, `.Inter`, `C:/Fonts/arial`, `AC/DC`.
  - An absolute OS path or a Windows drive path gets an error that suggests a project-relative path.
- **`project.ts`, the project root:** the nearest `pathogen.json` above the entry file, otherwise the entry file's folder. The v1 schema is `{ "main"?: string }`.
- **`google-fonts.ts`:** the pure logic moved out of `playground/services/font-loader.ts`: building the css2 URL, parsing its CSS and `unicode-range`, the subset index, and `fontBinariesToCss` for `<text>` rendering.
  - The curated catalog and weight snapping (`CURATED_FONTS`, `getKnownVariants`, `nearestWeight` from `playground/utils/google-fonts.ts`) move too.
  - So does the two-tier weight logic (memory: font-weight-fallback): curated families snap before fetching; other families probe css2 with the weight, then without it, and get a 60 s negative cache.
  - Node hosts then substitute weights exactly as the playground does.
  - **Invariants to keep:**
    - binaries register under the requested weight
    - caches are keyed `family:requested` and `family:used`
    - `available: []` means "not in catalog"
    - never validate with `getAvailableWeights()`
- **`load-fonts.ts`, the pre-compile step for the Node hosts** (CLI, VS Code extension host, language server). The playground keeps its own orchestration, which calls the same shared decision functions:
  - parse, then `resolveFontDirectives`
  - for each directive: a file path goes to `host.readFile`; a family name goes to `host.findLocalFont`, then to Google through `host.fetch*` and the cache
  - it returns `{ registry, fontBinaries, notices, errors }`, with one severity rule for every surface
  - it keeps the playground's rule: register under the **requested** weight even when a substitute was fetched (font-loader.ts:571-576), so the injected `@font-face` matches the SVG's `font-weight` and the browser doesn't synthesize a faux bold
**Shared in this phase: decision logic only**, as pure functions that take their I/O as arguments. The Node hosts fetch complete TTFs and never need slices, so moving the playground's orchestration would only add risk to the one surface where fonts already work.
- The single path rule (`paths.ts`) and the project root (`project.ts`).
- **One generic-family set.** There are three today (font-loader.ts:46-50, svg-text-outliner.ts:51-54, google-fonts.ts:166), and `@font "serif"` gets the same error everywhere.
- The css2 URL builder plus `parseGoogleFontsCss` / `parseUnicodeRange` / `extractFontUrlFromGoogleFontsCss`.
- **Two-tier weight resolution as one function that takes fetch callbacks:**
  - curated families snap to the nearest weight before fetching (`CURATED_FONTS`, `getKnownVariants` and `nearestWeight` move); other families try the weight, then fall back to the default weight
  - the playground's `fetchFontBinary` and the Node loader both call it, so the weight rule can't drift
- `formatFontSubstitutions`.
- `fontBinariesToCss`, with a portable base64 helper in place of `btoa`.
- `extractFontReferencesFromCompileResult`, which the VS Code display-fonts pass needs.

**What stays in the playground, unchanged:**
- the orchestration in `compiler-worker.ts` (`resolveFontsForSource`, both slice recovery loops, `resolvePostCompileFonts`, `attachFontDiagnostics`)
- the singleton caches and the mutable curated catalog in `font-loader.ts` / `google-fonts.ts`
- `export-fonts.ts` and `svg-text-outliner.ts`

These can move in a later phase if a second surface ever needs slices.

**Small playground fixes in the same step:**
- `fallbackSync` drops `partial` (compiler-worker.ts:388; `src/worker.ts:43` passes it). In the no-worker fallback, `Font.*` on a sliced family otherwise sees only the Latin slice.
- A file-path `@font` gets its visible notice.

**Out of scope:** italics. No surface loads them, and style is always `'normal'`.

### Per-surface hosts
| Surface | File fonts | Family names | Network | Cache |
|---|---|---|---|---|
| CLI (`src/host/node.ts`, used by `cli.ts`) | Node `fs`, root rule | local discovery (unchanged order), then Google full TTF | on by default; `--offline` disables | the shared OS cache dir |
| Playground (font loading runs on the **main thread**: `playground/services/compiler-worker.ts` is a main-thread manager that imports `font-loader.ts`; the Web Worker, `src/worker.ts`, only receives finished buffers) | not available yet: a **visible notice**, no longer silent | Google slices (unchanged) | browser fetch | session caches (unchanged) |
| VS Code extension host (`packages/vscode-pathogen/src/font-host.ts`, built on `src/host/node.ts`) | `vscode.workspace.fs`, relative to the document, root rule | same as the CLI (both run on Node) | Node `fetch`, off in untrusted folders | the shared OS cache dir |
| Language server (step 7) | Node `fs` through `src/host/node.ts` | same as the CLI | same as the CLI | the shared OS cache dir |

### Node host packaging
- `src/host/` (pure) ships in the main bundle.
- The Node pieces go in a **separate entry**, `src/host/node.ts`, using `fs`, `os` and `path`. It's exported as a `pathogen-lang/node` sub-path (a tsup Node-target build), so the browser bundle never pulls in Node built-ins.
- Its consumers:
  - the CLI (bundled)
  - the VS Code extension host, which loads it through the existing `createRequire(server/node_modules/…)` path that it already uses for `vscode-languageclient`
  - the language server
- `scripts/build-vscode-extension.ts` must ship the new entry next to `dist/index.cjs`.

**One shared font cache for every Node host** (CLI, extension host, language server): the OS user cache folder.
- macOS: `~/Library/Caches/pathogen-lang/fonts`
- Linux: `$XDG_CACHE_HOME/pathogen-lang/fonts`
- Windows: `%LOCALAPPDATA%\pathogen-lang\fonts`
- `PATHOGEN_CACHE_DIR` overrides it.
- Downloads are keyed by family, weight and the gstatic URL (the URL changes with each Google release).

### VS Code message flow
| Direction | Message | Notes |
|---|---|---|
| webview → host | `{ type: 'ready' }` | unchanged |
| host → webview | `{ type: 'fonts', fonts: [{ id, family, weight, style, buffer }] }` | sent only when a font is new. The webview keeps a `Map<id, FontData>`, so a 10 MB CJK font crosses once, not on every keystroke |
| host → webview | `{ type: 'update', uri, version, source, fontIds, notices, errors }` | new: the URI and version fix the wrong-file re-render |
| webview | builds the registry from `fontIds`, `await ensureOpentype()` once, compiles with `{ fonts }`, injects `@font-face` data-URI CSS (`fontBinariesToCss`) so `<text>` renders | the CSP already allows `font-src data:` and inline styles. No CSP change |

On the host side:
- Every edit or editor switch is debounced (150 ms, as today). Then it runs the shared `loadFonts` with the Node host: file fonts are resolved against the document's URI through `vscode.workspace.fs`, and family names go local, then Google.
- Fetching is disabled when `vscode.workspace.isTrusted` is false. In that case a notice shows in the preview, and `capabilities.untrustedWorkspaces: { supported: "limited" }` is declared.
- The listeners are registered on the panel and disposed with it.
- **Hiding the panel throws its fonts away.** The panel has no `retainContextWhenHidden`, so every re-show reloads the webview and empties its font map.
  - On every `ready`, the host clears its record of fonts already sent and sends them again before the next `update`.
  - Otherwise each hide and show would go through the `needFonts` recovery path.

Complete TTFs carry no `unicode-range`, so there is no slice recovery loop on Node hosts.

**Transport.** Extensions whose `engines.vscode` is 1.57 or later get `ArrayBuffer`s in `postMessage` transferred efficiently and recreated in the webview (VS Code API docs for `Webview.postMessage`). Ours is ^1.91 and uses `createWebviewPanel`.
- Delivery isn't guaranteed. If an `update` references a font id the webview doesn't have, the webview replies `{ type: 'needFonts', ids }` and the host re-sends them.

**Display fonts for `<text>`.** This matches the playground's `resolvePostCompileFonts` pass (compiler-worker.ts:701-718), which loads fonts named only in style blocks (`font-family:` on a TextLayer) so live `<text>` renders in the right face.
- After compiling, the webview posts `{ type: 'displayFonts', families }`.
- The host loads them through the same loader.
- The host replies with `fonts`, and the webview injects `@font-face` with no recompile.

## Phase 0b decisions (2026-10-22)

| # | Decision |
|---|---|
| 1 | **Complete TTF on Node.** On the CLI and in VS Code, a family name resolves to a local file first (today's CLI order), then to Google's single complete TTF (requested without a browser user agent), cached after the first download. VS Code then matches the CLI exactly. The playground keeps browser slices, and its documented difference stays (with the explanation corrected) |
| 2 | **The CLI downloads Google Fonts by default.** `--offline` turns this off, and local files still win |
| 3 | **The root rule is enforced now.** A file-path font that escapes the project root is an error with a fix-it. This repo gets a root `pathogen.json` so the 47 `../…/fonts/…` directives keep working. `pathogen.json` (v1: `{ "main"?: string }`) is documented in this phase |

## Pre-existing problems found while planning (flag; fix where this phase touches them)
- **The VS Code preview leaks listeners.** `onDidChangeTextDocument` / `onDidChangeActiveTextEditor` go into `context.subscriptions` and are never disposed with the panel, so they pile up across close and reopen (preview.ts:79-92). **Fix here,** because the messages change anyway.
- **The VS Code preview re-renders the wrong file.** On `ready` (after a hide and re-show) it re-sends the *originally captured* editor (preview.ts:27, 68-77). **Fix here:** messages will carry a document URI and version.
- **LSP diagnostics hide everything after a font call.** `isFontAvailabilityError` returns early (diagnostics.ts:125-131), so a program that uses fonts gets *no* evaluator warnings or errors in the Problems panel. **In scope as the last step:** the language server becomes a fourth host and loads fonts with the same Node loader. This needs `getDiagnostics(doc, { fonts })`. It can be split out if it grows.
- **The CSSVar override regex** (preview.ts:646-652) probably breaks on a nested `)`. Separate issue, not fixed here.
- **docs/security.md:88** says the preview uses the playground's CSP. It doesn't exactly. Correct the sentence.
- **`.woff2` file paths** are accepted by the CLI's path regex but never decoded. **Decode them on Node hosts** with the existing `woff2-encoder/decompress` dependency. I verified while planning that it runs in Node.
- **CONFIRMED BUG: `PathBlock.fromGlyph` fails inside `@{ }`.** It throws "no fonts were loaded" even when the font loaded, and the same call works at the top level.
  - Cause: the `@{}` block's `blockEvalState` (src/evaluator/index.ts:2462-2481) copies logs, warnings and defs from the parent state but omits `fontRegistry` and the font request and missing-glyph maps.
  - **Fix in this phase:**
    - thread those fields through; check the `&{}` synthetic state (~:2576) too
    - add a regression test
    - save the repro (`atblock-fonts.pathogen`) in `project-docs/modules/verify/`
  - Every surface is affected, so the playground has it too.

## What the root rule touches (audit, 2026-10-22)
- **118 `@font` lines in the repo.** 47 use `../` (42 in project-docs, 5 in blog samples at `../../../../fonts/…`). All 47 point into the tracked repo-root `fonts/`, so **one repo-root `pathogen.json` keeps every one legal.**
- `tests/cli.test.ts:756-775` writes `@font "../fixtures/fonts/Inter-Regular.ttf"` into `tests/tmp/`. The repo-root `pathogen.json` covers it.
- `project-docs/path-cutting/demo-glyph-cut.pathogen:10` uses an **absolute** path, `/System/Library/Fonts/Supplemental/Georgia.ttf`.
  - Under the new rules, a leading `/` means root-relative, so this breaks.
  - Migrate the demo to a repo font, or to a family name the system search finds.
- **The CLI registers a file font under its file name** (`font-family: Inconsolata-Regular`, cli.ts:772). Only sample comments say so. Keep the behavior and document it in docs/fonts.md.
- **Docs to touch:**
  - `docs/fonts.md:28, :32, :213`
  - `docs/path-blocks.md:1537-1552`
  - `docs/cli.md`, which today never mentions fonts or `PATHOGEN_FONT_DIRS`
  - `docs/textblock.md:253`, whose link points at cli.md, which has no font content
  - `docs/security.md:88`
- **Blog posts:** `whats-in-the-font.md:49-50` and `vscode-developer-experience.md:182` call VS Code fonts "not yet" or "future". Add a dated update line to each. Blog edits go through review.

## One severity rule for fonts (every surface)
| Situation | Result |
|---|---|
| A file-path font is missing, unreadable, outside the root, or not a font | **error**, naming the path and the fix |
| A family name isn't local and Google doesn't know it (HTTP 400 at every weight) | **error**, with "did you mean" when a close family name exists |
| The family exists but not at that weight | the nearest weight is used, plus a **notice** (the playground's existing substitution logic) |
| A download fails (network down, timeout) and the font isn't cached | **error**, saying it couldn't be downloaded |
| Downloads were turned off on purpose (`--offline`, `PATHOGEN_OFFLINE=1`, VS Code Restricted Mode) and the font isn't local or cached | **warning**. The compile continues, and any `fromGlyph` / `Font.*` call then fails with a message pointing at the opt-out |

This changes the CLI, where every miss is a warning today. Programs that relied on that would now stop with an error.

## Steps

**0. Preserve the design work** (per CLAUDE.md artifact rules)
- `project-docs/modules/01-survey-v1.md`: appendix §0–§11 plus Sources.
- `project-docs/modules/02-decision-log-v1.md`: appendix §12–§18.
- `project-docs/modules/03-phase-0b-plan.md`: this plan.
- A memory file `project_module_system_design.md` pointing at them.

**0.5. Bug fix first, as its own commit:** fonts inside `@{ }`.
- A failing test in `tests/font-provider.test.ts`, which already builds an Inter registry at :30-31: `fromGlyph` inside `@{}` should produce glyph path data. Also cover `Font.*` and `toPathBlock` inside `@{}`.
- Then thread `fontRegistry`, `missingGlyphs` and the coverage-request maps into `blockEvalState` (src/evaluator/index.ts:2462) and into the `&{}` state.
- Bug fixes skip docs-first. Run code-reviewer, show you the outcome, and commit on main when you say so.

**1. Docs first** (agentic review before commit)
- `docs/fonts.md`:
  - Replace "The VS Code preview doesn't load fonts yet" with how each surface loads fonts.
  - Add the file-path rules (relative to the file, inside the project folder, `pathogen.json`).
  - Cover network and caching, Workspace Trust, and the updated error table.
  - Correct the 856-vs-936 explanation. It's verified: browser slices hold 856 characters, the complete TTF 936, both from the same current release.
- `docs/path-blocks.md` "Font loading by environment": add VS Code, and align the CLI text (Google download, `--offline`, `--root`).
- `docs/cli.md`: it has no font content today. Add two sections:
  - **"Fonts":** local lookup order and `PATHOGEN_FONT_DIRS` (moved here from path-blocks.md), the Google download, the cache location and `PATHOGEN_CACHE_DIR`, and `--offline`.
  - **"Project root":** `pathogen.json` and `--root`.
  - Fix the `docs/textblock.md:253` link that points here.
- **`docs/security.md`:**
  - Correct the CSP sentence at :88.
  - Add a short **"Compile-side inputs"** section. Today the page covers only output. The section covers what the compiler reads:
    - project files inside the root
    - Google Fonts over HTTPS on the CLI and in VS Code
  - It also states that the compiler never writes, and covers `--offline` and VS Code Restricted Mode. Domain-survey requirement R4 asked for this input surface to be designed deliberately.
- **New `docs/projects.md` ("Projects and files")**, registered in `DOC_FILES`. It covers:
  - the project root (the nearest `pathogen.json`, otherwise the entry file's folder; `--root`)
  - the `pathogen.json` v1 schema (`main`)
  - the path rules: relative to the file, `./ ../ /`, forward slashes, exact case, no escaping the root
  - what each surface treats as the project (playground: the workspace; VS Code: the folder that holds `pathogen.json`, otherwise the file's folder)

  Phase 1 extends this page with imports.
- Register any new page in `DOC_FILES`. Then run `npm run build:website` and `npm run check-links`.
- **Careful:** `docs/path-blocks.md` and `docs/variable-offset.md` already have uncommitted edits of yours (from the session-start git status).
  - Edit around those changes.
  - Stage only this phase's hunks.
  - Never revert or stash your work.

**2. Failing tests**, before the code:
- `tests/host/paths.test.ts`: file versus family, `./ ../ /`, root escape, backslashes, absolute OS paths, case mismatch.
- `tests/host/project.test.ts`: finding `pathogen.json`, `main`, `--root`.
- `tests/host/load-fonts.test.ts`, against a fake in-memory host:
  - file fonts and `.woff2` decoding
  - local, then Google, then cache
  - the two-tier weight fallback and the requested-weight registration
  - the severity table
  - offline behavior
- Updates to `tests/cli.test.ts`: run offline, add the root-escape error, the `--root` flag, and `--offline`.
- `tests/language-services/diagnostics.test.ts`: with fonts supplied, warnings after a font call appear (this replaces the early-return case).

**3. Shared loader** in `src/host/`, plus the `src/host/node.ts` entry:
- a `tsup.config.ts` entry
- a `package.json` `exports["./node"]`
- the `src/index.ts` exports for the pure parts

**4. CLI host**
- `loadFontsFromDirectives` (cli.ts:724-904) becomes a call into `node.ts`. The local lookup order stays unchanged, and Google download plus cache is added.
- New flags in the CLI's existing `--flag[=value]` style: `--offline` and `--root=<dir>`. `process.exit` moves out of the loader.
- **`PATHOGEN_OFFLINE=1`** does the same as `--offline` for every Node host: CLI, extension host and language server.
  - Set it in the vitest setup (`tests/setup.ts`) and in every harness that starts the CLI.
  - Example: the existing `verify-vscode.mjs` harnesses compile `all-syntax.pathogen`, which has `@font "Inter"`, and Inter isn't in `fonts/`. Offline CI would otherwise fail on a download.
- A **folder argument** (`pathogen-lang my-gears`) compiles the `main` named in its `pathogen.json`, as shown in round 3. With no `pathogen.json`, or no `main`, it's an error that says what to add.
- Add a repo-root `pathogen.json` with `{}`.
- Migrate `project-docs/path-cutting/demo-glyph-cut.pathogen` off its absolute path.

**5. Playground host**
- `font-loader.ts` imports the shared decision functions from `src/host/`: the path rule, the generic-family set, css2 parsing, and two-tier weight resolution (called inside `fetchFontBinary`, with the playground's `fetch`, WOFF2 decoder and caches passed in).
- The orchestration, caches and slice loops in `compiler-worker.ts` stay as they are.
- Fix `fallbackSync`'s dropped `partial` in the same step.
- A file-path `@font` produces a visible notice ("file fonts need a project file; in the playground use a Google Fonts family").
- Byte-identical behavior otherwise: `tests/compiler-worker-fonts.test.ts`, `tests/font-loader.test.ts` and `tests/google-fonts.test.ts` stay green, and so do the two playground font verify scripts.

**6. VS Code host**
- `packages/vscode-pathogen/src/font-host.ts` (Node loader, `vscode.workspace.fs`, Workspace Trust).
- The `preview.ts` message protocol: `fonts` by id; `update` with uri, version and fontIds; `displayFonts`.
- The listener-leak and wrong-file fixes.
- `capabilities.untrustedWorkspaces` in `package.json`.
- `scripts/build-vscode-extension.ts` ships the `node` entry.
  - Today it hand-writes `server/node_modules/pathogen-lang` with only `dist/index.cjs` and `main` (:144-155).
  - Add `dist/node.cjs` and an `exports` map (`.` and `./node`).
  - Add `pathogen-lang/node` to the resolve check at :157-170, so a broken bundle fails the build rather than the `.vsix`.

**7. Language-server host** (splittable)
- `getDiagnostics(doc, { fonts })` in `src/language-services/diagnostics.ts`.
- The server loads fonts with the Node loader, using the document URI for paths and the shared cache.
- The early return stays only for the truly no-fonts case.
- Resolve paths from the document URI with `fileURLToPath`. Don't use the server's `workspaceRoot` (server.ts:58-76): it's built from the deprecated `rootUri`/`rootPath`, keeps `%20` encoded, and yields `/C:/…` on Windows.
- **Workspace Trust reaches the server.** The client passes `isTrusted` in `initializationOptions` and sends a notification on `onDidGrantWorkspaceTrust`. An untrusted server never downloads; it uses local and cached fonts only.

**8. Verification, review and changelog.**
- The verification below.
- `npm run test:run` and `npm run lint`.
- code-reviewer, then content-reviewer for the docs and blog notes.
- A `CHANGELOG.md` entry (`## [Unreleased] - <date> (shared font loader, fonts in the VS Code preview)` with Core, Playground, VS Code Extension, Documentation and Development sections).
- Show you the review outcomes. Dispositions go in `project-docs/modules/reviews/`.
- Commit on main (and push, if you ask) only after your go-ahead. Stage only this phase's files, and restore whitespace noise from rebuilds in generated files.
- Commit messages follow the repo's style: `fix(core): …` for the `@{}` bug, `feat(core): …` for phase 0b, then a body, then a **Tested:** paragraph that says which checks were headless and which interactive.
- Update the stale memories:
  - `project_cli_font_loading.md`: the CLI now downloads fonts, and the root rule applies.
  - `project_font_namespace.md`: VS Code now loads fonts.
  - `project_cjk_font_subset_loading.md`: Node hosts use complete TTFs.

## Risks and edge cases
- **Several processes share one cache.** The CLI, the extension host and the language server can all write it.
  - Write each download to a temp file, then rename it into place (atomic on one filesystem).
  - Readers check the TTF magic bytes and ignore partial or corrupt files.
- **Cache staleness.**
  - Entries are keyed by the gstatic URL, which carries Google's version (`/v37/`).
  - A small index maps `family:weight` to the URL and is refreshed when it's older than 30 days. Offline, any cached copy is used.
- **Case on macOS.** A path whose case doesn't match the file on disk is an error (the host compares against the directory listing), so a program that works on macOS also works on Linux.
- **Windows.** Only forward slashes are allowed in sources. Hosts convert to and from OS paths, and `C:\…` in a source gets the absolute-path error.
- **Big fonts in the webview.** A 10 MB TTF is posted once and kept by id. Watch memory when many families are open; evict fonts that no `update` has referenced lately.
- **Behavior changes users will notice:**
  - in the CLI, misses become errors (the severity table)
  - in the CLI, paths that escape the root become errors
  - in the CLI, network access by default
  - in the playground, file-path `@font` shows a notice instead of being silently skipped

  The CHANGELOG lists all of these under **Changed**.
- **The language server and opentype.** The server must call `ensureOpentype()` before diagnostics, and must not block on a slow download. Diagnostics run with whatever fonts are cached, and are refreshed when downloads finish.

## Critical files
**New**
- `src/host/types.ts`, `paths.ts`, `project.ts`, `google-fonts.ts` (pure CSS parsing, the generic-family set, two-tier weight resolution), `load-fonts.ts` (the Node-host pre-compile step)
- `src/host/node.ts` (the Node entry)
- `packages/vscode-pathogen/src/font-host.ts`
- `tests/host/*.test.ts`
- `project-docs/modules/verify/verify-vscode-fonts.mjs`
- the repo-root `pathogen.json`
- `docs/projects.md` (plus a `DOC_FILES` entry)

**Modified**
- Core and build: `src/cli.ts` (:724-904, plus flags), `src/evaluator/index.ts` (the `@{}` / `&{}` state, bug fix), `src/index.ts` (exports), `tsup.config.ts`, `package.json` (`exports["./node"]`)
- Playground: `playground/services/font-loader.ts`, `playground/services/compiler-worker.ts`, `playground/utils/google-fonts.ts`
- VS Code and language server: `packages/vscode-pathogen/src/preview.ts`, `packages/vscode-pathogen/package.json`, `scripts/build-vscode-extension.ts`, `packages/pathogen-language-server/src/server.ts`, `src/language-services/diagnostics.ts`
- Docs and history: `docs/fonts.md`, `docs/path-blocks.md`, `docs/cli.md`, `docs/textblock.md`, `docs/security.md`, `scripts/build-docs.ts` (if a new page), `CHANGELOG.md`, the two blog posts (dated update lines)

**Reused, not rewritten**
- `resolveFontDirectives` (src/parser/font-directives.ts:27)
- `createFontRegistry` / `addFont` / `lookupGlyph` / `ensureOpentype` (src/evaluator/font-provider.ts)
- the `FontBuffer` shape (src/worker.ts:8-17)
- `parseGoogleFontsCss` / `parseUnicodeRange` / `fontBinariesToCss` / `resolveFontBinaries` / `formatFontSubstitutions` (moved, not rewritten)
- `woff2-encoder/decompress`
- `buildSvgTree` / `mountInto`
- the `verify-vscode.mjs` harness pattern

## Verification
- **Tests never touch the network.**
  - The shared loader is tested with a fake in-memory host.
  - `PATHOGEN_OFFLINE=1` is set in the vitest setup, so every spawned CLI inherits it.
  - CLI tests (tests/cli.test.ts:756-850: identifier source, walking up to `fonts/`, weights, `PATHOGEN_FONT_DIRS`) also get `PATHOGEN_CACHE_DIR` pointing at a temp folder seeded with fixture fonts.
  - The download path itself is tested through the fake host.
  - One opt-in live check (`PATHOGEN_LIVE_FONTS=1`) exercises the real Google download.
- **The `@{}` bug fix:** `npx tsx src/cli.ts project-docs/modules/verify/atblock-fonts.pathogen --json`.
  - Today it exits 1 with "no fonts were loaded" at line 6. After the fix it exits 0, and the block's glyph has path data.
  - Also run it through the playground and the VS Code harness.
- **Unit tests:** `npx vitest run tests/host/`. The existing font suites stay green: `font-loader`, `compiler-worker-fonts`, `google-fonts`, `font-provider`, `font-namespace`.
- **CLI:**
  - `npx tsx src/cli.ts <sample> --json` with a Google family on a cold cache, then with `--offline`.
  - A file-path font.
  - A `../` path that escapes the root must give the new error.
- **Playground:** `node project-docs/glyph-listing/verify/verify-font-namespace.mjs` and `scripts/debug-cjk-subset-loading.ts` still pass. A file-path `@font` shows the notice.
- **VS Code, automated:** `project-docs/modules/verify/verify-vscode-fonts.mjs`, following the existing `verify-vscode.mjs` pattern (e.g. `project-docs/range-values/verify/`). Run it after `npm run build:vscode`.
  - **Part A:** run the shipped Node loader (`server/node_modules/pathogen-lang` plus the `node` entry) against the sample folder, the way the extension does. Check:
    - file fonts and Google fonts load
    - the cache is used on the second run
    - with no network (untrusted), you get the notice
    - a path escaping the root gives the error
  - **Part B:** load the **real `getWebviewContent` HTML under its real CSP** in Puppeteer, with a stubbed `acquireVsCodeApi`. Post the `fonts` and `update` messages. Assert that `fromGlyph` paths render, that `@font-face` is injected, and that no CSP violations are logged.
    - The headless webview runs other docs mention were never committed. This harness gets committed.
    - `preview.ts` imports `vscode`, so the harness loads it with a stubbed `vscode` module.
    - It also stubs `webview.asWebviewUri` and `cspSource`, so the real CSP serves the bundled `compiler/index.global.js` and `pan-zoom.global.js` from a local server.
- **VS Code, interactive** (required by packages/vscode-pathogen/CLAUDE.md): `npm run build:vscode:install`, reload, then open each sample in a clean window:
  - `@font "Raleway" 700` + `Font.info`
  - `@font "Noto Sans SC"` + `fromGlyph("你好")`
  - a file-path font from `fonts/`
  - the same folder in Restricted Mode

  Each preview renders the glyphs, or shows a clear notice. Also check:
  - closing and reopening the preview doesn't duplicate updates (the listener-leak fix)
  - the Problems panel shows evaluator warnings in programs that use fonts (the LSP step)

  Save light and dark screenshots to `project-docs/modules/verify/`. The commit message says which checks were headless and which interactive.
- **Parity:**
  - CLI ↔ VS Code must be **byte-identical**. Both run on Node with the same complete TTF or file. Diff `--json` geometry against the Part B output.
  - Playground ↔ CLI: compare the `fromGlyph` outlines for Basic Latin, and record the slice difference (856 vs 936) with its verified cause. Then fix the docs/fonts.md wording.

