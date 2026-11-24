<!--
  Data Imports (phase 3a; project-docs/modules/72-phase-3-design-round.md).
  JSON and text files imported by a name. CSV and `with { … }` hints come in
  3b, and the cast list in 3c; this page grows with them.
  Workspace behaviour (data files in the tree, the editor, uploads, limits):
  docs/workspace-files.md.
-->

# Data Imports

> **Prerequisites:** This page assumes you know how imports work ([Modules](#modules-importing)) and where a program finds its [project folder](#projects-the-project-folder).

A drawing often comes from data: a table of sizes, the places on a map, a profile measured by someone else. Keep the data in a file of its own, as it came, and import it by a name. The name holds the file's content, ready to use:

In `data/gears.json`:

```json
[
  { "name": "drive", "x": 55, "y": 50, "radius": 40, "teeth": 12 },
  { "name": "idler", "x": 150, "y": 50, "radius": 28, "teeth": 8 }
]
```

```pathogen
// main.pathogen
import gears from "./data/gears.json";

define ViewBox(0, 0, 200, 100);

for (gear in gears) {
  star(gear.x, gear.y, gear.radius, gear.radius - 6, gear.teeth);
  circle(gear.x, gear.y, gear.radius * 0.3);
}
```

Compiling `main.pathogen` draws a 12-tooth gear on the left and an 8-tooth gear on the right. To add a gear or change a size, edit the table: the program stays as it is.

**Know these before you start:**

- **A data file is imported by a name,** without braces: `import gears from "./data/gears.json";`. Braces and `* as` are for [modules](#modules-importing).
- **Its type comes from its extension:** JSON for `.json`, text for `.txt` ([below](#data-import-file-types)).
- **What you import is fixed.** You can't change the data; copy it first ([What you import is fixed](#data-import-what-you-import-is-fixed)).
- **The rules of every import hold:** imports come first; the path is written in full and follows [Writing paths](#projects-writing-paths); it can't leave the project folder; and the name can't be a [built-in name](#syntax-built-in-names) or one your file already declares.
- **Each data file is read once per compile,** however many files import it, and every importer sees the same value.
- **Data imports work wherever imports do:** in the CLI and VS Code, and in a saved playground workspace, which holds data files beside its programs ([Data files](#workspace-files-data-files)).

## File types

| Extension | Read as | The name holds |
|---|---|---|
| `.json`, `.geojson`, `.topojson`, `.fold` | JSON | the JSON value: an array, an object, a number, a string, `true`, `false` or `null` |
| `.txt` | text | the file's text as a string |

Any other extension is an error that lists these. A `.pathogen` file is a [module](#modules-importing): import its names with braces or `* as`.

## JSON

JSON values become Pathogen values as you'd expect:

| JSON | Pathogen |
|---|---|
| an object | an [object](#objects-object-literals), its keys in the order the file has them |
| an array | an [array](#syntax-arrays) |
| a number | a number |
| a string | a string |
| `true`, `false` | `true`, `false` |
| `null` | `null` |

- **Read a key** with a dot, `gear.radius`, or with brackets for a key that isn't a name or is a [keyword](#syntax-variables): `place["Population (2020)"]`, `label["text"]` ([Reading Properties](#objects-reading-properties)).
- **`length` always takes brackets.** On an object, `.length` is the number of keys, even when the file has a `length` key: write `beam["length"]`.
- **A key that isn't there reads as `null`,** as for any object. Check with [`.has()`](#objects-checking-key-existence) when a key is optional.
- **Numbers are plain numbers.** An angle stored in degrees and passed as it is reads as radians, with no warning. Give it its unit: `gear.angle * 1deg` ([Angle units](#syntax-angle-units)).
- **The file must be strict JSON,** as JavaScript's `JSON.parse` reads it: no comments and no commas after the last item. A key written twice keeps its last value.
- **GeoJSON, TopoJSON and FOLD** (origami crease patterns) are JSON, read the same way, and their coordinates come as the file has them. GeoJSON's are longitude and latitude in degrees, north up, so scale them to your ViewBox and flip y. TopoJSON keeps its shapes as shared arcs, often written as steps from the last point: the file reads fine, but drawing it takes a reader of your own.

## Text

A text file's name holds its text as a string. The file must be UTF-8; a byte-order mark at its start is dropped, and every line break becomes `\n`, so a file saved on Windows reads the same.

Strings have methods for reading text: [`.lines()`](#syntax-lines), [`.trim()`](#syntax-trim), [`.split(separator?)`](#syntax-splitseparator), [`.replace(find, replacement)`](#syntax-replacefind-replacement), [`.startsWith(prefix)` and `.endsWith(suffix)`](#syntax-startswithprefix-and-endswithsuffix), and [`.toNumber()`](#syntax-tonumber). With them, a module can read a format of its own: a GPX track, a weaving draft, an airfoil's coordinates.

In `data/profile.txt`, a title, then one point a line:

```text
Wing profile
0.00 0.00
0.25 0.06
0.50 0.08
0.75 0.05
1.00 0.00
```

```pathogen
// main.pathogen
import profile from "./data/profile.txt";

define ViewBox(0, 0, 200, 60);

let rows = profile.lines().map {|row| return row.trim().split(" "); };
let numbered = rows.filter {|parts| return parts[0].toNumber() != null; };
let points = numbered.map {|parts|
  return Point(10 + parts[0].toNumber() * 180, 50 - parts[1].toNumber() * 400);
};

M points[0].x points[0].y
for (point in points.slice(1)) {
  L point.x point.y
}
```

This draws the profile as a line, 180 units long, rising 32 units at its highest. `.toNumber()` gives `null` for text that isn't a number, so the filter skips the lines that don't start with one: the title here, and a blank line if the file had one.

To share a reader, put it in a [module](#modules-exporting) as an exported fn that takes the text: `export fn readProfile(source) { … }`. The module needn't import the file itself; the program passes in what it imported.

## What you import is fixed

Imported data is fixed, as a module's exports are ([Modules](#modules-what-you-import-is-fixed)), so every file that imports it sees the same values:

| You try | Result | Instead |
|---|---|---|
| `gears = [];` | error: an imported name can't be given a new value | declare your own: `let myGears = …` |
| `gears.push(row);` | error | copy it first: `let myGears = [...gears]; myGears.push(row);` |
| `gears[0]["teeth"] = 16;` | error | make a new object: `let bigger = { ...gears[0], teeth: 16 };` |

**Fixed goes all the way in.** The objects and arrays inside the data stay fixed wherever they go. `[...gears]`, `.filter`, `.slice` and `.sort` give a new array, which you can add to, but its items are still the file's objects, so `myGears[0]["teeth"] = 16` is an error too. To change the items, make new ones:

```pathogen
let myGears = gears.map {|gear| return { ...gear }; };
myGears[0]["teeth"] = 16;
```

`{ ...gear }` copies one level: an array inside each gear is still the file's, so copy it too if you change it. Values you work out from the data, such as `gears.map {|gear| return gear.radius * 2; }`, are new and yours.

## In the editor

In VS Code and the playground, the editor reads the data files a program imports:

- **Hover** an imported name to see what it holds: `gears` shows `data/gears.json · an array of 2 objects: name, x, y, radius, teeth`, and `profile` shows `data/profile.txt · text, 6 lines`.
- **Completion** offers an object's keys after a dot: after `gears[0].`, and after the name of a loop over the array, `gear.` in the example at the top. A key that needs brackets, such as `length` or `Population (2020)`, is offered in its bracket form.
- **A key no item has** is underlined with the nearest one: `data/gears.json has no key radus. Did you mean radius?`. A key that only some items have isn't: it may be optional.
- **Editing a data file** rechecks the files that import it, and redraws the preview, as editing a module does.

## In each tool

- **CLI.** `pathogen-lang main.pathogen` reads each data file from disk, starting at the file the import is written in, as for modules. A data file can be up to 50 MB; `--max-data-size=<MB>` raises that ([CLI](#cli-data-files)).
- **VS Code.** Data files work as in the CLI, up to 50 MB; the `pathogen.maxDataSize` setting raises that. Editing or saving a data file redraws the preview when its program is shown, and rechecks the open files that import it.
- **Playground.** A saved workspace holds data files beside its programs: uploaded, in the tree, and edited in the editor ([Data files](#workspace-files-data-files)). There, a data file can be up to 5 MB, and a workspace up to 50 MB and 20 files, data files included ([Limits](#workspace-files-limits)). An [unsaved scratch buffer](#projects-in-each-tool) has no files beside it, so an import there is an error.

## Errors

A mistake in a data file names the file and the line, and the import that read it, as an error in a module does ([Errors in other files](#modules-errors-in-other-files)):

```text
Error: data/gears.json line 3, col 3: expected , or ] after an array item
  imported from main.pathogen line 2
```

| Situation | Message |
|-----------|---------|
| JSON that isn't valid | `data/gears.json line 3, col 3: expected , or ] after an array item`, then `imported from main.pathogen line 2`. Each message says what was expected where the reading stopped |
| A text or JSON file that isn't UTF-8 | `import file "./data/profile.txt" isn't UTF-8 text, so it can't be read. Save it as UTF-8.` |
| No extension | `import path "./data/gears" has no extension. Write the file's full name, such as "./data/gears.json".` |
| An extension Pathogen doesn't read | `import path "./notes.md" isn't a file Pathogen can import. Imports read .pathogen modules, JSON (.json, .geojson, .topojson, .fold) and text (.txt).` |
| Braces or `* as` on a data file | `"./data/gears.json" is a data file: import it by a name, as import gears from "./data/gears.json";` |
| A name without braces on a module | `import gears from "./parts/gears.pathogen" isn't supported: Pathogen has no default export. Import its names: import { … } from "./parts/gears.pathogen"; or import * as gears from "./parts/gears.pathogen";` |
| Changing imported data | `Cannot change gears — it comes from data/gears.json, and imported values are fixed. Copy it first: [...gears]` |
| Changing an object inside it, even in a copied array | `Cannot change an object inside gears — it comes from data/gears.json, and imported values are fixed. Make new objects: gears.map {\|gear\| return { ...gear }; }` |
| A data file over the limit (CLI, VS Code) | `import file "./data/trips.json" is 82 MB, more than the 50 MB a data file can be. To read it anyway, pass --max-data-size=100 (in VS Code, the pathogen.maxDataSize setting).` |
| No such file, a folder, a different letter case, a path outside the project folder | as for a module: see [Modules](#modules-errors) |
