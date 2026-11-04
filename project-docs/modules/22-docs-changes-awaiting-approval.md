# Docs changes since your approval (awaiting it before the push)

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
