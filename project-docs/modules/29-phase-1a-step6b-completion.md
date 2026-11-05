# Phase 1a, step 6b, part 2: completion across files

2026-11-05. Part 2 of step 6b (parts listed in `28-phase-1a-step6b-hover-definition.md`). docs/modules.md "In each tool": "Completion offers the exported names inside `import { }`, file paths inside the quotes, and a namespace's names after `gears.`."

## Before and after

| Cursor | Before | After (with the files) |
|---|---|---|
| `import { \| } from "./parts/gears.pathogen";` | every keyword, stdlib fn and enum (169 items) | `gear`, `Teeth`, `toothDepth`, each with what it is and its file: `fn gear(center, radius, teeth) — parts/gears.pathogen`, `enum Teeth { Few, Standard, Fine } — …`, `const toothDepth: number — …` |
| `import { gear, \| }` / `import { to\| }` | the same 169 | the rest (`Teeth`, `toothDepth`) / `toothDepth` |
| `import { \| } from "./parts/kit.pathogen"` (kit passes on gears' names) | 169 | `gear` and `Teeth`, as what they pass on |
| `import { Teeth as \| }` | 169 | nothing: a new name |
| `import { \|` (no path yet), or no files (the playground) | 169 | nothing |
| `gears.\|` (`* as gears`) | whatever the regex member fallback guessed | the three exports, nothing else (`hub` isn't exported). Also inside a fn, `${…}` in a template literal, and a style value's `${` |
| `kit.\|` | the same guess | `gear`, `Teeth`, as what they pass on |
| `from "\|"` | 169 | the project's modules written from this file: `./lib/marks.pathogen`, `./parts/gears.pathogen`, `./parts/kit.pathogen` (kind `file`, with the range they replace) |
| `from "./pa\|"`, also before the closing quote is typed | 169 | `./parts/gears.pathogen`, `./parts/kit.pathogen` |
| from `/parts/kit.pathogen`: `from "\|"` | — | `../lib/marks.pathogen`, `./gears.pathogen` (not itself) |
| `from "/\|"` | — | the project paths: `/lib/marks.pathogen`, … |
| no project file list | — | nothing in the quotes |

## Code

- `module-exports.ts`:
  - `LanguageServiceOptions.projectFiles`, the project's modules by project path. The language server will list them; the services never read the disk.
  - `importCompletionContextAt` reads the Lezer tree: a String in an ImportDeclaration (inside its quotes); an ImportSpecifiers node (between its braces, with the listed names and the typed word); `as` before the cursor in an ImportSpecifier.
  - A path without its closing quote doesn't parse as a string: the tree breaks the import apart (probe `tmp/phase1/probe-import-tree.ts`). That one case is read from the line, `import … from "…` up to the cursor.
  - `relativeImportPath`.
- `completion.ts`:
  - `getCompletions(doc, pos, options)`. The import context is checked first, when the source has `import`. It returns early: inside an import, nothing else applies.
  - `namespaceMembers()` runs before `resolveMemberAccess` at its three call sites.
  - `exportItems` shares `declarationSignature` with hover, and the type display through `displayTypeName`, now exported from hover.ts.
  - `CompletionItem` gains kind `'file'` and an optional `range`. The language server maps `file` to LSP's File kind and turns `range` into a textEdit in step 6c. Until then both fall back: an unknown kind shows as text, and the item replaces the word before the cursor.

## Decisions

- **Nothing rather than everything inside an import.** Before, the braces and the quotes offered the whole keyword and stdlib list, none of which can go there.
- **An enum export is kind `variable`**, as a local enum's completion is.
- **Path items are modules only.** The caller filters (`projectFiles` is documented as the importable files), since only a module can be imported (step 5e).
- **The playground's legacy completion source** may still add its keyword list inside import braces. A workspace can't import (no files), so it isn't worth a change there.

## Code review

Approve, with follow-ups:
- **An unclosed `import { gear` taking over later lines** (warning 1). Probed (`tmp/phase1/probe-import-tree.ts`): the parser ends the import at the next line, so `lo|` two lines down completes as usual. Pinned by a test.
- **`import * as |`** fell through to the whole keyword list. It now offers nothing (a new name), like `as` in braces.
- **A default import** (`import gears from "./parts/g|"`) offered stdlib names: the AST builder rejects the file, so scope analysis kept no tree and the import context was never found. `syntaxTreeOf` falls back to a plain parse, in completion, hover and go-to-definition alike.
- **Tests**:
  - just after `}`;
  - an import on a later line;
  - `relativeImportPath` directly (same folder, `../`, `../../`, root to nested);
  - the after-the-quote assertion now checks for no `file` items at all.
- **For step 6c**: the server must turn `range` into a textEdit (else `./pa` becomes `././parts/…`) and map `file` to `CompletionItemKind.File`.

Not changed:
- The line regex can match a backtick-string line that starts with `import … from "`. It's rare and only offers paths.
- `displayTypeName` stays in hover.ts, imported by completion.ts; there's no cycle.

## Tests

tests/modules-editors.test.ts: the completion describes (17) and `relativeImportPath` (1), plus getCompletions at every offset of the seven half-typed sources. Hover and definition in a file with a default import (1).

## Checks

- tests/modules-editors.test.ts (48), tests/language-services/, modules-syntax, the playground's legacy-completion deferral test: 1,081 passed.
- Full suite before the review's changes: 192 files, 8,328 passed, 0 failed.
- This commit's tree alone, with the review's changes: 191 files, 8,323 passed, 0 failed.
- No evaluator change, so no semantics audit.
