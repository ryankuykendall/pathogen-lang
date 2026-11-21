# 2f mockup v1: the program chip in VS Code's preview

2026-11-21. Your answer 3b on note 66: the playground's program chip in VS Code's preview, rather than VS Code's own Quick Pick. This round shows it in a VS Code window drawn by hand, in VS Code's default themes (Dark Modern and Light Modern).

- `vscode-chip-mockup.html`: open it in a browser. The buttons choose the state, the theme, where the chip sits, and whether the list has miniatures.
- `<state>-<theme>.png`: every state in both themes (`shoot.mjs`, `node project-docs/modules/mockups-2f-vscode-chip/shoot.mjs`). `list-toolbar-*.png` and `list-names-*.png` are the two variants, on the list state.
- `gears-project/`: the project the mockup shows (four programs, one of them not in `pathogen.json`, and a module). It compiles with today's CLI, and is meant as the fixture for 2f's tests.
- `renders/`: the CLI's drawings of those programs. `main-edited.svg` is `main.pathogen` with `toothDepth` at 10, for state 3; its source is `tmp/2f/gears-edit/`, not kept.

Sources: the chip and its list are `playground/components/program-chip.ts` and `.css`, with VS Code's colors in place of the playground's: the accent is `--vscode-focusBorder`, as the shared zoom pill already does (`src/ui/zoom-pill.ts`). The preview's toolbar, error block and module notice are `packages/vscode-pathogen/src/webview-html.ts` and `preview-modules.ts` as they are. The error texts are real:
- state 6's row uses the playground's `errorRowText`, and line 13 is where the CLI places that error;
- state 7's block is `mainMissingMessage` from `src/host/project.ts`.
