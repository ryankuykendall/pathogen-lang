# Phase 0b reviews: dispositions (2026-10-23/24)

Three reviews ran in parallel on the uncommitted phase 0b work: the shared
loader + Node host + CLI (code-reviewer), the surfaces — VS Code preview,
language server, playground, packaging (code-reviewer) — and the docs edits
made after the first docs review (content-reviewer). This file records what
happened to each finding.

## Surfaces review (code-reviewer): request changes — 2 critical, 4 warnings, 10 suggestions

| # | Finding | Disposition |
|---|---|---|
| 1 | **Critical.** The webview dropped updates whose document `version` was lower than the last one for the same file; a file closed and reopened starts again at version 1, so the preview froze until the old version count was passed | **Fixed.** The host numbers every update (`seq`, per panel) and the page orders by that. Harness: B9 now tests ordering by `seq`; new B11 "a reopened file still updates the preview" |
| 2 | **Critical.** Playground: when a program both names a skipped font file and calls the font, the compile fails and the banner was cleared, so the "look for a preceding font-loading message" pointer led nowhere | **Fixed.** `compileAs` attaches the compile's font notices and substitutions to the error it throws; `workspace-view` shows them instead of clearing the banner. Test through the real `compile()` fallback path; harness check "a glyph call on the skipped file fails, and the warning banner explains it" |
| 3 | Display fonts were never sent again after the webview reloaded (hidden panel) | **Fixed.** The session remembers the ids found per family and weight and answers repeats from them; test "a reloaded webview that asks for display fonts again gets them again" |
| 4 | Reuse keys ignored the file system; the server kept results with errors forever | **Fixed.** `fontFileStamps` (src/node: size + mtime of every file `@font` path and of `pathogen.json`) is part of both keys; results with an error or a `font-load` skip are reused for 10 s only (`RETRY_AFTER_MS`), clean ones until the key changes. Tests: a font file added after an error is picked up (preview and server); a problem result is retried after the window |
| 5 | One slow download stalled every preview update (single serialized loop), with nothing on screen | **Fixed.** Pushes run side by side; only the newest push's result is sent; identical loads share one run; a "Loading fonts…" status appears after 400 ms |
| 6a | `onDidClose` left a pending validation timer | **Fixed** (timer cleared) |
| 6b | A download finishing after the document closed re-created its memo | **Fixed** (closed documents are neither remembered nor rechecked; test) |
| 6c | `parsed` (server), `loaded` (host), `fontStore` (page) never evict | **Partly.** The server keeps parsed fonts only while an open document uses them. The preview's two stores live as long as the panel (closing it frees them) — **follow-up** if many large families in one session prove a problem |
| 6d | N open documents naming one uncached family started N downloads | **Fixed** at the fetch layer: concurrent requests for one URL share a transfer (src/node, test) |
| 6e | Every validation during a download re-ran the first pass | **Fixed** (the in-progress check comes first; the test now pins one first pass and one download) |
| S | Parse even without `@font` | **Fixed** (`source.includes('@font')` short-cut in both; tests) |
| S | Push loop without a catch | **Fixed** (each send has its own catch) |
| S | `needFonts` could ping-pong on an empty reply | **Fixed.** The host always answers, marked `reply: true`; if the fonts still aren't there the page shows an error instead of asking again (harness B12) |
| S | Display weights unbounded (101..999) | **Fixed** (snapped to the 100–900 grid in page and host; test) |
| S | Playground showed only the first plan error | **Fixed** (all, one per line; the first keeps its position) |
| S | "not recognized @font" heuristic should be skipped with a plan | **Fixed** |
| S | Parity: a style-block-only curated family works for glyph calls in the playground only; VS Code display fonts and downloads-on-open undocumented | **Documented** in docs/path-blocks.md § Font Loading by Environment ("A family named only in a style block", and VS Code downloads on open) |
| S | Static import of `pathogen-lang/node` in the server | **Kept.** A lazy `require` would bypass the test aliases; the .vsix build refuses to package unless the entry loads and decodes WOFF2 |
| S | Restricted-Mode closure can't fire | **Kept** as a guard, commented as such |
| S | Hand-copied structural types in font-session.ts | **Kept** — the extension's `rootDir` can't reach `src/`; the shapes are exercised by the tests, which run the session against the real library |
| S | packages/vscode-pathogen/CLAUDE.md stale | **Fixed** (layout table, tests line, readiness) |
| S | `fontId` samples every 64th byte | Passed to the core review (below) |
| T | Page script and server glue lack suite tests | **Follow-up.** Covered end to end by the harness (now 19 checks incl. B11/B12); a jsdom suite for the page script is worth adding |

