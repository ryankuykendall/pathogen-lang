# Docs changes since your approval (awaiting it before the push)

> **Update, 2026-11-04, step 5e (modules are libraries).** docs/modules.md was rewritten for strict modules. The full list is in `24-phase-1a-step5e.md`, section "Docs". It supersedes some rows below:
> - the step 4 `ids.pathogen` fence now reads line 7, not line 5;
> - the duplicate-id row now says `arrows.pathogen line 4`;
> - the "layer inside an exported array or object" and "reading another file's layer" choices no longer apply, because a module can't hold a layer at all.
>
> The step 5a and 5b rows otherwise stand.
>
> **After your 5e approval:** the missing-`;` example (in "Errors in other files" and in the Errors table) now reads `Missing ';' after const declaration`. That is what the code reports now that `module;` comes before the `const`. The reason is in `24-phase-1a-step5e.md`. **Approved by you on 2026-11-05** ("Approved on 'the Missing...' docs wording").
>
> **Pen helpers, 2026-11-05. Approved by you on 2026-11-05** ("Approved on the pen-helper docs; commit and start step 6"). You chose to make the functions that work from the pen an error at a module's top level ("Let's go with option 1 and make them an error"). The docs changes, content-reviewed:
> - docs/modules.md "Exporting": a new bullet under "A module doesn't draw at its top level". It lists the nine functions, says a path block has its own pen, says `polarOffset` is fine, and points to `Point(x, y).polarTranslate(angle, distance)`.
> - docs/modules.md Errors table: a new row with the exact message.
> - docs/stdlib.md "Context-Aware Functions": the intro is rewritten, because it said every function there uses the pen and the intersection functions don't. It now says a module can't call the pen functions at its top level.
>
> Details are in `25-pen-helpers-in-modules.md`.

2026-11-04. You approved the phase 1a docs on 2026-11-03 ("Let's move on"). Steps 4 and 5 changed published docs since then. Each change went through the content review, but the per-step process asks for your approval too. All of them are in local commits, none pushed. The push waits on your approval (plan step 7).

## docs/modules.md

| Where | Before | After | Step |
|---|---|---|---|
| "What you import is fixed", the `ids.pathogen` error fence | `Cannot assign to lastId — it belongs to ids.pathogen, …` | `Error: ids.pathogen line 5, col 3: Cannot assign to lastId — …` then `  called from main.pathogen line 4`: the full trace, as the CLI prints it and the other examples show | 4 |
| Errors table | — | Three new rows: an exported fn picking from a Cycler its file holds; one changing a gradient, grid, mask or other value its file holds; adding to or changing a namespace (`kit.extra = 1`) | 4 |
| "Ids from other files", raw `url(#…)` bullet | … a warning that names the full id. | … adds: "The warning's code is `imported-id`; `--strict=imported-id` makes it an error." | 5a |
| "Ids from other files", the clash bullet | "So does one of your own ids that matches an imported one when both reach your SVG: …" | "The compile also stops when one of your own ids matches an imported one and your drawing refers to that id, even to mean your own marker: … so a reference to `arrows--tip` can't tell them apart." | 5a |
| Errors table, the clash row label | "One of your ids matches an imported one" | "One of your ids matches an imported one your drawing refers to" | 5a |
| Errors table, the raw `url(#…)` row label | "… (a warning)" | "… (a warning, code `imported-id`)" | 5a |
| "Ids from other files", "Only what's used reaches your SVG" | (one sentence) | Adds: "CSSVar names aren't prefixed: every file that uses a name shares one CSS variable. When your own code uses a name, another file's [`@property` rule](#color-property-declarations) for it is left out, since its color would win over yours: importing a file never changes how your own colors render. If your own code registers the name, imported colors that use it follow your rule." | 5b |

## docs/debug.md

| Where | Before | After | Step |
|---|---|---|---|
| The list of warning codes | … `marker-space`, or `ignored-move` | … `marker-space`, `ignored-move`, or `imported-id` (a raw `url(#…)` in your file that only matches an id made in an imported file; see Ids from other files) | 5a |

## Behaviour choices behind them, in one line each

- **The id clash fires on any reference to the shared id,** even one meant for your own def. A reference names an id, so it would reach both.
- **A layer inside an exported array or object exports fine,** and is an error only when it's used. Its other values (`kit.size`) stay usable.
- **Reading any property of another file's layer, transform or subscription is an error,** not only writing one. `log(ink)` itself is fine.
- **An imported `@property` rule is left out for any CSSVar name your own code uses,** so an import never changes your colors.
- **Raw `url(#x)` written in an imported file is always that file's own `x`.** A value (a def, or `m.id` of a mask your file passed in) keeps its id. A bare id kept in a string inside an imported file is that file's own name too.
- **In the CLI only, so far:** an imported file's `@font` lines load. The language server and the VS Code preview get this in step 6.
