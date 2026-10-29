# Reviews: the `ignored-move` warning and function values as numbers (2026-10-29)

Two fixes found while repairing the published examples:

1. **`ignored-move`.** A stdlib shape after `M` ignores the move: `M 85 52 roundRect(0, 0, 320, 220, 14);` draws at (0, 0). This used to be silent and is now a warning.
2. **Function values.** `PI` without its parentheses is the function. Before the fix, `log(PI)` printed JavaScript source, `-PI` gave a generic operator error, and `sin(PI)` returned NaN. All of these now name the function and show the call.

## Code review (code-reviewer): approve

| # | Finding | Disposition |
|---|---|---|
| 1 | No dedupe: a loop emits one warning per iteration. | Matched the project's existing rule, docs/debug.md "Repeated warnings": every instance stays in `warnings`, and the surfaces show a family once as ×N. A test pins that a 200-iteration loop is one family of 200. |
| 2 | `takesNoArguments` read the whole source for `...` (body text could match) and treated a defaulted parameter as none. | Applied: it reads only the parameter list, empty means no arguments. Tests pin `random()`, `cubicSpline(…)` (rest parameter) and `sqrt(…)` (native). |
| 3 | `NAME_BY_FUNCTION` let a later alias win. | Applied: the first name wins. |
| 4 | `args.length !== 2` is right. A method draw (`M x y tile.draw()`) isn't checked. | Documented: "The check covers a direct call to a shape function; a path block's `draw()` or `drawTo()` isn't checked." |
| 5 | `isPlainStdlibFunction` can't throw; shadowing behaves. | No change. |
| 6 | No stdlib function legitimately takes a function. Arrays aren't scanned (`polygon([PI, …])`). | Arrays are left as they are; the NaN backstop still warns there. |
| 7 | Warning-code lists are all updated. | No change. |

## Content review (4 personas): revise → applied

| # | Finding | Disposition |
|---|---|---|
| 1 | **Blocking.** The `PI` angle hint said `0.5pi`, but π as an angle is `1pi`. | Fixed in the compiler (`ANGLE_SPELLING.PI = '1pi'`), the tests, the CHANGELOG and stdlib.md ("π is `1pi`, and `PI() / 2` as an angle is `0.5pi`"). |
| 2 | **Blocking.** The grid functions also start their own subpath and warn, but neither list named them. | Confirmed by running them. Added to the stdlib table and to the test matrix (squareGrid, triangleGrid, hexagonGrid). |
| 3 | **Blocking.** debug.md Strict mode's "the program above" now pointed at the new section's example. | Now names "the `NaN` program from Numbers SVG cannot draw", with a link. |
| 4 | **Blocking.** "When the move is a statement of its own" is wrong: the rule is "on an earlier line". | Reworded to match the code. |
| 5–6 | The two lists disagreed, and the stdlib paragraph was too dense. | stdlib.md "Path Functions" is now one rule sentence plus a two-row table: own coordinates vs from the pen. It is the one full list. debug.md names two examples and links to it. "Begin with a relative `m`" is explained: their first point is measured from the pen. |
| 7 | debug.md's display sentence was overloaded. | The list ends at path blocks. A new paragraph after the example covers functions and `StdlibFunction(PI)`. |
| 8 | `#path-blocks-syntax` landed on block syntax. | Now links `#path-blocks-drawing-a-path-block`. |
| 9 | Blog note: "warned … warning" repeats. | Changed to "just as predicted". |
| 10 | "Subpath" is unexplained jargon. | Glossed once in debug.md: "lifting the pen and putting it down at its own `M`". |

## Checks

- Full suite: 178 files, 7,486 passed. That run predates the content-review fixes; the fix tests and the docs examples test (144) passed again afterwards.
- Existing programs: 1,389 compiled (docs and blog examples, blog samples, project-docs). The warning fires only on the docs example written to show it, and no program hits the function-value error.
- CLI, playground (the served bundle in a browser) and VS Code (the bundled language server over stdio, and the preview compiler): all checks pass. Scripts are in tmp/ignored-move/.
- `npm run check-links` on the rebuilt site: 1,550 links, 0 broken.
- Not yet: the `M PI 0` path-argument message. That code is inside the phase 0a session's uncommitted step 1; it waits for that commit.