## Docs edits review (content-reviewer)

| # | Finding | Disposition |
|---|---|---|
| A | "Subscribe at the top level of the program" says more than the rule (loops are fine) | **Fixed** in docs/subscriptions.md ("Don't subscribe inside a path block or text block … Subscribing inside a loop is fine.") and in the error message, now "…Subscribe outside the block." (test + CHANGELOG updated) |
| B | textblock.md: an `enum` isn't an assignment | **Fixed** (two bullets: assignments; `enum` definitions exist only inside the block) |
| C | cli.md: unzipping into the wrong `fonts/` folder can still fail | **Fixed** ("the `fonts/` folder nearest your program…") |
| D | path-blocks.md: "places" vs "steps"; one level deep | **Fixed** |
| E | textblock.md: give `.subscribe()` its own bullet; `define ViewBox` missing | **Fixed** (own bullet with a link; ViewBox listed) |
| F | Mention `PATHOGEN_FONT_DIRS` in the cli.md sentence | **Not adopted** — it's in the table right below |

## Core review (code-reviewer): nothing blocks — 8 warnings, 7 docs gaps, 9 test gaps, 7 suggestions

The reviewer's verdict was that nothing blocks the commit, with four cheap fixes worth doing first: validate cache reads, a unique temp name opened with `wx`, the `isInside` prefix test, and pinning the font host. All four are done, along with the rest below. (R) = the reviewer reproduced it; (B) = found by reading.

### Warnings

| # | Finding | Disposition |
|---|---|---|
| W1 | (R) `--root` with `-e`/stdin, or a program outside the root, fails even with no `@font` | **Fixed.** Code from `-e`/stdin whose current folder isn't inside `--root` is placed at the project folder (`/<inline>`), so its `./` paths start there. A file outside `--root` compiles, and fails only if it has an `@font` file path ("…given by --root, so its @font paths can't be followed."). Documented in projects.md § In each tool and cli.md § Fonts and Files. Tests (CLI): code without `@font` from `-e` and stdin; `-e` and stdin loading a fixture font from the project folder (identical output); an outside file that is plain, names a family, or names a path |
| W2 | (B) Cache reads unvalidated: zero-length bytes used for 30 days, an index entry missing fields crashes the CLI, a future `fetchedAt` never goes stale | **Fixed.** Cached font bytes must pass the new `sfntLooksComplete` (a TrueType/OpenType header whose every table lies inside the file). Index entries are checked field by field: a `https://fonts.gstatic.com/` URL, integer weights 1–1000, a finite `fetchedAt`, an `available` array. A future `fetchedAt` is not fresh, and any failure is a miss. Tests: five bad entries (empty file, cut-short file, no `weightUsed`, another host, not JSON), each online (downloaded again) and offline (`font-load` warning), plus a future-dated index (checked with Google again, cached file reused, index rewritten) |
| W3 | (B) `fileCache.put` temp name `pid.Date.now()` can collide in the editors; a failed write leaves its `.tmp` | **Fixed.** A `randomUUID()` temp name opened with `flag: 'wx'`, and the temp is removed in the `catch`. Tests: two writers of one key at once (one whole copy, no temp left); a rename that fails leaves no temp; a cache folder that can't be created is skipped |
| W4 | (B) docs/security.md promises only Google's two hosts, but any `https:` URL is taken and redirects are followed | **Fixed.** `parseCss2Response` takes only `https://fonts.gstatic.com/` URLs, and downloads use `redirect: 'error'`. Also added a 64 MB size limit and a 10-minute total limit (suggestion S4), and security.md now says all three. Tests: the host pin (unit and loader; no request reaches the other host); against a real local HTTP server, a 302 is refused ("fetch failed: unexpected redirect"), and the size limit, the total limit and the stall timeout all fire |
| W5 | (B) `isInside` rejects legal names (`..alt`) | **Fixed** (`rel === '..' \|\| rel.startsWith('..' + sep)`). Test: a top-level `..alt.ttf` reads |
| W6 | (B) Containment is checked after the directory walk: an existence oracle through a symlinked folder | **Fixed.** Each folder's real path is checked before it is listed. Test: a link to an outside folder gives `escapes-root` for an existing, a missing and a wrong-case file alike. Also tested: a link that stays inside is followed (folder and file), and a dangling link is "not found" |
| W7 | (B) Failures lose their `@font` context: unguarded WOFF2 decode, unchecked decoded bytes; a truncated TTF fails inside `fromGlyph`; a folder as `pathogen.json` or `main` prints a stack trace; the CLI reads `pathogen.json` raw | **Fixed.** A decode error or a non-font result is an error at the directive ("is a damaged WOFF2 file: …"). A TrueType/OpenType file whose tables run past its end is an error at the directive ("is damaged or incomplete…"). A folder named as a font, `@font "/"` included, says it's a folder. `loadProjectFileSync` (src/node) is now the one reader of `pathogen.json`, for the CLI and the editors ("is a folder, not a file." / "could not be read: …"), and `main` is read with the same wording. **Not adopted: a full opentype parse in the loader.** The table-directory check catches truncation, the realistic failure, without loading opentype.js before the compile. It was run over 537 real fonts in the repo and on this Mac with no false rejections (`verify/probe-sfnt-real-fonts.ts`). WOFF 1.0 files get the same check (`woffLooksComplete`: the header's stated length and every table inside the file). The repo's `fonts/Raleway/*.woff` turned out to hold WOFF2 data, so there was no real WOFF 1.0 file anywhere, and the reviewer's "`.woff` loads" check had decoded WOFF2. Tests now build a real WOFF 1.0 file from the Inter fixture (`ttfToWoff` in `tests/host/font-bytes.ts`), which also proves the documented `.woff` support draws exactly the TTF's glyphs. Tests: loader (decode throws, decodes to garbage, cut-short TTF and WOFF, folder) and CLI (cut-short font, folder as a font, `pathogen.json` and `main` as folders) |
| W8 | Hand-off: `nodeFetch` gives concurrent callers one `Uint8Array`, so a transfer list would detach it | **No change needed.** The preview posts copies (`copies()` in preview.ts slices each buffer before `postMessage`), and the language server only parses |

