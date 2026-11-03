# Projects and Files

A Pathogen program can read two kinds of files from your computer: font files named by [`@font`](#path-blocks-font-directive), and other `.pathogen` files named by [`import`](#modules-importing). This page covers where those files may live and how you write their paths. The rules are the same in the CLI and the VS Code preview. The playground can't read files yet — see [In each tool](#projects-in-each-tool).

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

It can also name the program to compile when you give the CLI the folder instead of a file:

```json
{
  "main": "main.pathogen"
}
```

| Key | Meaning |
|-----|---------|
| `main` | The program `pathogen-lang <folder>` compiles, relative to the folder holding `pathogen.json`. `main.pathogen` and `./main.pathogen` both work; it must use forward slashes and stay inside the project folder. |
| `$schema` | Ignored, so an editor's schema hint doesn't cause an error. |

Any other key is an error, so a typo such as `"mian"` doesn't go unnoticed. More keys will arrive with later features; an older `pathogen-lang` reports a newer key as unknown, so update it if that happens.

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
- **VS Code.** The preview and the editor's error checking find the project folder from the file you're editing, as above.
- **Playground.** A workspace is one program for now, with no files beside it, so there is nothing to read. A file path in `@font` produces a warning that suggests a Google Fonts family instead, and an `import` is an error.

In the CLI:

| You compile | Project folder | `./` paths start in |
|-------------|----------------|---------------------|
| A file: `pathogen-lang poster/main.pathogen` | Found from the file, as above | The file's folder |
| A folder: `pathogen-lang poster` | `poster/`, whose `pathogen.json` names the `main` to compile | The `main` file's folder |
| A file, with `--root=<folder>` | The folder you name | The file's folder |
| Code from `-e` or standard input | The current folder; there's no `pathogen.json` search | The current folder |
| Code from `-e` or standard input, with `--root=<folder>` | The folder you name | The current folder if it's inside the project folder, otherwise the project folder |

A file outside the `--root` folder still compiles, but a file path in its `@font` or `import` is an error, because it has no place in the project to start from. A family name's [`fonts/` folder](#path-blocks-font-loading-by-environment) is looked for starting where `./` paths start. The CLI reads `pathogen.json` only when it needs it, for a folder's `main` or to find the project folder of a program with `@font` or `import`, so a broken one doesn't stop a program with neither. See also [the CLI reference](#cli-fonts-and-files).

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
| `pathogen.json` isn't an object | `pathogen.json (/Users/you/my-gears) must contain a JSON object, such as {} or { "main": "main.pathogen" }.` |
| An unknown key | `pathogen.json (/Users/you/my-gears) has an unknown key "mian". Known keys: main.` |
| A bad `main` | `pathogen.json (/Users/you/my-gears): "main" must be a path inside the project folder, written with forward slashes, such as "main.pathogen".` |
| A folder with no `main` | `my-gears/pathogen.json has no "main". Add "main": "your-program.pathogen", or compile a file directly.` |
| A folder with no `pathogen.json` | `my-gears is a folder with no pathogen.json. Add one with "main", or compile a file directly.` |
| `main` names a missing file | `my-gears/pathogen.json names "main": "/main.pathogen", which doesn't exist.` |
