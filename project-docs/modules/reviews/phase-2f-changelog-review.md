# 2f CHANGELOG entry: content review (2026-11-23)

The entry for 2f (draft in `tmp/2f/changelog-draft.md`), checked against docs/projects.md "The preview in VS Code", docs/modules.md and note 66. One content-reviewer pass: 2 must-fix, 6 should-fix, 2 optional.

| # | Finding | Disposition |
|---|---|---|
| 1 | **Must fix.** The dots: the docs show them only while the file you're editing isn't the program shown, and on that file too when it's a program | **Fixed**, in the docs' terms |
| 2 | **Must fix.** "Renamed or moved in VS Code, the preview follows it" left out that a rename outside VS Code counts as deleted | **Fixed:** both halves, as the docs say them |
| 3 | The chip bullet never said "program list", the check, or that choosing a row shows it; the red dot is on the chip, not a row | **Taken** |
| 4 | Missing from the docs: "Too detailed to draw this small", Open in the editor leaving the preview alone, the next preview starting from its tab, and what happens without a main (`{}`) | **Taken:** all four |
| 5 | Filing: the new library exports go under Added → Core "For library callers"; the CLI's switch and the chip's move under Development; the title under Changed → VS Code, and it isn't true that "Pathogen Preview" is gone | **Taken.** The title line says when "Pathogen Preview" stays: `entryPoints` empty, or naming a file twice (no main to name) |
| 6 | Other modified files in the working tree (docs/path-blocks.md, docs/variable-offset.md, tests/variable-offset.test.ts, …) aren't covered | **Not 2f:** the owner's own work in progress, never staged by this session, so not in this entry |
| 7 | No "Tested:" bullet; the review notes, the updated tests and the package's CLAUDE.md not listed; "your answers" reads oddly | **Taken:** the suite count, the 24 checks, the playground's 2d checks, the code review, and that the installed `.vsix` hasn't been checked by hand yet |
| 8 | The Documentation `{}` bullet's wording | **Taken:** the docs' own sentence (10713712 says "name the same main") |
| 9 | Wording: "works like", "never holds up the preview or the editor", active voice | **Taken** |
| 10 | American spelling; "No new built-in names." under Core | **Taken** |