### Docs vs code

| # | Finding | Disposition |
|---|---|---|
| D1 | projects.md "What changed" omits paths that climb out of the project folder, now errors | **Fixed** (new bullet) |
| D2 | "or one above it" understates the `pathogen.json` search | **Fixed** in projects.md ("the closest folder above it that has one, however far up") and cli.md ("any folder above it, short of your home folder") |
| D3 | The `fonts/` walk-up's 8-level limit is undocumented | **Documented** in cli.md and path-blocks.md ("in the program's folder or up to seven folders above it") |
| D4 | Linux system folders are searched shallow and Windows per-user fonts are skipped; "the usual places" overstates | **Fixed in code**: system folders are searched two levels deep, and `%LOCALAPPDATA%\Microsoft\Windows\Fonts` is added. **Documented**: path-blocks.md lists every platform's folders. Intended side effects: installed-font file names now match in any letter case on every system (Linux used to need the exact case), and an installed file that isn't a complete font is passed over |
| D5 | The error table lacks `.ttc`, "could not be read" and nested `@font` | **Fixed.** projects.md § Errors adds those plus a folder named as a font, a damaged file, a damaged WOFF2, a file outside `--root`, and a `pathogen.json` that is a folder or unreadable. path-blocks.md quotes the nested-`@font` message and links the table |
| D6 | (R) `@font "/"` says "leaves the project folder"; a folder says "was not found" | **Fixed** (a new `folder` read result) |
| D7 | (R) `respell` garbles the suggestion when the path contains `..` | **Fixed**: only the segments that survive `..` take the on-disk spelling. Tests: the reviewer's example, and `../` from a subfolder |

### Test gaps

