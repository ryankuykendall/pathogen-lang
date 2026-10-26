# Phase 0b docs — content review disposition (2026-10-23)

Reviewer: content-reviewer agent (UXD / UXE / PM / ID personas), on the new and changed text in
`docs/projects.md` (new), `docs/fonts.md`, `docs/path-blocks.md` (Font Loading by Environment),
`docs/cli.md`, `docs/security.md`, `docs/textblock.md:253`, and two blog update notes.
28 findings: 2 blockers, 17 should-fix, 9 nits. Every anchor resolved.

"Code" = the finding changes what phase 0b implements, not only the prose.

| # | Severity | Finding (short) | Disposition |
|---|---|---|---|
| 1 | blocker | fonts.md:99 said playground counts match the complete file | Rewritten: slices leave characters out; every count can differ (856 vs 936) |
| 2 | blocker | projects.md `@font "Georgia";` — Georgia is in `/System/Library/Fonts/Supplemental`, not searched | **Code:** add `/System/Library/Fonts/Supplemental` to the macOS system folders; docs list it; verify on macOS before commit |
| 3 | should | "What changed" omitted downloads-by-default, errors-not-warnings, rejected spellings | projects.md callout lists all three; cli.md links it; `PATHOGEN_OFFLINE=1` CI tip |
| 4 | should | blog post still says 856 is "its own current release" | Update note adds: not a release — slices leave 80 characters out |
| 5 | should | "relative to the file the directive is written in" wrong for `/` | Reworded: `./`/`../` start at the file, `/` at the project folder |
| 6 | should | "font-loading error" wording; exit-code row; no warning code for `--strict` | Evaluator + docs say "font-loading message"; exit row qualified; **code:** new warning code `font-load` (also `font-weight`), listed in debug.md |
| 7 | should | symlinks, `fonts/` walk-up, stray `~/pathogen.json`, id_rsa overstated | **Code:** realpath containment (a symlink pointing outside counts as leaving); the `pathogen.json` search stops below the home folder. Docs: "an error before anything is read" |
| 8 | should | "the compiler never writes" contradicts cache and `-o` | "A program can't make the tools write or delete anything; they write only the outputs you ask for and the font cache" |
| 9 | should | webview CSP description inaccurate | Rewritten from preview.ts:150-156 (`default-src 'none'`, `cspSource` for fonts/images) |
| 10 | should | Dock-launched VS Code does load the shell profile | Corrected; "VS Code has no switch of its own" |
| 11 | should | per-weight or per-family lookup? | Docs: each step looks for the requested weight. **Code:** local exact → Google (curated snap / default-weight retry) → offline-only nearest local weight, each substitution a `font-weight` warning |
| 12 | should | Restricted Mode claim rests on a default; empty windows are trusted | **Code:** declare `capabilities.untrustedWorkspaces: { supported: false }` explicitly. Docs explain empty-window trust |
| 13 | should | Google ZIP keeps weights in `static/`; proxy claim uncertain | Hint names `static/Raleway-Bold.ttf`; proxy sentence no longer makes a Node-version claim |
| 14 | should | error table missing rows | Added: web address, `~`, JSON object, bad `main`, not a font, missing `main` file |
| 15 | should | unknown-key strictness vs newer files and `$schema` | **Code:** `$schema` ignored. Docs: an older pathogen-lang reports newer keys — update it |
| 16 | should | "downloaded once" — cached fonts drift from Google's release | **Code:** cached fonts re-checked every 30 days when online. Docs say so |
| 17 | should | "a copy on your computer" may be another release | "A copy of your own may be another release and count differently" |
| 18 | should | notice / note / warning — four names | All are warnings; codes `font-weight`, `font-load`; playground file-path case listed with "—" |
| 19 | nit | "slices by alphabet … about 100" | "slices, each covering part of the Unicode chart" |
| 20 | nit | offline miss also breaks `toPathBlock()` | Added `TextBlock.toPathBlock()` |
| 21 | nit | `main` accepts a bare name | Row says `main.pathogen` and `./main.pathogen` both work |
| 22 | nit | what `./` means for `-e` / stdin | "its `./` paths start there too" (projects.md and cli.md) |
| 23 | nit | what the weight after a file path does | "labels it (default 400) — write the file's real weight" |
| 24 | nit | "above" should include the file's own folder | "the file's own folder or one above it" |
| 25 | nit | can't step out and back in | Example `../my-gears/fonts/a.ttf` added |
| 26 | nit | micro-fixes in projects.md | All applied |
| 27 | nit | Noto numbers printed twice | Kept once (Big fonts bullet), named "Noto Sans SC Regular", 10.5 MB first download |
| 28 | nit | blog update notes need a day; stale `pedestal.design/pathogen` links | Domain fixed to pathogen.studio. **Date set at commit time** (the ship day) |
| — | code | `PATHOGEN_FONT_DIRS` split on `:` cuts `C:\Fonts` | **Code:** split on the platform's path delimiter |
