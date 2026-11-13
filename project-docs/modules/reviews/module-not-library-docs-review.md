# "Module", not "library": docs review (2026-11-13)

The user's decision, 2026-11-13: "We use the identifier 'module' to designate a file as being a module, however our UI text uses 'New library' or refers to it as a library. I would like change our use of 'library' to 'module' in our UI text and documentation for the sake of consistency. This diminishes our need for explainer text such as this [the + menu's "Starts with module;" line]."

Changed: docs/modules.md (published; lines 5, 7, 39, 45, 299), docs/workspace-files.md (not yet published; about 12 lines, and the heading "Programs and modules"), the `module;` hover text, and the playground's strings (note 52, "Module, not library").

## Review (content-reviewer, focused; no blockers)

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1.1 | modules.md L5: "You write the module once" names a module as a file before any sentence says so | should-fix | Fixed: "You write it once" |
| 1.2 | workspace-files.md: "is a **module** ([Modules](#modules-exporting))" stutters under a "modules" heading | should-fix | Fixed: the link moves to the sentence's end, "(see [Modules](#modules-exporting))" |
| 1.3 | modules.md L39 repeats L7 word for word, and lost the cause | nit | Fixed: "**`module;` makes a file a module.**" |
| 1.4 | modules.md L45 said the same thing twice (before this change too) | nit | Fixed: "…so to use a module in another project, copy its file into that project." |
| 2 | Any module-sense "library" left | — | None |
| 3 | "Modules aren't listed." says enough? | nit | Kept: the section and "The main" already say the list holds programs |
| 4.1 | workspace-files.md says the main "stays the main", while its row says "A module now, so it can't be the main" | nit | Raised with the user, who chose (2026-11-13): "Change it to \"can't draw as the main\"". The row now says "A module now, so it can't draw as the main" |
| 4.2 | modules.md L299 "not when compiled on its own" is vague (older than this change) | nit | Not changed: out of scope |