| # | Finding | Disposition |
|---|---|---|
| T1 | A real WOFF2 decode never runs in CI | **Fixed.** A node-host test compresses the Inter fixture with `woff2-encoder`, loads it through the Node host, and checks the glyph outlines equal the TTF's |
| T2 | readProjectFile: no directory-symlink escape, symlink inside, `..name`, or folder as file | **Fixed** (see W5, W6, D6), plus a Unicode-form test and a dangling link. Symlink tests are skipped on Windows |
| T3 | Search order and Windows untested | **Fixed.** Tests cover: `PATHOGEN_FONT_DIRS` → walked-up `fonts/` → system folders; the two-level system search; case-insensitive names; a damaged installed file skipped; and `systemFontDirs` and `defaultCacheDir` for every platform. Windows paths are built with `path.win32`, so the answer is the same on any machine |
| T4 | Corrupt or foreign cache entries, an unwritable cache, temp cleanup | **Fixed** (W2, W3) |
| T5 | CLI: a bad `pathogen.json` found by walking up, `-e`/stdin with `--root`, a trailing slash, `--root` vs a folder argument, `main` in a subfolder | **Fixed**: all five, plus a BOM and `pathogen.json` or `main` as a folder |
| T6 | The parity test hard-codes 9 of the 13 generic names | **Fixed**: the playground exports `GENERIC_FONT_FAMILIES`, and the test compares the two sets. **Follow-up:** `playground/utils/svg-text-outliner.ts` keeps its own 10-name list for outlining (no `emoji`, `math`, `fangsong`) |
| T7 | Flow parity: Node retries the default weight for a curated family after a 400; the playground doesn't | **Not changed.** It's benign: the catalog snap makes a 400 for a curated family unlikely, and Node's extra retry helps only when the catalog is out of date |
| T8 | A weak `stdout.length > 40` assertion; a symlink made in `beforeAll` fails the file on Windows | **Fixed.** The three font CLI tests that used that assertion now check the exit status, an empty stderr and more than the move, and compare with the same font loaded another way. Symlinks are made inside the tests that need them |
| T9 | Real-socket behaviour (unref'd timers, prompt exit) has only the author's live run | **Partly.** A real local HTTP server now drives the stall, size and time limits and the redirect refusal. Prompt exit is still covered only by the live run (cold and warm, 2026-10-24, below) |

### Suggestions

| # | Finding | Disposition |
|---|---|---|
| S1 | Strip a BOM from `pathogen.json` | **Fixed** (a character-code check; tests in project.test.ts and the CLI) |
| S2 | Validate `pathogen.json` only when `main` or a file path needs it | **Adopted, for editor parity.** The CLI skips the whole font step for a program without `@font`, as the preview and the language server already did, so a broken `pathogen.json` can't stop a program that reads no files. A folder argument still validates it, since it needs `main`. Tests: a broken walked-up `pathogen.json` with and without `@font` |
| S3 | Warnings without a `code` are silently dropped in the CLI | **Fixed** (printed as `file:line:col: warning:`) |
| S4 | No size or total-time ceiling on downloads | **Fixed** (64 MB, 10 minutes; `maxDownloadBytes` / `maxDownloadMs` options on the Node host) |
| S5 | macOS NFC/NFD names might not match the listing | **Fixed**: in project paths, a name that differs only in Unicode form is the same name; same in the installed-font search |
| S6 | `pathogen-lang/node` has no docs; the src/CLAUDE.md tree lacks `host/` and `node/` | **Fixed.** README "Loading fonts in Node" was run as written against the built package entries, and its output equals the CLI's (`verify/readme-node-example.ts`). The tree is updated |
| S7 | Stage the untracked files together | **For the commit**: `pathogen.json`, `docs/projects.md`, `src/host/`, `src/node/`, `tests/host/` (including the new `font-bytes.ts`) |

**Changed in passing:** a failed download now says why. Node's `fetch` reports only "fetch failed", so the cause is appended ("fetch failed: unexpected redirect", "fetch failed: getaddrinfo ENOTFOUND …").

### Checks after the fixes (2026-10-24)

- `npx vitest run tests/host/` 255 passed; `tests/cli.test.ts` 119 passed; full suite 172 files, 7,249 passed (1 todo).
- ESLint is clean on `src/host`, `src/node` and `tests/host`; the remaining CLI findings are on committed lines. `tsc --noEmit` reports only the old errors in legacy code.
- Live Google Fonts with an empty cache (`project-docs/modules/verify/live-google-fonts.pathogen`): Lobster 828 characters, Inter 650 → 600, Baumans 700 → 400. The warm run with downloads off read the cache and wrote a byte-identical SVG.
- `probe-sfnt-real-fonts.ts`: 537 fonts checked, 0 rejected. `readme-node-example.ts`: MATCH.

## Round 2 (2026-10-24/25): a code review of the fixes above, and a docs review of the edits

The round-2 report ended with three options and no answer. When the next session opened with "Let's continue where we left off", that was taken as option 1, the recommended "fix all of the above", and said so up front so the user could redirect.

### Corrections to the rows above

The code reviewer found that three rows overstate what was done. They stay as written; this is the record:

- **W6 "Fixed"** was incomplete. The per-folder check introduced a regression (C1 below), and links to *files* still told outside paths apart (W1 below). Both are fixed in this round.
- **W2 "any failure is a miss"** was untrue for an index holding JSON `null`, which threw. Fixed below.
- **W3's test line** implied the two-writers test pins the collision. It doesn't: it passed 300/300 against a reconstruction of the old `pid.Date.now()` scheme. It is a smoke test of concurrent writes; the uniqueness comes from `randomUUID()` and `wx` by construction, and only the failed-rename test pins the cleanup.
- "Checks after the fixes": the host suite had 256 tests then, not 255.

### Code review: one regression to fix before commit, two warnings, test gaps, suggestions

| # | Finding | Disposition |
|---|---|---|
| C1 | **Critical (regression from W6).** `readProjectFile` compared the native `realpath` (canonical spelling) with the JS `realpathSync` (keeps yours), so a root spelled in another letter case was "leaves the project folder": `--root=…/TESTS/fixtures` failed (reproduced). On Windows, VS Code's `c:\` would have failed every `@font` path in both editors (reasoned) | **Fixed.** One `realpath` (`fs/promises`, the system's own) everywhere, and each folder is listed by its real path. Tests: a root spelled `MY-GEARS` for `my-gears` (case-insensitive systems), and the CLI with `--root=…/TESTS/fixtures` for `-e` and for a file |
| C1+ | (Advisor) The same class in `findProjectRoot`: the home-folder stop compared spellings, so on Windows the editors would walk past `C:\Users\me` given `c:\users\me` and pick up a stray `~/pathogen.json`. Also the CLI's `relative(root, file)` called a file outside `--root` when only the case differed | **Fixed.** The stop compares real paths and the returned folder keeps the caller's spelling (so relative paths still agree); the CLI compares real paths before calling a file outside. Tests: an all-caps program folder with a `pathogen.json` in "home"; the CLI file case above |
| W1 | Links to *files* told outside paths apart: to an existing outside file, "leaves"; to a missing one, "not found". A dangling *folder* link the same | **Fixed.** A path `realpath` can't follow (ENOENT) is judged by where its links lead, following each link by what it says even when the target is missing (`followLinks`, every hop, relative and absolute targets). Test: nine links — to files and folders, outside and inside, there and missing, relative and absolute, chains of two and three — each gets the answer of where it points. docs/security.md says so |
| W2 | An index holding JSON `null` threw `Cannot read properties of null` (the CLI printed it with no context; the language server retried every 10 s) | **Fixed** (an object check before the field checks). Tests: `null`, `[]` and `7` join the bad-entry table, online and offline |
| T | A differently spelled root; the link-target oracle; a null index; the walk-up depth limit; `fonts` as a file; the 60 s memo; the uncoded-warning path | **Fixed** except the last: tests for each, including "a fonts/ folder in the program's folder or up to seven above it, and no further" and "remembers the folders inside a system font folder for a minute, then looks again" (a mocked clock). **Kept:** the CLI's branch for a warning without a code is unreachable today (every loader warning has one); it stays as a guard |
| S | `walkUpFontsDir` used `existsSync`, so a file named `fonts` hid the real folder above (reproduced) | **Fixed** (a folder check; the `static/` check too). Test |
| S | Two Linux names differing only in case: the last listed won, and the other was never tried if the winner was damaged | **Fixed** (each key keeps every name). Test runs on case-sensitive systems only, so it is **skipped on this Mac** |
| S | A permission error listing a folder read as "not found" | **Fixed**: "could not be read: EACCES…" (ENOTDIR, a file named as a folder, stays not-found). Tests for both |
| S | Commit a WOFF 1.0 fixture made by an independent tool (fonttools) | **Not adopted.** This project's scripting is JS/TS only (no Python), and the repo has no real WOFF 1.0 file. `ttfToWoff` output is read by opentype.js, an independent reader, in the node-host test that draws glyphs from `.woff` and `.woff2` files |

