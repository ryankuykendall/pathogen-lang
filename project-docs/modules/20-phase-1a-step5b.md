# Phase 1a, step 5b: CSSVar registrations from other files

2026-11-04. Design: `17-phase-1a-step5-design.md`, section 5b, and the advisor's amendment about the compiled file's own names. Contract: docs/modules.md, "An imported file runs on its own" ("the `@property` rule of a CSSVar") and "Only what's used reaches your SVG". 5b is committed after 5c, because 5c was finished first.

## Before and after

| | Before | After |
|---|---|---|
| `export const accent = Color(CSSVar('--accent', '#e63946'));` used in your file | the `@property --accent` rule was registered in the imported file's own state, which is discarded, so it never reached your SVG | the rule joins your SVG when `var(--accent` appears there |
| The same, unused | — | stays out |
| Your own code also uses `--accent` (registered or not) | — | your meaning wins: the imported rule stays out |
| An imported fn making `Color(CSSVar(…))` while your file draws | registered in your state, always emitted | goes to the shared list and joins only when used, like an imported def |

## What this step delivers

- **Registration.** `Color(CSSVar(…))` registers into the compile's `moduleDefs.cssProperties` while an imported file's code runs, and into the running state's own map otherwise, as before. The first registration wins in each list, as within one file.
- **The compiled file's own names.** The `CSSVar` constructor notes every name the compiled file's own code uses (`moduleDefs.ownVarNames`).
- **Joining.** `defsForOutput`'s walk also looks for `var(--name` in every string. An imported rule joins when the name isn't the compiled file's own (registered or used). It returns the `@property` list with the defs, and `buildCompileResult` emits that list.

## Decisions

- **Your names keep your meaning.** The advisor flagged the case of your own unregistered `CSSVar('--accent', 'red')` beside a library's typed `@property --accent`. A registered property takes its initial value instead of a `var()` fallback. So joining the library's rule would silently turn your red into the library's color, just because you imported a file.
  - **The rule:** an imported rule never joins for a name your code uses.
  - **Leaving it out costs the imported color nothing.** `Color(CSSVar(name, fallback))` registers the fallback itself as the initial value, so the imported color renders the same either way.
- **Custom property names aren't prefixed.** CSS reads them by name, and the user wrote that name.
- **Docs.** "Only what's used reaches your SVG" gained three sentences, after the content review: CSSVar names aren't prefixed and are shared; another file's `@property` rule is left out for a name your code uses, so importing never changes your colors; your own registration of a shared name is what imported colors follow.

## Checks

- **`tests/modules-cssvar.test.ts`** (10, after the review) covers:
  - a used color, and an unused one;
  - importing without using anything;
  - a style block resolved while the file loaded;
  - an imported gradient whose stop carries the color;
  - an imported fn's color;
  - your own registration winning;
  - your own unregistered name keeping your fallback;
  - one-file programs.
- **Semantics audit, tree-alone suite, full suite:** see the commit message.

## Reviews

- **Code review** (no critical findings; the early return and the ordering were checked). Dispositions:
  - **W1, a raw `var(--accent, blue)` in your own style would bypass `ownVarNames`: not reachable.** A probe shows the style validator rejects a raw `var()` as plain text, as a template and as a string literal: "contains a raw var(): use the Pathogen CSSVar() constructor instead". `src/render` never writes one either. So every `var(--name)` in the output comes from a `CSSVar()` call, and noting the compiled file's `CSSVar()` calls covers every name it uses. Two tests pin this: the raw `var()` error, and a `CSSVar()` written inside a style block.
  - **W2, the docs sentence: sent to the content review.** It says your own colors never change. The reverse, an imported color following your own registration of a shared name, is CSS's shared-name rule and is outside the sentence's claim.
  - **Suggestions:** the variable pattern matches `CSSVar()`'s own validation (`--[A-Za-z_][A-Za-z0-9_-]*`), so the two agree.

  `tests/modules-cssvar.test.ts` now has 10 tests.
- **Content review** of the docs sentence: approve with changes, taken in full. The sentence was accurate, but it sat among bullets that all say another file's names get a prefix, so readers would assume CSSVar names do too. "Keeps your meaning" was abstract. The bullet now:
  - says CSSVar names aren't prefixed and every file that uses a name shares one variable;
  - gives the reason the imported rule is left out ("its color would win over yours");
  - links `@property` to `#color-property-declarations`;
  - covers the reverse case the code reviewer raised in one sentence: "If your own code registers the name, imported colors that use it follow your rule."
