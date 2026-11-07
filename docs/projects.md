# Projects and Files

A Pathogen program can read two kinds of files from your computer: font files named by [`@font`](#path-blocks-font-directive), and other `.pathogen` files named by [`import`](#modules-importing). This page covers where those files may live and how you write their paths. The rules are the same in the CLI and the VS Code preview. The playground can't read files yet — see [In each tool](#projects-in-each-tool).

> **What changed (November 2026):** `pathogen.json`'s `main` key is now `entryPoints`, a list whose first entry is the main: `{ "main": "poster.pathogen" }` becomes `{ "entryPoints": ["poster.pathogen"] }`. A `pathogen.json` that still has `main` gets an error showing the new form, in the CLI and in VS Code. Until you change it, it stops every file in the project that uses `@font` or `import`, and folder compiles. A folder whose `pathogen.json` has no `entryPoints` now compiles its `main.pathogen`; it used to stop with an error. See [pathogen.json](#projects-pathogenjson).

> **What changed (October 2026):**
> - A path that starts with `/` used to mean your computer's root folder in the CLI (`@font "/System/Library/Fonts/Supplemental/Georgia.ttf"`). It now means the project folder. For a font installed on your computer, write its family name instead — `@font "Georgia";` — and the CLI looks for it in the system font folders.
> - Paths must now start with `./`, `../` or `/`. `@font "Inter.ttf"`, `@font "fonts/Inter.ttf"`, backslashes and drive letters (`C:\…`) used to be accepted and are now errors, each with the fix spelled out.
> - Paths can no longer climb out of the project folder. A program that reached a shared font folder with `@font "../../fonts/Inter.ttf";` now gets an error. Copy the font into the project folder, or move the project's `pathogen.json` (or add one, if it has none) to a folder that contains both the program and the fonts. That folder can't be your home folder itself, where a `pathogen.json` is never read; in the CLI, `--root=<folder>` names any folder, for one run. See [The project folder](#projects-the-project-folder).
> - A font that can't be loaded now stops the compile with an error; it used to be a warning. And the CLI now downloads a missing family from Google Fonts — see [Fonts and Files](#cli-fonts-and-files) for turning that off, for example in CI with `PATHOGEN_OFFLINE=1`.

## The project folder

Every program runs inside a **project folder**. Think of it as a fence: paths in the program can reach any file inside the fence, and nothing outside it.

The project folder is the nearest folder with a `pathogen.json`, from the file's own folder upward, stopping before your home folder. If none has one, the project folder is the folder of the file you compile. Your home folder itself is never checked, so a stray `pathogen.json` there doesn't turn everything you own into one project.

```text
my-gears/
  pathogen.json
  main.pathogen        ← project folder: my-gears/
  fonts/
    Baumans-Regular.ttf
  parts/
    rack.pathogen      ← project folder: my-gears/ (found by going up)
```

The fence is there for safety as much as tidiness. A `.pathogen` file you download can't reach outside its project: `@font "../../.ssh/id_rsa";` is an error before anything is read, and so is an `import` of a file outside it.

## pathogen.json

An empty object marks the folder as a project:

```json
{}
```

It can also list the project's programs, in order:

```json
{
  "entryPoints": [
    "poster.pathogen",
    "main.pathogen",
    "demos/gears.pathogen"
  ]
}
```

The first entry is the project's **main**: the program `pathogen-lang <folder>` compiles. Without `entryPoints`, the main is `main.pathogen`, so `{}` and `{ "entryPoints": ["main.pathogen"] }` mean the same thing. Only the first entry is used today. Listing the others is optional; it records the order of the project's programs.

| Key | Meaning |
|-----|---------|
| `entryPoints` | The project's programs, the main first, as paths relative to the folder holding `pathogen.json`. `main.pathogen`, `./main.pathogen` and `/main.pathogen` all work and mean the same file. Each must end in `.pathogen`, use forward slashes, match the file's letter case, and stay inside the project folder. |
| `$schema` | Ignored, so an editor's schema hint doesn't cause an error. |

List programs only. A [module](#modules-exporting), a file that starts with `module;`, doesn't draw, so it can't be an entry point. A program you don't list still compiles when you name its file: `pathogen-lang my-gears/try-sizes.pathogen` works whatever `entryPoints` says.

`entryPoints` is checked in two ways:

- **Whenever `pathogen.json` is read:** `entryPoints` must be a list of paths inside the project folder, ending in `.pathogen` and written with forward slashes. Every tool that reads `pathogen.json` checks this, so a mistake here stops the files that use `@font` or `import` (see [In each tool](#projects-in-each-tool)).
- **When the list is used:** it can't be empty or name a path twice (`main.pathogen`, `./main.pathogen` and `/main.pathogen` count as the same path), and the main must exist, with its letter case matching, and be a program. Today only the CLI uses the list, when you give it a folder, so a mistake here never stops a file you compile by name.

Any other key is an error, so a typo such as `"entrypoints"` doesn't go unnoticed. More keys will arrive with later features; an older `pathogen-lang` reports a newer key as unknown, so update it if that happens.

## Writing paths

A path in a program starts with `./`, `../` or `/`:

| Path | Relative to | Example |
|------|-------------|---------|
| `./…` | the folder of the file the path is written in | `import { rack } from "./parts/rack.pathogen";` (in `main.pathogen`) |
| `../…` | one folder up from there | `@font "../fonts/Baumans-Regular.ttf";` (in `parts/rack.pathogen`) |
| `/…` | the project folder | `@font "/fonts/Baumans-Regular.ttf";` |

Anything else is a name, not a path — for `@font`, a font family such as `"Inter"`. An `import` takes only paths; see [Importing](#modules-importing).

Four rules hold on every operating system:

- **Forward slashes only.** `\` is an error, even on Windows, so a program written on one system works on another.
- **No climbing out — not even for a step.** A path can't leave the project folder, even if it comes straight back in: from `my-gears/main.pathogen`, `../my-gears/fonts/a.ttf` is an error. A symbolic link that leads outside the project folder, or passes through a folder outside it on the way back in, counts as leaving it, whether or not anything is there. The error names the project folder; move the file inside it, or move the project's `pathogen.json` (or add one) to a folder that contains both the program and the file, other than your home folder itself.
- **Letter case must match.** `"./fonts/baumans-regular.ttf"` doesn't find `fonts/Baumans-Regular.ttf`, even on macOS and Windows, whose file systems would otherwise ignore the difference. A program that compiles on your Mac then also compiles on Linux.
- **No computer paths.** `/Users/…`, `~/…` and `C:\…` don't work: a leading `/` means the project folder, and the others aren't paths at all.

## In each tool

- **CLI.** The project folder depends on what you compile; see the table below.
- **VS Code.** The preview and the editor's error checking find the project folder from the file you're editing, as above. The preview shows the file you're editing, not the main. A `pathogen.json` with an error stops the files in its project that use `import` or `@font`, with the same message as the CLI.
- **Playground.** A workspace is one program for now, with no files beside it, so there is nothing to read. A file path in `@font` produces a warning that suggests a Google Fonts family instead, and an `import` is an error.

In the CLI:

| You compile | Project folder | `./` paths start in |
|-------------|----------------|---------------------|
| A file: `pathogen-lang poster/main.pathogen` | Found from the file, as above | The file's folder |
| A folder: `pathogen-lang poster` | `poster/`. The CLI compiles its main: the first entry in its `pathogen.json`'s `entryPoints`, or `main.pathogen` | The main's folder |
| A file, with `--root=<folder>` | The folder you name | The file's folder |
| Code from `-e` or standard input | The current folder; there's no `pathogen.json` search | The current folder |
| Code from `-e` or standard input, with `--root=<folder>` | The folder you name | The current folder if it's inside the project folder, otherwise the project folder |

A file outside the `--root` folder still compiles, but a file path in its `@font` or `import` is an error, because it has no place in the project to start from. A family name's [`fonts/` folder](#path-blocks-font-loading-by-environment) is looked for starting where `./` paths start. The CLI reads `pathogen.json` only when it needs it, for a folder's main or to find the project folder of a program with `@font` or `import`, so a broken one doesn't stop a program with neither. See also [the CLI reference](#cli-fonts-and-files).

## Errors

These are the messages for `@font`. A path in an `import` gets matching messages for the path rules, starting with `import path` or `import file`; [Modules](#modules-errors) lists them all.

| Situation | Message |
|-----------|---------|
| The path leaves the project folder | `@font path "../../outside.ttf" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.` |
| The path uses `\` | `@font path ".\fonts\a.ttf" uses a backslash. Write paths with forward slashes on every system: "./fonts/a.ttf".` |
| A drive letter or `~` | `@font path "C:/Fonts/arial.ttf" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).` |
| A web address | `@font "https://example.com/a.ttf" is a web address. @font takes a font family name or a file path inside the project folder.` |
| A name that looks like a file | `@font "Inter.ttf" looks like a file name but isn't a path. File paths start with ./, ../ or / — did you mean "./Inter.ttf"?` |
| The letter case differs | `@font file "./fonts/baumans-regular.ttf" differs from the file on disk only in letter case: "./fonts/Baumans-Regular.ttf". Paths are case-sensitive on every system.` |
| No such file | `@font file "./fonts/Missing.ttf" was not found (looked for /Users/you/my-gears/fonts/Missing.ttf).` A path starting with `/` adds: `A leading / means the project folder, not your computer's root.` |
| The path names a folder | `@font path "./fonts" is a folder, not a font file.` |
| The file, or a folder on its path, can't be read | `@font file "./fonts/a.ttf" could not be read: …` followed by your system's reason, such as a permissions error |
| The file isn't a font | `@font file "./notes.txt" is not a font file: expected TrueType (.ttf), OpenType (.otf), WOFF or WOFF2 data.` |
| A font collection | `@font file "./fonts/All.ttc" is a font collection (.ttc), which isn't supported. Use a single .ttf or .otf file.` |
| The file is cut short or damaged | `@font file "./fonts/a.ttf" is damaged or incomplete: its tables run past the end of the file.` |
| A WOFF2 file that won't decode | `@font file "./fonts/a.woff2" is a damaged WOFF2 file: …` followed by the decoder's reason |
| `@font` inside a function or block | `@font must be at the top level of the program, not inside a function or block.` |
| A file outside the `--root` folder has a font path (CLI) | `poster.pathogen is outside the project folder /Users/you/my-gears given by --root, so its @font paths can't be followed.` An `import` gets the same message ending `so its import paths can't be followed.` |
| `pathogen.json` is a folder | `pathogen.json (/Users/you/my-gears) is a folder, not a file.` |
| `pathogen.json` can't be read | `pathogen.json (/Users/you/my-gears) could not be read: …` followed by your system's reason |
| `pathogen.json` isn't valid JSON | `pathogen.json (/Users/you/my-gears) is not valid JSON: …` followed by the JSON parser's own explanation, whose wording depends on your Node.js version |
| `pathogen.json` isn't an object | `pathogen.json (/Users/you/my-gears) must contain a JSON object, such as {} or { "entryPoints": ["main.pathogen"] }.` |
| An unknown key | `pathogen.json (/Users/you/my-gears) has an unknown key "entrypoints". Did you mean "entryPoints"?` That's for a key that differs from a known one only in letter case. Any other unknown key ends `Known keys: entryPoints.` |
| The old `main` key | `pathogen.json (/Users/you/my-gears): "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["poster.pathogen"].` The list shows your own `main`, when it's a path ending in `.pathogen`. With `entryPoints` there too: `pathogen.json (/Users/you/my-gears): "main" is no longer a key; remove it. The first entry in "entryPoints" is the main.` |
| `entryPoints` isn't a list | `pathogen.json (/Users/you/my-gears): "entryPoints" must be a list of paths, such as ["poster.pathogen"].` The example shows your own value in a list, when it's a path ending in `.pathogen`. |
| An entry without `.pathogen` | `pathogen.json (/Users/you/my-gears): "entryPoints" entry 1, "poster", has no .pathogen extension. Write the file's full name: "poster.pathogen".` |
| `entryPoints` is empty | `pathogen.json (/Users/you/my-gears): "entryPoints" is empty. List at least one program, or leave the key out to use main.pathogen.` |
| A bad entry | `pathogen.json (/Users/you/my-gears): "entryPoints" entry 2, "C:/art/poster.pathogen", must be a path inside the project folder, written with forward slashes, such as "main.pathogen".` |
| The same path twice | `pathogen.json (/Users/you/my-gears): "entryPoints" lists the same file twice: entry 1, "main.pathogen", and entry 3, "./main.pathogen".` |
| A folder with no `pathogen.json` | `my-gears is a folder with no pathogen.json. Add one (an empty {} compiles main.pathogen), or compile a file directly.` |
| The main doesn't exist | `The main of my-gears, poster.pathogen, doesn't exist (looked for /Users/you/my-gears/poster.pathogen). pathogen.json lists it first in "entryPoints": add the file, or put another program first.` Without `entryPoints`: `The main of my-gears, main.pathogen, doesn't exist (looked for /Users/you/my-gears/main.pathogen). Add it, list your program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.` |
| The main is reached through a symbolic link that leads outside the project folder | `The main of my-gears, poster.pathogen, leaves the project folder (/Users/you/my-gears) through a symbolic link. Move the file into the project folder.` |
| The main's letter case differs | `The main of my-gears, Poster.pathogen, differs from the file on disk only in letter case: poster.pathogen. Paths are case-sensitive on every system.` |
| The main is a module | `The main of my-gears, parts/gears.pathogen, is a module (it starts with module;), and a module doesn't draw. Take out module;, or put a program first in pathogen.json's "entryPoints".` Without `entryPoints`: `The main of my-gears, main.pathogen, is a module (it starts with module;), and a module doesn't draw. Take out module;, list a program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.` |
