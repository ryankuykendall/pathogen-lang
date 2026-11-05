# Phase 1a, step 6b, parts 3 and 4: parameter hints, rename, the quick fix

2026-11-05. The last two parts of step 6b (parts listed in `28-…`), one commit.

## Before and after

| | Before | After |
|---|---|---|
| `draw(1, \|` for `fn draw(cx, cy)` in this file | `draw(...)`, no parameters, "User function: draw"; the first fn of that name anywhere in the file | `draw(cx, cy)`, `cy` active, "Defined at line 1"; the fn the call sees at the cursor |
| `gear(Point(1, 1), \|` (imported, with the files) | nothing | `gear(center, radius, teeth)`, `radius` active, "Defined in parts/gears.pathogen, line 8" |
| `cog(\|` (`gear as cog`) | nothing | `cog(center, radius, teeth)` |
| `gears.gear(1, 2, \|`, `kit.gear(\|` (re-export) | nothing (the receiver didn't type) | the same signature |
| `gears.toothDepth(\|`, `gears.hub(\|` | nothing | nothing |
| F2 on an imported name, an alias or a namespace | renamed in this file only: the other file kept its name, and the import broke | refused: `gear is imported from parts/gears.pathogen. Renaming across files isn't supported yet: rename it in each file.` |
| F2 on an exported name (declaration or use) | renamed in this file only: every importer broke | refused: `gear is exported, so other files may use it. Renaming across files isn't supported yet: rename it in each file.` |
| F2 on a module's private name (`hub`), or in a program | renamed | renamed |
| Playground F2 on an exported name | silently nothing (after the change above) | an alert with the reason, as for an invalid identifier |
| Quick fix on `import * as Color` / `{ gear as Color }` | renamed the name after `as` | the same (now tested): `Rename Color to MyColor` |
| Quick fix on `import { circle }` | **`import { circleValue }`**: imports another export, which doesn't exist | no fix (no file can export a built-in name; the fix is not to import it) |

## Code

- `signature-help.ts`:
  - `getSignatureHelp(doc, pos, options)`;
  - `fnSignature` gives one label/params/doc shape for a local fn or an export;
  - a namespace receiver is checked before the method tables;
  - the user-fn lookup is `findDeclaration` at the cursor.
- `rename.ts`: `renameRefusal(doc, pos)`; `prepareRename` and `getRenameEdits` refuse the same names, through `refusalFor`.
- `module-messages.ts`: `renameImportedError`, `renameExportedError`.
- `code-actions.ts`: no rename fix for an import whose local name is the imported name.
- `playground/utils/cm-language-services.ts`: `runRename` alerts the refusal.
- Exports: `renameRefusal` from the language services and the package.

## Decisions

- **One parameter helper for local and imported fns**, so an imported fn never shows more than a local one (the advisor's point). Local fns gain their parameters too.
- **A refusal is separate from `prepareRename`'s result.** Old callers see null, as for any name they can't rename, so none of them can rename half a name by mistake. Callers that want the reason ask `renameRefusal`.
- **The alias is refused too**, though it lives in this file only: the docs say F2 on an imported name is refused, and docs/syntax.md says the same for the built-in-name case ("F2 can't rename it yet").
- **The language server's refusal** (a ResponseError, which VS Code shows) belongs to step 6c, with the rest of the server wiring.

## Tests

- tests/modules-editors.test.ts:
  - parameter hints (5);
  - F2 (3): each row above, with prepareRename, getRenameEdits and renameRefusal together;
  - the quick fix (2): both alias forms, and `import { circle }` with no fix. That test found the `circleValue` bug.
- tests/language-services/signature-help.test.ts (3): local fns, with and without parameters, and the fn the call sees.
- tests/playground-rename-refusal.test.ts (2, jsdom): F2 on an exported name alerts and edits nothing; on a local name it still prompts and edits.

## Code review

Approve with minor warnings. Taken:
- **The fn a call sees, across sibling fns**: `findDeclaration` goes by document order, so `mark(` in `third()` picked `other()`'s inner `fn mark(x, y)` over the top-level `fn mark(a)`. Reproduced in a test, then fixed: `declarationForCall` uses the reference scope analysis resolved for the call itself. It falls back to the nearest declaration when a call still being typed has no reference.
- **A stale playground bundle** without `renameRefusal` would throw on F2: the call is now optional.
- **Tests**:
  - a fn called before the line that declares it;
  - a parameter sharing an export's name still renames;
  - a const holding a lambda gets no hint, from a namespace, an import or this file alike (a known limit, pinned).

Noted:
- Until step 6c, VS Code's F2 on these names gets null from `prepareRename`: the client's generic "can't rename" message, not ours. Step 6c sends the reason. Nothing is pushed before then.
- The built-in-name codemod for stored workspaces (scripts/lib/builtin-name-codemod.ts) calls `renameDeclarationEdits` directly, so it would still rename an unaliased `import { circle }`. A playground workspace can't import (there are no files), and production had no imports in step 7's scan, so that path is empty. Phase 2 workspaces with files would need the same check.

## Checks

- tests/modules-editors.test.ts (70), tests/language-services/, builtin-names, modules-syntax, the playground rename test: 1,160 passed.
- Full suite before the review's changes: 193 files, 8,348 passed, 0 failed.
- This commit's tree alone, with the review's changes: 192 files, 8,342 passed, 0 failed.
- `npm run build`; `npm run typecheck:playground` shows only the errors it had before (none in the changed file).
- No evaluator change, so no semantics audit.
