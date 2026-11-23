# 2f docs: content review (2026-11-21)

The docs for 2f, written before any code (note 66): `docs/projects.md` ("In each tool", the VS Code bullet; a new section "The preview in VS Code"; one sentence in "pathogen.json") and `docs/modules.md` ("In each tool", the VS Code preview bullet). One content-reviewer pass, against note 66's design and `docs/workspace-files.md` "The preview and the program list".

| # | Finding | Disposition |
|---|---|---|
| 1 | **Must fix.** "Stays on that program while you move between files" says the opposite of the design's per-project choice. It also didn't say what a file outside any project shows | **Fixed:** "while you move between the project's files … A file in another project shows that project's chosen program, its main at first, and a file without a main shows itself"; the same in the In each tool bullet |
| 2 | **Must fix.** `pathogen.json`'s "`{}` and `{"entryPoints":["main.pathogen"]}` mean the same thing" conflicts with the VS Code preview when there's no `main.pathogen` | **Fixed:** "name the same main", plus a sentence that the VS Code preview treats a `{}` with no `main.pathogen` beside it as a project without a main. The difference is deliberate: a listed main declares one, `{}` may only fence `@font` paths |
| 3 | The definition can be shorter; "works as a playground workspace's does" tells a VS Code-only reader nothing | **Taken:** "a `pathogen.json` with `entryPoints`, or a `main.pathogen` beside its `pathogen.json`"; "works like this", with the playground link after the list |
| 4 | "Anywhere else": a pairing name, precise cases, the broken `pathogen.json` case, drop "as it always has" | **Taken:** "Without a main," with the exact cases and the broken `pathogen.json` line |
| 5 | "When the project has more than one"; "that `entryPoints` leaves out" when there's no key; does a chosen unlisted program stay listed? | **Taken:** "when the list has more than one program"; "that `pathogen.json` doesn't list". **Decided:** an unlisted program stays in the list while you're editing it or it's the one shown |
| 6 | "Too detailed to draw this small" missing, though it's the same component | **Added** |
| 7 | The module-main row's wording wasn't approved; letter case and symbolic links fail too | **Taken:** "such as when it doesn't exist or is a module". The module-main row reuses the playground's own wording, "A module now, so it can't draw as the main" (`MODULE_MAIN`); flagged to you with the docs |
| 8 | `onDidRenameFiles` / `onDidDeleteFiles` see only VS Code's own file operations | **Taken:** "renamed or moved outside VS Code, it counts as deleted". The file watcher sees a delete from anywhere, so "back to the main" holds for deletes outside VS Code too |
| 9 | modules.md drops the reason a module's preview is empty; gloss "a project with a main"; `preview-modules.ts` quotes the old sentence | **Taken** in the docs; the code comment changes in the code step |
| 10 | The command named as if it were the button | **Taken:** the button, then the command in the Command Palette |
| 11 | "On a program's editor" → "from a program's tab"; does a module tab's button reset a chosen demo to the main? | **Taken. Decided:** no. From a module's tab, the button shows the program chosen in that project, the main at first. It opens or reveals the preview without undoing a choice |
| 12 | "Redraws it" is ambiguous | **Taken:** "the preview redraws" |
| 13 | "Starts from the editor you open it from" | **Taken:** "The next preview starts from the tab you open it from" |
