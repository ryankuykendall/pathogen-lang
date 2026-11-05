# Phase 1a, step 6b, part 1: hover and go-to-definition across files

2026-11-05. Step 6b of `26-phase-1a-step6-plan.md` is split in parts, each a commit:
1. **hover and go-to-definition** (this note);
2. completion: the exports in `import { }`, paths in the string, a namespace's members;
3. signature help, with one parameter helper for local and imported fns;
4. rename refused on imported and exported names; the built-in-name quick fix on an import.

The language server and the preview pass the graph in 6c and 6d. Until then these work in tests and for any caller that passes a graph.

## Before and after

| | Before | After (with the files) |
|---|---|---|
| Hover on `gear` (imported) | `**gear** — *imported name*` / `Defined at line 1` | `**gear** — *function*` / `` `fn gear(center, radius, teeth)` `` / `Defined in parts/gears.pathogen, line 8` |
| Hover on an imported const | the same "imported name" | `**toothDepth** — *variable: number*` / `Defined in parts/gears.pathogen, line 4` (type inferred in its own file) |
| Hover on `Kind` (`Teeth as Kind`) | "imported name" | `**Kind** — *enum*` / `` `enum Teeth { Few, Standard, Fine }` `` / `Defined in …, line 6` |
| Hover on `Teeth` before `as` | nothing | the export, as above |
| Hover on `gears` (`* as gears`) | "imported name" | `**gears** — *namespace*` / `The exports of parts/gears.pathogen: gear, Teeth, toothDepth` |
| Hover on `gears.gear` | nothing | the export |
| Hover on `kit.gear`, where kit.pathogen has `export const gear = gears.gear;` | nothing | where gear is defined: gears.pathogen line 8 |
| Hover on `import { gera }` (not exported) | "imported name" | `**gera** — *imported name*` / the compiler's own `parts/gears.pathogen has no export named gera. It exports: gear, Teeth, toothDepth.` |
| Hover on `gears.hub` (not exported) | nothing | nothing (the compile names it) |
| Hover on a local fn / enum | `**draw** — *function*` / `Defined at line 1` | adds `` `fn draw(cx, cy)` `` / `` `enum Teeth { Few, Fine }` ``: the same line as for an imported one |
| Go-to-definition on an imported name, its alias, the name before `as`, `gears.gear`, `kit.gear` | the import line | the name in the other file: `{ file: '/parts/gears.pathogen', range }` |
| … on a namespace, or on an import's path | the import line / nothing | the top of the file |
| Without the files (playground, unsaved file) | — | unchanged |

## Code

- `src/language-services/module-exports.ts` (new):
  - `LanguageServiceOptions { modules?: ModuleGraph }`, the one options type the services take;
  - `analyzeFile` runs scope analysis once per ModuleFile (WeakMap);
  - `exportsOf`, `importedFile`, `resolveImport`, `resolveExport`;
  - `followPassedOn` follows `export const gear = gears.gear;` and `= cog` (cog imported), up to 16 passes;
  - `exportNameRange`, `declarationSignature`, `importSiteAt` (Lezer tree: the path string, or the Identifier before `as`), `namespaceReceiverAt` (the `* as` name before `.word`, scanned backwards).
- `scope-analysis.ts`: a Declaration carries `exported`, `params` (fn), `members` (enum) and `importFrom { path, name? }`.
- `hover.ts`: `getHoverInfo(doc, pos, options)`; step 2b (the import site, a namespace's member) and `importTargetHover`; local fns and enums show the signature line.
- `navigation.ts`: `Location.file?` (a project path; the server will turn it into a URI); `getDefinition(doc, pos, options)`.
- `module-messages.ts`: `exportList` is exported, so a namespace's hover lists exports in the compiler's order.

## Decisions

- **The graph is data, not a callback** (the plan said `resolveImport`). It already holds every imported file's source and resolved imports, so a callback would add nothing.
- **`Location.file` is a project path, not a URI** (T14 allows either). The language services don't know where the project folder is.
- **Re-exports are followed** for hover and go-to-definition, as TypeScript does: the hover shows where the name is defined, not the line that passes it on.
- **Local fns and enums gain the signature line**, so an imported fn never shows more than a local one.

## Code review

Approve with minor changes. Taken:
- **Go-to-definition with the cursor just after a word** (`Teeth|` in `{ Teeth as Kind }`) missed the import site: the token after the cursor is `as`. `importSiteAt` now tries the token after the cursor, then the one before.
- **A click on a quote or a `/` in an import's path** did nothing: definition stopped when no word was under the cursor. It now looks for the import site first.
- **A word inside a path had someone else's hover**: `gears` in `"./parts/gears.pathogen"` showed the `gears` namespace, and a single letter in a path the path command's. Now no hover, with or without the files (checked first, when the file has an import).
- **More tests**, listed below.

Noted, not changed:
- A namespace with whitespace before the dot (`gears\n  .gear(…)`) gets no cross-file help. The member hover and completion don't handle that layout either.
- `export const all = gears;` hovers as the const that holds the namespace, not as the namespace.
- A re-export of a name the other file lacks (`= gears.gera`) shows the passing-on line. That file's load fails anyway, naming it.
- Enum members through a namespace (`gears.Teeth.Few`) get no cross-file hover yet.
- The reviewer suggested listing module-exports.ts in src/language-services/CLAUDE.md's module catalog. That's for the user to decide (an agent's suggestion to edit a CLAUDE.md).

The server ignoring `Location.file` until 6c is expected: it doesn't pass a graph yet, so no `file` is ever set.

## Tests

tests/modules-editors.test.ts (30): the docs' gears library, a kit that passes on two of its names, a file that passes on a renamed name and one that passes on a whole namespace. The graph is built with resolveModules, as the server will.
- Hover: each row above, word for word; from inside an imported file (its `./` starts in its folder); without the files.
- Go-to-definition: each row above, with exact name ranges in the other file; a name in this file has no `file` field.
- The cursor: just after a word; on a quote and a `/`; a word inside a path (no hover); `as`.
- A renamed re-export; a namespace passed on as a value; a parameter shadowing a namespace; an import whose file couldn't be read.
- Half-typed imports (7 sources): hover and definition at every offset never throw.

## Checks

- tests/modules-editors.test.ts, tests/language-services/, tests/modules-syntax.test.ts: 1,056 passed.
- Full suite before the review's changes: 192 files, 8,306 passed, 0 failed.
- This commit's tree alone, with the review's changes: 191 files, 8,305 passed, 0 failed.
- No evaluator change, so no semantics audit.