C1 in the editors, run rather than reasoned: `tests/vscode-font-session.test.ts` and `tests/language-server-fonts.test.ts` each load a project font through an all-caps document path (standing in for VS Code's `c:\`). With the JS `realpath` put back, both fail with "leaves the project folder", as the reviewer predicted; with the fix, both load the font.

Mutation check: with the old code put back in five places (the JS `realpath`, the home spelling compare, no link following, `existsSync` for `fonts/`, no space-separated names), exactly the five new node-host tests fail, one each; restored afterwards.

### Docs review: must fix 1–3, should improve 4–6, further items

| # | Finding | Disposition |
|---|---|---|
| 1 | "Files on your computer are matched by Google Fonts' naming" — many system fonts aren't (`Georgia Bold.ttf`, `arialbd.ttf`, `.ttc`), and online `@font "Georgia" 700;` would error "no font of that name is installed" while offline fell back with a warning | **Fixed, in three parts.** (a) The search also finds macOS's own names, `Family Weight.ttf` with a space, so `@font "Georgia" 700;` loads `Georgia Bold.ttf` from this computer (live: offline with an empty cache and online give byte-identical output). (b) With downloads on, when Google can't supply the weight (doesn't serve the family, can't be reached, or the download fails) the nearest installed weight stands in with a `font-weight` warning that says why, as it always did offline. (c) path-blocks.md lists the names that are found and says what isn't (`arialbd.ttf`; `.ttc` can't load at all). **Correction to the premise:** Google *does* serve Georgia (and Verdana, Tahoma, Trebuchet MS, Times New Roman) from `fonts.gstatic.com/l/…`, so online Georgia downloaded rather than failed. The class was real for families Google doesn't serve: live, `@font "Herculanum" 700;` now uses the installed 400 with a warning (`verify/georgia-weights.pathogen`, `.png`) |
| 2 | projects.md "What changed": "a `pathogen.json` in a folder above both" fails when one sits closer to the program | **Fixed**, and in the error message it echoed, which had the same flaw: "…or move the project's pathogen.json (or add one) to a folder that contains both the program and the file." Same wording in the Writing paths rule and the error table; tests updated in three files |
| 3 | README: the Node snippet skips `PATHOGEN_FONT_DIRS` and the `pathogen.json` check; `ensureOpentype()` unexplained; `m.line ?? 1` invents a line; the relative doc link 404s on npm; the older Library Usage puts the result object into `d=` | **Fixed**, and more was broken than reported: the Quick Start and Syntax Overview examples didn't compile (no semicolons; `cy` undeclared), the Quick Start output comment was stale, the math list named `log` (the logger; `ln`), `PI` and `TAU` (functions). All README examples are checked by `verify/readme-node-example-v2.ts` (v1 kept) against the built package: Quick Start MATCH, Syntax Overview compiles, Library Usage MATCH (and `generateSvg` holds the path), Node example MATCH with the CLI |
| 4 | cli.md stdin example: family names still searched for `fonts/` from the current folder | **Fixed in code**: inline code placed at the project folder searches from there. CLI test with `@font "Inter";` from `-e` and stdin (the repo's own `fonts/` has no Inter, so the old behavior fails it) |
| 5 | path-blocks.md: a ~150-word table cell; "two levels" read as Windows-only | **Fixed**: one-line cell, a numbered list of the four steps, a System / Font folders table, "two levels deep" stated once for every system, and the found names as a list |
| 6 | The home-folder stop worded three ways | **Fixed**: "the nearest folder with a `pathogen.json`, from the file's own folder upward, stopping before your home folder" in projects.md, cli.md and the code comment; security.md says "stops before your home folder" |
| F | projects.md CLI bullet as a table | **Fixed** (You compile · Project folder · `./` paths start in), with the `fonts/` search and when `pathogen.json` is read |
| F | Nested-`@font` sentence stutters | **Fixed**: moved to the directive's top-level rule |
| F | security.md omits the 30 s cutoff | **Fixed** |
| F | `pathogen.json` errors appear only with `@font` or a folder compile; `--root` with a file never reads it | **Documented** (by design since S2) |

### Checks after round 2 (2026-10-25)

- `tests/host/` + `tests/cli.test.ts`: 393 passed, 1 skipped (the Linux-only case pair). Full suite: 172 files, 7,268 passed, 1 skipped, 1 todo.
- ESLint clean on `src/host`, `src/node`, `tests/host`; `tsc --noEmit` errors are all in the old ranges (src/cli.ts 133–359, the parser, two evaluator files). In the two editor test files, the comma-operator and promise-executor findings are fixed; four remain by design: the namespace imports that hand `FontSession` the whole library, and the relative import of the language server's source (no package alias exists for it). Committed test files carry similar findings; `tests/` isn't lint-clean today.
- Rebuilt `dist`, the `.vsix` and the website (`PATHOGEN_API_BASE=http://localhost:8787`). VS Code harness 19/19 (A2 shows the new message); playground harness 6/6; check-links 55 pages, 1,548 links, 0 broken; the README's pathogen.studio anchors exist in the built docs page.
- Corpus sweep v3 (`verify/font-sweep-offline-v3.md`): the same outcomes as v2 for all 73 files.

## Round 3 (2026-10-25): narrow reviews of the round-2 changes

A code review of only the round-2 code, and a content review of only the round-2 text. The user chose to keep both behavior changes reported after round 2 (the online nearest-weight fallback; Apple's local files for Georgia and friends on a Mac) and to fix what these reviews found. The user also installed the rebuilt extension and confirmed the four `verify/vscode-samples/` programs work in VS Code. That was the round-2 `.vsix`; the round-3 editor changes (`projectEntry`, the retry) are covered by the harness (19/19) and the editor suites, not yet by hand.

### Corrections to the Round 2 rows

- **W1 "Fixed"** was incomplete again: only ENOENT went through the link check, so a link into an outside file used as a folder (ENOTDIR), a locked outside folder (EACCES) or an outside loop (ELOOP) each gave its own message; and a link that passed *through* an outside folder on its way back in read the file when that folder existed and said "not found" when it didn't. Fixed below by a different design.
- **C1 / C1+ "Fixed"** covered the project folder's spelling, not the folders between it and the program (W3 below).
- **Row 1(b)** said the online fallback behaves "as it always did offline". In the editors it was memoized for the whole session, with no retry (W2 below).

### Code review: nothing critical; three warnings

| # | Finding | Disposition |
|---|---|---|
| W1 | (R) The existence oracle: other realpath errors skipped the link check, and `..` after a missing part was resolved as text, so a link through an outside folder told whether that folder exists | **Fixed by a new design.** `readProjectFile` never touches anything outside the project: before using a name it calls `walkLinks`, which follows links by what they say one folder at a time and stops at the first folder outside the project — before looking at it. Only the folders above the project may be passed (an absolute target starts at the top of the disk). Only when the walk stays inside does `realpath` resolve the path, so every other answer is about something inside. Tests: a second link table — an outside file used as a folder, a locked outside folder, an outside loop, through an outside folder that exists and one that doesn't (all "leaves"), up through the folders above and straight back in ("read"), a loop inside ("could not be read"). docs/security.md and projects.md state the rule: a link that leads outside, or passes through an outside folder on its way back in, leaves |
| W2 | (Reasoned) The editors memoized a stand-in weight chosen after a network failure forever (`font-weight` wasn't "unsettled"), so the requested weight never appeared once the network returned | **Fixed.** `resolveFonts` reports `retryable` when an installed weight stood in for a failed lookup or download (not when Google doesn't have the family, and not offline). Both editors treat it like an error: reused for 10 s, then tried again. Tests: in each editor suite, the real loader and Node host with a scripted network (`scriptedGoogle` in `tests/host/font-bytes.ts`): offline at first → the installed 400 with a warning; reused while waiting; after the window, online → the downloaded 700, no warning. Loader test: `retryable` is true for the two network cases and false for "Google doesn't have it" and offline |
| W3 | (Reasoned) The program's project path kept the caller's spelling below the root (`/POSTERS/main.pathogen` for `posters/`), so its `./` paths were a false letter-case mismatch | **Fixed.** New `projectEntry(root, file)` in `pathogen-lang/node` gives the path spelled as on disk (real paths when they agree the program is inside; otherwise the path as given, e.g. through a link; null outside). The CLI and both editors use it. Tests: unit (spelled differently, through a link inside and through one outside), and in each editor suite a document opened as `POSTERS/main.pathogen` loading `./Baumans-Regular.ttf` beside it |
| S | The Linux case-pair test depended on listing order | **Fixed**: both orders, each must find the whole file (still skipped on macOS) |
| S | A drive-relative link target (`C:foo`) on Windows | **Fixed**: treated as leaving (its folder isn't knowable); `\\?\` prefixes are stripped. Not run (no Windows) |
| S | The loader test called Georgia "a system font Google doesn't list" | **Fixed**: the test uses Herculanum, which Google really doesn't serve |
| S | `fontFileStamps`: a rename in letter case only kept the stamp, so an editor kept a settled result | **Fixed**: the stamp includes the file's real (on-disk) path. Test (case-insensitive systems) |

Mutation check: with the old behavior put back in six places (no link walk, the given spelling first, no optical-size names, stamps without the name, and `retryable` ignored in each editor), exactly the ten new or affected tests fail; restored afterwards.

**Found after the fixes (advisor), and fixed:** the first version of `walkLinks` judged each name before knowing whether it was a link, so an absolute link that reaches the project through another name for it — `~/Dropbox` for `~/Library/CloudStorage/Dropbox`, macOS's `/tmp` for `/private/tmp` — "left the project" (reproduced: `tmp/probe-alias-link.ts`). Now a name is judged once it is known not to be a link (a folder or file by its real path, a missing name as written), and a link is followed wherever it sits. Nothing inside an outside folder is ever looked at; the one thing an outside name can reveal is that it is a link leading back into the project. Past 40 hops, a loop outside the project leaves rather than "could not be read". Rows added to the second link table: through an alias of the project folder (read), a loop beside the project (leaves); each fails when its mistake is put back.

### Content review: must fix 1–2, should improve 3–6, consider

| # | Finding | Disposition |
|---|---|---|
| 1 | path-blocks.md and cli.md said an installed weight stands in whenever none of the steps has the weight; Google's own nearest weight comes first when Google has the family | **Fixed** in both: "the nearest weight is used … Google Fonts' nearest weight when Google has the family, otherwise the nearest weight installed on your computer" |
| 2 | "Move the project's `pathogen.json` … to a folder that contains both" fails when that folder is the home folder, which is never read | **Fixed** in projects.md (What changed, the rule, the table) and in the error message itself ("…, other than your home folder itself."); tests updated |
| 3 | "or load it with a file path" for `arialbd.ttf` — a path can't reach `C:\Windows\Fonts`, and the family becomes the file name | **Fixed**: copy it into `fonts/` as `Arial-Bold.ttf`, or keep its name: `@font "./fonts/arialbd.ttf" 700;` (family `arialbd`) |
| 4 | Name the `.ttc` trap (Helvetica, Avenir, Menlo) | **Fixed, corrected**: checked live, Google serves Helvetica and Avenir but not Menlo, so the docs use `@font "Menlo";` as the example and say some such families download instead |
| 5 | README `npx pathogen` fetches another package without a local install | **Confirmed** (`npm view pathogen`: "path utilities for node.js and browsers") and **fixed**: examples run `npx pathogen-lang`; `pathogen` is mentioned as the installed short name |
| 6 | security.md's "never" was false for EACCES / ELOOP | **Fixed** by the W1 redesign above |
| C | "works as is" for an unzipped Google family: check optical-size families | **Confirmed and fixed in code.** Google's download manifest for Inter has no `Inter-Bold.ttf`, only `Inter_18pt/24pt/28pt-Bold.ttf` (Fraunces only `Fraunces_72pt-*`; Open Sans and Roboto have plain names beside `_Condensed`). The search now finds `Family_<size>pt-Weight.ttf`, smallest size first, after any plain name; `_Soft` and width variants stay out. Documented in the names list; test |
| C | "or in the cache" for the failed-download error | **Fixed** |
| C | projects.md "a program that reads no files" | **Fixed**: "a program without `@font`" |
| C | README `--root` default | **Fixed**: "else the file's folder" |

### Checks after round 3 (2026-10-25)

- Full suite: 172 files, 7,280 passed, 1 skipped (the Linux-only case pair), 1 todo. ESLint clean on `src/host`, `src/node`, `tests/host`; in the two editor test files only the known structural findings remain (package code under `packages/` isn't lint-clean in committed files either). `tsc --noEmit`: the same 85 old errors, none in changed code.
- Rebuilt `dist`, the `.vsix` and the website. VS Code harness 19/19; playground harness 6/6; check-links 55 pages, 1,548 links, 0 broken; `readme-node-example-v2.ts` all MATCH; `georgia-weights.pathogen` online output unchanged from round 2.
- Corpus sweep v4 (`verify/font-sweep-offline-v4.md`): the same outcomes as v2 and v3 for all 73 files.
- After the alias fix: `dist` and the `.vsix` rebuilt; VS Code harness 19/19; full suite 172 files, 7,280 passed, 1 skipped, 1 todo; ESLint clean on `src/node` and `tests/host`. (The website wasn't rebuilt: the playground doesn't use `src/node`.)
