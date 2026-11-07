# The entry-points list and a read-only `pathogen.json`: your answers

2026-11-07. The proposals and my assessment: `44-phase-2-mockups-v5-review.md`. Mockup: `phase-2-mockups-v6/`.

## Your answers, in your words

- "I agree that #3 (the counter-proposal) is the right way to go as well as your refinements of the the read-only pathogen.json file."
- On what `pathogen-lang <folder>` compiles: "That's fine for now, but let's circle back towards the end of this effort to allow for a: pathogen-lang <folder> --entrypoint=file.pathogen and a pathogen-lang <folder> --all for all of the entrypoints"
- On the key's spelling: "Yes, let's do camel case"
- On showing `pathogen.json` in a brand-new workspace: "Yes!"

## Decided

| Question | Decision |
|---|---|
| What the list means | It sets the order. It doesn't decide which files are programs (`module;` does that). The first entry is the main. Listed programs come first wherever several are shown; programs that aren't listed still compile and still appear, after the listed ones |
| The key | `entryPoints` |
| No key | The same as `["main.pathogen"]`. `{}` still just marks a project folder. This also fixes the CLI gap: a folder whose `pathogen.json` is `{}` gets `main.pathogen` |
| Playground upkeep | A new workspace starts with `["main.pathogen"]`. New and uploaded programs are appended. Rename rewrites the entry. Delete drops it; if it was the main, the next entry becomes the main and a toast says so. Set as main moves the file to the front |
| A program that gains `module;` | The list drops it, and appends it again if the header goes. If it's the main, it stays first and the chip shows an error, so the main never changes without you choosing it |
| `pathogen.json` in the tree | Shown in every workspace, new ones included: pinned as the last row of the top level, muted, with a lock. Read-only for you; the playground writes it |
| How it's stored | As workspace data. The file is written from it the same way every time (`JSON.stringify(…, null, 2)` plus a newline), so it can't disagree with the workspace (storage design, 2b) |
| Its tab and row | The tab keeps `.json`. No Rename, Delete or Move. The chip leaves it out. Typing does nothing, and a line at the top of the editor says why |
| The name | Reserved in every folder. In the CLI, a `pathogen.json` inside `parts/` would make `parts/` a project of its own. An upload that holds one leaves it out, with a message of its own |
| `pathogen-lang <folder>` | Compiles the first entry, for now |

## Not answered yet

How each entry is checked (note 44, question 3): a missing file, a library, the same file twice, an empty list. My recommendations are in note 44. They go into the `docs/projects.md` draft, which you approve before any code.

## A correction to note 44

Note 44 says v6 can't keep reading v2's example in place. It can: the mockup builds only read committed `.pathogen` text and committed SVGs, and compile nothing. The real limit comes after the format change lands. Recompiling v2's SVGs by hand would then fail, because the project-folder search finds v2's `{ "main": … }`. v6's `build.ts` says so.

## For the end of phase 2: two CLI flags

- `pathogen-lang <folder> --entrypoint=file.pathogen` compiles another program of the project.
- `pathogen-lang <folder> --all` compiles every entry point.

To settle then:
- whether `--entrypoint` takes a path from the project folder, and whether the file must be listed or can be any program;
- where `--all` writes its output, and how each file is named (one SVG per program, named after it, in an output folder?);
- how both flags combine with `--output-svg-file`, `--json`, `--png` and `--strict`;
- the exit code when one program of several fails.

## The order (adds to `42-phase-2-order.md`, with the new step from note 44)

- **2a:** v6, the `pathogen.json` row and the entry-point list.
- **2b:**
  - `docs/projects.md` for `entryPoints`, with the entry checks;
  - the multi-file workspaces docs page;
  - the storage design: the list, folders, name characters and size limits.
- **The CLI and host change** (`src/host/project.ts`, `src/cli.ts`, tests, the VS Code fixture, the CHANGELOG's Unreleased entry) follows its docs. It lands before the next npm release.
- **2g, export:** writes `pathogen.json` from the workspace. **Importing a project folder** reads `entryPoints`.
- **The end of phase 2:** the `--entrypoint` and `--all` flags.
- **After phase 2:** other file types in a workspace (.json, .csv, .svg, fonts).
