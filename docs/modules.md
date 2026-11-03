# Modules

> **Prerequisites:** This page assumes you know how to write [functions](#syntax-functions), [`const`](#syntax-const) and [enums](#syntax-user-defined-enums), and how a program finds its [project folder](#projects-the-project-folder).

As a program grows, it helps to split it into files. Modules let you keep the code you reach for again and again in a library file of its own, then use it from every program in your project. That code might be a fn that draws a gear, a table of standard sizes, or an enum of tooth counts. You write the library once and can test it on its own, and a fix or an improvement to it reaches every drawing that uses it.

A library offers its functions, constants and enums with `export`. A program brings in what it needs with `import`:

```pathogen
// parts/gears.pathogen
const toothDepth = 6;

export fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  circle(center.x, center.y, radius * 0.3);
}
```

```pathogen
// main.pathogen
import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);

gear(Point(55, 50), 40, 12);
gear(Point(150, 50), 28, 8);
```

Compiling `main.pathogen` draws two gears: a 12-tooth gear on the left and an 8-tooth gear on the right, each with a round hole in the middle.

Think of each file as a workshop with a counter. `export` puts something on the counter for other files to take; whatever the workshop builds at its own bench stays inside.

Imports work in the CLI and in VS Code, where files sit side by side on disk. A playground workspace is one program for now, so `import` is an error there; see [In each tool](#modules-in-each-tool).

**Know these before you start:**

- **An imported file runs on its own.** Whatever it draws, and its layers and ViewBox, stay in that file. Only the names it exports reach yours.
- **What you import is fixed.**
  - You can't give an imported name a new value.
  - You can't change an imported array, object or [Cycler](#stdlib-cycler). Copy it first (`[...sizes]`), or ask the file for a fn that makes a fresh one.
  - An exported fn can't change its own file's variables, or what's in them, once that file has loaded.
- **A library is shared within its project.** An import can't reach outside the [project folder](#projects-the-project-folder), so a library serves the programs in one project. To use it in another project, copy its file into that project.
- **Imports go first**, before any other statement in the file, `@font` and `define ViewBox` included.
- **Ids from other files get a prefix.** A mask, gradient, marker or filter made in `parts/arrows.pathogen` with the id `arrowhead` has the id `parts-arrows--arrowhead` in your SVG (its path from the project folder, then the id), so two files can both use `arrowhead`.

## Exporting

Put `export` in front of a top-level `const`, `fn` or `enum`:

```pathogen
// parts/gears.pathogen
export const toothDepth = 6;

export enum Teeth { Few = 8, Standard = 12, Fine = 20 }

export fn gear(center, radius, teeth) {
  star(center.x, center.y, radius, radius - toothDepth, teeth);
  hub(center, radius);
}

// Not exported: only this file can use it.
fn hub(center, radius) {
  circle(center.x, center.y, radius * 0.3);
}
```

- **Only `const`, `fn` and `enum`.** `export let` is an error. Imported values are fixed, so an exported variable could never change anyway.
- **Only at the top level.** `export` inside a function or block is an error.
- **A file with exports is still a program.** Compile it on its own and it draws what its top level draws. That makes it a good place for a demo of its parts:

  ```pathogen
  // parts/gears.pathogen, continued: a demo of every size
  define ViewBox(0, 0, 300, 100);
  gear(Point(50, 50), 30, Teeth.Few);
  gear(Point(150, 50), 30, Teeth.Standard);
  gear(Point(250, 50), 30, Teeth.Fine);
  ```

  When another file imports `parts/gears.pathogen`, this demo runs but isn't drawn into the importing file. Keep demos light. One runs every time a file that imports it compiles, its `log()` output and warnings show up there, and an error in it stops that compile.
- **`export` in the file you compile does nothing.** So you can write library-style code in the playground today, and move it into its own file later.
- **To pass on a name from another file**, import it under another name, or import its file with `* as`, and export it as a `const`:

  ```pathogen
  // parts/kit.pathogen
  import * as gears from "./gears.pathogen";

  export const gear = gears.gear;
  export const Teeth = gears.Teeth;
  ```

  Writing `import { gear }` and `export const gear` together won't work, because that declares `gear` twice.

## Importing

**Named imports** list the names you want, each by the name the file exports:

```pathogen
import { gear, Teeth } from "./parts/gears.pathogen";

gear(Point(55, 50), 40, Teeth.Standard);
```

`as` gives a name another name in your file:

```pathogen
import { gear as cog } from "./parts/gears.pathogen";

cog(Point(55, 50), 40, 12);
```

**A namespace import** brings every export in under one name. You reach each one with a dot:

```pathogen
import * as gears from "./parts/gears.pathogen";

gears.gear(Point(55, 50), 40, gears.Teeth.Standard);
log(gears.toothDepth);
```

The rules:

- **Imports come first.** They go before any other statement in the file, `@font` and `define` included; only comments may come before them.
- **The path is written in full**, `.pathogen` included, and follows the rules in [Writing paths](#projects-writing-paths):
  - `./` and `../` start at the file the import is written in, and `/` at the project folder;
  - forward slashes only, and the letter case must match the file on disk;
  - a path can't leave the project folder.
- **Only `.pathogen` files can be imported.** A path that doesn't start with `./`, `../` or `/` is an error, whether it's `"gears.pathogen"` or `"@studio/kit"`.
- **An imported name is a declaration**, like `let` or `const`. It can't be a [built-in name](#syntax-built-in-names): `import * as Color …` is an error, so pick another name. It also can't share a name with anything else declared at your file's top level.
- **Two files can't import each other**, directly or through other files. That's an import cycle, and the error names every file in it. Move what both files need into a third file that both import.
- **Braces or `* as` are required.** Pathogen has no default export, so `import gears from "./parts/gears.pathogen";` is an error. Import names with braces, or all of them with `* as`.

`from` means something only inside an import. Everywhere else it's an ordinary name: a gradient's `.from` property and `let from = bar.start;` keep working. `import` and `export` are [keywords](#syntax-variables), so they can't be names or object keys.

## An imported file runs on its own

When you compile `main.pathogen`, each file it imports runs first, in a space of its own: the workshop works at its own bench.

- **Everything at its top level runs.** That includes working out tables, defining fns and drawing its demo.
- **What it draws stays there.** The same goes for its layers and its ViewBox: none of them appear in your SVG.
- **Into your drawing come only its exports**, and what the exported values you use rely on: masks, gradients, markers and other defs, and the `@property` rule of a [CSSVar](#css-var-cssvar-type).
- **Its `log()` output and warnings reach you, labeled with its path from the project folder.** In the CLI, a log reads `[parts/gears.pathogen line 12] toothDepth = 6`, and a warning `parts/gears.pathogen:12:5: warning: …`.
- **Each file runs once per compile**, however many files import it.

## Imported fns draw with your pen

A fn on the counter is a tool: you use it at your own bench, with your own pen. An imported fn finds its names where it is written, and draws where it is called. This is the same rule as for fns within one file (see [Scoping](#syntax-scoping-where-a-function-finds-its-names)):

- **Names:** inside `gear`, the names `toothDepth` and `hub` mean the ones in `parts/gears.pathogen`, not anything in your file.
- **Drawing:** these all belong to the drawing that calls it:
  - the pen;
  - the current layer;
  - [`ctx`](#syntax-path-context-ctx);
  - [`viewbox`](#viewbox-reading-the-viewbox).

```pathogen
// main.pathogen
import { gear } from "./parts/gears.pathogen";

define ViewBox(0, 0, 200, 100);
define PathLayer('teeth') #{
  stroke: Color('#333');
  stroke-width: 1.5;
  fill: none;
}

layer('teeth').apply {
  gear(Point(55, 50), 40, 12);
  gear(Point(150, 50), 28, 8);
}
```

Both gears land in your `teeth` layer, with its stroke.

`viewbox` follows the call too, so a fn can place things relative to the drawing that calls it:

```pathogen
// parts/marks.pathogen
export fn centerMark(size) {
  let middleX = calc(viewbox.originX + viewbox.width / 2);
  let middleY = calc(viewbox.originY + viewbox.height / 2);
  M calc(middleX - size) middleY
  h calc(size * 2)
  M middleX calc(middleY - size)
  v calc(size * 2)
}
```

In `main.pathogen`, with its 200 × 100 ViewBox, `centerMark(10);` draws a cross at (100, 50), the middle of main's box. It doesn't use the box of a demo in `marks.pathogen`.

## What you import is fixed

Once a file has finished running, its exports can't change. This means a file behaves the same however many files import it, and in whatever order they run.

| You try | Result | Instead |
|---|---|---|
| `gear = 5;` | error: an imported name can't be given a new value | declare your own: `let myGear = …` |
| `sizes.push(9);` on an imported array | error | copy it first: `let mySizes = [...sizes]; mySizes.push(9);` |
| `style['width'] = 4;` on an imported object | error | `let myStyle = { ...style, width: 4 };` |
| `palette.pick()` on an imported Cycler | error: picking moves its position | export a fn that makes one: `export fn palette() { return Cycler([…]); }` |
| `.stop(…)`, `.set(…)`, `.append(…)`, or setting a property, on an imported gradient, grid, mask or other value | error | make your own, or export a fn that makes one |

**An exported fn can read its own file's top-level variables. Once that file has loaded, it can't give them new values or change the arrays and objects they hold:**

```pathogen
// ids.pathogen
let lastId = 0;

export fn nextId() {
  lastId = lastId + 1;
  return lastId;
}
```

```pathogen
// main.pathogen
import { nextId } from "./ids.pathogen";

log(nextId());
```

```text
Cannot assign to lastId — it belongs to ids.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter
```

Give the fn what it needs, and have it hand back the result:

```pathogen
// ids.pathogen
export fn nextId(lastId) {
  return lastId + 1;
}
```

Inside `ids.pathogen` itself, while the file is running, `nextId()` can still change `lastId` as usual.

**Values that belong to the imported file's drawing stay in that file.** These are a layer it defined, a transform, and a subscription.
- Exporting one is an error.
- So is using one that reaches you some other way, such as from an exported fn that returns it.

Export a fn that draws instead. It can even pick a layer by name when it runs:

```pathogen
// inks.pathogen
export fn inkLine(start, end) {
  layer('ink').apply {
    M start.x start.y
    L end.x end.y
  }
}
```

Called from your file, `inkLine` draws into *your* `ink` layer, because the drawing follows the call. What's an error is a layer value made while `inks.pathogen` loaded. [Path query](#path-queries-what-comes-back) results are copies of what was drawn, so you can read them.

## Ids from other files

Masks, clip paths, gradients, patterns, markers and filters each have an id in the SVG. An id made in an imported file gets that file's path from the project folder as a prefix: `/` becomes `-`, `.pathogen` is dropped, and `--` comes before the id. The prefix is the same whichever file imports it, so CSS or a script can rely on the id:

| Made in | Written as | Id in your SVG |
|---|---|---|
| `main.pathogen`, the file you compile | `Marker('arrowhead', …)` | `arrowhead` |
| `arrows.pathogen` | `Marker('arrowhead', …)` | `arrows--arrowhead` |
| `parts/arrows.pathogen` | `Marker('arrowhead', …)` | `parts-arrows--arrowhead` |

- **Your own ids are never changed.** Ids made in the file you compile stay exactly as written.
- **The prefix comes from the file the code is written in.** That holds even when an imported fn runs because your file called it.
- **Values carry their full id.** With an imported marker `tip`, `marker-end: tip;` just works.
- **Raw `url(#…)` strings don't cross files.** Inside `parts/arrows.pathogen`, `url(#arrowhead)` means that file's own arrowhead. In your file, use the imported value: a raw `url(#arrowhead)` that only matches another file's id is a warning that names the full id.
- **Only what's used reaches your SVG.** An imported file's defs and CSSVar registrations appear in your SVG only when your drawing uses them.
- **Escaping:** a file name with characters an id can't hold is escaped.
  - A leading digit gets a `_` in front: `2026-poster.pathogen` gives `_2026-poster--`.
  - Any other character besides letters, digits, `_` and `-` becomes `_` plus its Unicode code point in lowercase hex. A space gives `_20`, so `my gears.pathogen` gives `my_20gears--`; `é` gives `_e9`; and a folder named `v1.2` gives `v1_2e2`.
- **Clashes are errors.** If two files would get the same prefix, such as `parts-gears.pathogen` and `parts/gears.pathogen`, the compile stops; rename one of them. So does one of your own ids that matches an imported one when both reach your SVG: `Marker('arrows--tip', …)` in your file and `Marker('tip', …)` in `arrows.pathogen` would both be `arrows--tip`.
- **Noise seeds.** A `NoiseFilter()` made at its file's top level gets the same seed whether the file is compiled or imported, because the seed comes from the id before the prefix. One made inside an exported fn is numbered in the order your file calls it. Since the prefix isn't part of the seed, two files' first noise filters share a pattern; set [`seed`](#filters-seed-stability) to tell them apart.

## Fonts in imported files

An imported file's [`@font`](#path-blocks-font-directive) lines load as if they were in your file, and `./` paths in them start from the file they're written in.

Fonts are shared across every file in the compile by family and weight. If two files both write `@font "Inter";`, they use one font, and any file can use a family that another file loads. That cuts both ways: a library that relies on your file's `@font` works when imported but not when compiled on its own, so give each file the `@font` lines it needs.

Two files that load *different* fonts as the same family and weight are an error that names both. For example, `./a/Inter.ttf` in one file and `./b/Inter.ttf` in another are both family `Inter` at weight 400, since a font file's family is its file name.

## Errors in other files

An error that happens in another file names that file and its line. It then lists each call that led there from another file, back to your file. Say `gear` checks what it's given:

```pathogen
// parts/gears.pathogen
export fn gear(center, radius, teeth) {
  assert(teeth >= 3, 'a gear needs at least 3 teeth');
  star(center.x, center.y, radius, radius - 6, teeth);
}
```

```pathogen
// main.pathogen
import { gear } from "./parts/gears.pathogen";

gear(Point(55, 50), 40, 2);
```

```text
Error: parts/gears.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth
  called from main.pathogen line 4
```

If `gear` had handed the check to a fn in a third file, each file on the way would be listed:

```text
Error: parts/teeth.pathogen line 3, col 3: assertion failed: a gear needs at least 3 teeth
  called from parts/gears.pathogen line 3
  called from main.pathogen line 4
```

Calls within one file aren't listed.

A mistake in an imported file's own code, such as a missing `;`, names your import instead:

```text
Error: parts/gears.pathogen line 2, col 21: Missing ';'
  imported from main.pathogen line 2
```

Two imports deep, each import is listed in the same way: `imported from parts/gears.pathogen line 2`, then `imported from main.pathogen line 2`.

In VS Code, the error is shown on the call (or the import) in the file you're editing. The message there names the line in the other file, and if that file is open, the error shows at its own line too. Errors in the file you compile read exactly as before.

## In each tool

- **CLI.** `pathogen-lang main.pathogen` finds imported files from `main.pathogen`'s folder and its [project folder](#projects-in-each-tool).
  - Code passed with `-e` or on standard input imports from the current folder, or from the folder named by `--root`, the same way as `@font`.
  - With [`--json`](#cli-output-as-json) and [`--log-file`](#cli-write-structured-json), a warning or log from another file has a `file` field naming it.
- **VS Code.**
  - **Features across files:** errors, hover, go-to-definition, completion and parameter hints all work across files. Completion offers the exported names inside `import { }`, file paths inside the quotes, and a namespace's names after `gears.`.
  - **Rechecking:** editing or saving an imported file rechecks the open files that import it, and the preview redraws.
  - **The preview:** it shows the file you're editing, so opening `parts/gears.pathogen` shows its demo.
  - **Unsaved files:** an unsaved file can't import, because its paths have no folder to start from.
  - **Renaming and finding references:** F2 on an imported or exported name says it can't rename across files yet, instead of changing only some of its uses; rename it in each file. Find All References lists the uses in the current file only.
- **Playground.** A workspace is one program with no files beside it, so `import` is an error at the import line. `export` is allowed and does nothing.

## Errors

| Situation | Message |
|-----------|---------|
| No project folder (the playground) | `Cannot import "./parts/gears.pathogen": this program has no project folder to read files from. Imports work in the CLI and VS Code; a playground workspace is one program for now.` |
| An unsaved file in VS Code | `Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file's folder.` |
| A name instead of a path | `import "gears.pathogen" isn't a path. Paths start with ./, ../ or / — did you mean "./gears.pathogen"?` |
| A package name or web address | `import "@studio/kit": only files in the project folder can be imported. Paths start with ./, ../ or /.` |
| No `.pathogen` at the end | `import path "./parts/gears" has no .pathogen extension. Write the file's full name: "./parts/gears.pathogen".` |
| Another kind of file | `import path "./data/sizes.json" isn't a .pathogen file. Only .pathogen files can be imported.` |
| The path leaves the project folder | `import path "../../shared/gears.pathogen" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.` |
| The path uses `\` | `import path ".\parts\gears.pathogen" uses a backslash. Write paths with forward slashes on every system: "./parts/gears.pathogen".` |
| A drive letter or `~` | `import path "C:/parts/gears.pathogen" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).` |
| The letter case differs | `import file "./parts/Gears.pathogen" differs from the file on disk only in letter case: "./parts/gears.pathogen". Paths are case-sensitive on every system.` |
| No such file | `import file "./parts/gear.pathogen" was not found (looked for /Users/you/my-gears/parts/gear.pathogen).` A path starting with `/` adds: `A leading / means the project folder, not your computer's root.` |
| The path names a folder | `import path "./parts.pathogen" is a folder, not a file.` |
| The file can't be read | `import file "./parts/gears.pathogen" could not be read: …` followed by your system's reason |
| A file outside the `--root` folder has an import (CLI) | `poster.pathogen is outside the project folder /Users/you/my-gears given by --root, so its import paths can't be followed.` |
| An import cycle | `Import cycle: main.pathogen → parts/a.pathogen → main.pathogen. Move what both files need into a third file that both import.` |
| The imported file has an error | that file's error, as in [Errors in other files](#modules-errors-in-other-files): `parts/gears.pathogen line 2, col 21: Missing ';'`, then `imported from main.pathogen line 2` on the next line |
| A name the file doesn't export | `parts/gears.pathogen has no export named gera. It exports: gear, Teeth, toothDepth.` |
| A name the file declares but doesn't export | `parts/gears.pathogen declares hub but doesn't export it. Put export in front of its declaration in parts/gears.pathogen.` |
| A namespace has no such name | `gears has no export named gera. parts/gears.pathogen exports: gear, Teeth, toothDepth.` |
| An import after other statements | `import must come before the file's other statements, @font and define included. Only comments may come first.` |
| `import` or `export` inside a function or block | `import must be at the top level of the file, not inside a function or block.` (`export` reads the same way) |
| `export let` | `export let isn't allowed: an imported file's variables are fixed once it has loaded. Use export const.` |
| `export` before anything else | `export goes in front of a const, fn or enum declaration.` |
| An import with no path yet, such as `import { gear` while you type | `Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";` |
| An import without braces or `* as` | `import gears from "./parts/gears.pathogen" would import the file's drawing, which isn't supported. Import its names: import { … } from "./parts/gears.pathogen"; or import * as gears from "./parts/gears.pathogen";` |
| A built-in's name | `Cannot use Color as a name — it is a built-in constructor. Use another name` (see [Built-in names](#syntax-built-in-names)) |
| A name imported twice | `Cannot import gear again — it is already imported on line 1. Import one of them under another name: { gear as … }` (for `* as gears`, the end reads `* as …`) |
| A later declaration of an imported name | `Cannot declare gear again — it is imported on line 1. Use another name` |
| Giving an imported name a new value | `Cannot assign to gear — it is imported from parts/gears.pathogen. Declare your own with let if it needs to change` |
| Changing an imported array | `Cannot change sizes — it comes from parts/sizes.pathogen, and imported values are fixed. Copy it first: [...sizes]` |
| Changing an imported object | `Cannot change style — it comes from parts/style.pathogen, and imported values are fixed. Copy it first: { ...style }` |
| Picking from an imported Cycler | `Cannot pick from palette — it comes from colors.pathogen, and imported values are fixed. Export a fn that makes one instead: export fn palette() { return Cycler([…]); }` |
| An exported fn changing its file's variable | `Cannot assign to lastId — it belongs to ids.pathogen, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter` |
| An exported fn changing an array or object its file holds | `Cannot change seen — it belongs to names.pathogen, whose values are fixed once it has loaded. Return a new array instead` (for an object, `Return a new object instead`) |
| Changing an imported gradient, grid, mask or other value | `Cannot change sky — it comes from parts/shades.pathogen, and imported values are fixed. Make your own, or export a fn that makes one` |
| Exporting a layer, transform or subscription | `Cannot export ink — it is a layer of this file's drawing, which stays in this file. Export a fn that draws instead`. For a transform, the middle reads `it is a transform of this file's drawing`; for a subscription, `it is a subscription to this file's drawing` |
| Using another file's layer, transform or subscription | `Cannot use ink — it is a layer of inks.pathogen's drawing, which stays in that file. Export a fn that draws, and call it inside your own layer`. For a transform, the middle reads `it is a transform of inks.pathogen's drawing`; for a subscription, `it is a subscription to inks.pathogen's drawing` |
| Two files with the same id prefix | `parts-gears.pathogen and parts/gears.pathogen would both give their ids the prefix parts-gears--. Rename one of the files.` |
| One of your ids matches an imported one | `Duplicate defs ID 'arrows--tip': made in main.pathogen line 4, and as 'tip' in arrows.pathogen line 2. Rename one of them.` |
| A raw `url(#…)` that only matches another file's id (a warning) | `url(#arrowhead) matches no id in this file. The arrowhead made in parts/arrows.pathogen is parts-arrows--arrowhead in your SVG; use the imported value instead.` |
| Two files load different fonts as one family and weight | `Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./b/Inter.ttf (parts/labels.pathogen). Use the same font in both files.` |
