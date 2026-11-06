# Modules backlog

Deferred work from the modules, data and files effort. Each entry says what it is, where it stands today, why it waits, and where it came from. Status of the effort as a whole: `37-roadmap-status.md`. Add new entries at the end of their section; mark done ones with the commit rather than deleting them.

## Editor

### Rename and find-references across files
- **What:** F2 on an imported or exported name renames it in every file that uses it; Find All References lists uses in every file of the project.
- **Today:** F2 on a shared name is refused with the reason (`gear is imported from parts/gears.pathogen. Renaming across files isn't supported yet: rename it in each file.`), so it never renames half the uses. Find All References covers the current file. Same in VS Code and the playground.
- **Needs:** an index of every `.pathogen` file in the project folder. A start exists: the language server lists the project's modules for path completion (`listProjectModules`, `DocumentModules.listed`).
- **From:** plan 12 decision 25 ("1b"). Put on the backlog by you on 2026-11-05 ("YES, let's add this to the backlog").

## Language

### Default import of a drawing
- **What:** `import badge from "./badge.pathogen";` gives that file's drawing as a value to place (decision 5 in `02-decision-log-v1.md`).
- **Today:** any default import is an error that shows the `{ }` and `* as` forms.
- **Open:** the use case. Since step 5e only `module;` files can be imported and modules never draw, so this would mean importing an ordinary program, reopening that rule. It also needs a value type for "a drawing" (placement, layers, ViewBox). SVG import (phase 4) is the closest relative.
- **From:** plan 12 decision 25 ("1b, after a design round"). Delayed by you on 2026-11-05: "I'm not sure I understand the use case for this or believe it is a priority."

### The `demo { }` block
- **What:** a block in a module that runs only when the module itself is compiled, so a library can show itself.
- **Today:** a module's preview is empty, with the notice "This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it."
- **From:** the step 5e decision (`23-modules-are-libraries-plan.md`). Delayed by you on 2026-11-05: "I am not sure that we need to focus on the demo block."

### Fn and enum bindings fixed in every file
- **What:** decision 30 option (b): fn and enum names behave like `const` in every file, and enum members can't change. Breaking; needs its own audit and KV check.
- **Today:** imported fns and enums are fixed; inside one file `f = 3` and `Dir["Up"] = "zz"` still work.
- **From:** plan 12 decision 30 (a), "propose separately".

### Positions on every evaluator error
- **What:** errors in the compiled file that have no line today get one, as errors in imported files already do.
- **Why it waits:** it changes error text, so it needs its own audit (plan 12 amendments, "Step 3, positions").

## Bugs

### `star(…)` with a string point count
- `star(cx, cy, r1, r2, 'twelve')` draws `m 0 0 z` instead of failing. Found while checking phase 1a's examples (plan 12 follow-ups).

### Found in the phase 2 audit (playground and API)
Existing issues outside the modules work, found while mapping phase 2 (`38-phase-2-audit.md`, "Found along the way"):
- **"Copy URL" always opens the create form.** It reads `route.params.id`, but the workspace route's parameter is `slugId`, so every link is `/workspace/new?state=…` (`playground/utils/url-state.ts:105`, `utils/router.ts:39`). Decide what the link should open, then fix.
- **Admin writes can lose a code save.** Unpublish, flag, unflag, requeue and approve rewrite the whole workspace record without re-reading it (`website/api/router.ts:1087-1088, 1417, 1485, 1514, 1563`).
- **Deleting a workspace leaves its thumbnail PNGs in R2** (`router.ts:545-590`).
- **`POST /workspace/:id/copy` copies `flagged`.** The SPA doesn't use it (`router.ts:593-641`).
- **A dead read:** the client reads `workspace.thumbnailContentHash`, which the server never writes (`workspace-view.ts:530`).
- **No server-side limit on workspace code size.**

## Performance

### Cache parsed modules across compiles in VS Code
- Keyed by content hash. Only if large projects get slow (plan 12 follow-ups).
