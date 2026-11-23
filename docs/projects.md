# Projects and Files

A Pathogen program can read two kinds of files from its project: font files named by [`@font`](#path-blocks-font-directive), and other `.pathogen` files named by [`import`](#modules-importing). This page covers where those files may live and how you write their paths. The rules are the same in the CLI, the VS Code preview and a playground workspace, which holds `.pathogen` files but no font files yet — see [In each tool](#projects-in-each-tool).

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

The first entry is the project's **main**: the program `pathogen-lang <folder>` compiles. Without `entryPoints`, the main is `main.pathogen`, so `{}` and `{ "entryPoints": ["main.pathogen"] }` name the same main. (The VS Code preview treats a `{}` with no `main.pathogen` beside it as a project without a main: see [The preview in VS Code](#projects-the-preview-in-vs-code).) Only the first entry is used today. Listing the others is optional; it records the order of the project's programs.

| Key | Meaning |
|-----|---------|
| `entryPoints` | The project's programs, the main first, as paths relative to the folder holding `pathogen.json`. `main.pathogen`, `./main.pathogen` and `/main.pathogen` all work and mean the same file. Each must end in `.pathogen`, use forward slashes, match the file's letter case, and stay inside the project folder. |
| `$schema` | Ignored, so an editor's schema hint doesn't cause an error. |

List programs only. A [module](#modules-exporting), a file that starts with `module;`, doesn't draw, so it can't be an entry point. A program you don't list still compiles when you name its file: `pathogen-lang my-gears/try-sizes.pathogen` works whatever `entryPoints` says.

`entryPoints` is checked in two ways:

- **Whenever `pathogen.json` is read:** `entryPoints` must be a list of paths inside the project folder, ending in `.pathogen` and written with forward slashes. Every tool that reads `pathogen.json` checks this, so a mistake here stops the files that use `@font` or `import` (see [In each tool](#projects-in-each-tool)).
- **When the list is used:** it can't be empty or name a path twice (`main.pathogen`, `./main.pathogen` and `/main.pathogen` count as the same path), and the main must exist, with its letter case matching, and be a program. The CLI uses the list when you give it a folder, so a mistake here never stops a file you compile by name. A playground workspace writes its own list as you add programs and set the main ([Files in a Workspace](#workspace-files-pathogenjson)).

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
- **VS Code.** The preview and the editor's error checking find the project folder from the file you're editing, as above. In a project with a main, the preview stays on the program you choose while you move between the project's files, as in the playground; without one, it shows the file you're editing ([The preview in VS Code](#projects-the-preview-in-vs-code)). A `pathogen.json` with an error stops the files in its project that use `import` or `@font`, with the same message as the CLI.
- **Playground.** A workspace is a project folder: `/` paths start at its top, and it writes its own `pathogen.json` ([Files in a Workspace](#workspace-files-files-in-a-workspace)). The preview shows the program you choose with its chip (the main at first), whichever file you're editing ([The preview and the program list](#workspace-files-the-preview-and-the-program-list)). A workspace holds `.pathogen` files only for now, so a file path in `@font` produces a warning that suggests a Google Fonts family instead. **Download workspace** takes a workspace out as a project folder that the CLI and VS Code open ([Downloading a workspace](#workspace-files-downloading-a-workspace)), and a project folder, or a `.zip` of one, can become a new workspace ([A workspace from a project](#workspace-files-a-workspace-from-a-project)).
  - **An unsaved scratch buffer** is code opened from a link, such as a blog example's playground link, and not yet saved as a workspace. It holds one program with no files beside it, so an `import` there is an error. To use imports, copy its code into a new workspace (**+ New Workspace** on your Workspaces page).

In the CLI:

| You compile | Project folder | `./` paths start in |
|-------------|----------------|---------------------|
| A file: `pathogen-lang poster/main.pathogen` | Found from the file, as above | The file's folder |
| A folder: `pathogen-lang poster` | `poster/`. The CLI compiles its main: the first entry in its `pathogen.json`'s `entryPoints`, or `main.pathogen` | The main's folder |
| A file, with `--root=<folder>` | The folder you name | The file's folder |
| Code from `-e` or standard input | The current folder; there's no `pathogen.json` search | The current folder |
| Code from `-e` or standard input, with `--root=<folder>` | The folder you name | The current folder if it's inside the project folder, otherwise the project folder |

A file outside the `--root` folder still compiles, but a file path in its `@font` or `import` is an error, because it has no place in the project to start from. A family name's [`fonts/` folder](#path-blocks-font-loading-by-environment) is looked for starting where `./` paths start. The CLI reads `pathogen.json` only when it needs it, for a folder's main or to find the project folder of a program with `@font` or `import`, so a broken one doesn't stop a program with neither. See also [the CLI reference](#cli-fonts-and-files).

## The preview in VS Code

The preview button at the top right of a `.pathogen` file's tab (**Pathogen: Open Preview to the Side** in the Command Palette) opens the preview beside it. The panel's title names the program it shows, such as `Preview poster.pathogen`.

**A project with a main** has a `pathogen.json` with `entryPoints`, or a `main.pathogen` beside its `pathogen.json`. In such a project, the preview works like this:

- **The preview button chooses what's shown.** From a program's tab, it shows that program. From a module's tab, it shows the program chosen in that project, the main at first.
- **The preview stays on that program** while you move between the project's files. When you edit a file the program imports, saved or not, the preview redraws, so you can change a module and watch a program that uses it. A file in another project shows that project's chosen program, its main at first, and a file without a main shows itself (below).
- **The chip** beside the zoom controls names the program shown, when the list has more than one program. Click it for the **program list**: the main, then the other programs in `entryPoints`' order, each with a small drawing, its name and its path. A check marks the one shown; choose another to show it.
  - A program that `pathogen.json` doesn't list joins the end of the list while you're editing it or it's the one shown, marked "not in pathogen.json".
  - While you edit a file that isn't the program shown, a dot marks each program that uses it, and the file itself if it's a program.
  - When a program is too detailed for its small drawing, the drawing is left empty. Hover it to see "Too detailed to draw this small".
  - When another program has an error, the chip shows a red dot, and that program's row says where it failed.
  - Hover a program and click **Open in the editor** to open its file without changing the preview.
- **If the program shown is deleted, or becomes a module,** the preview goes back to the main. If you rename or move it in VS Code, the preview follows it; renamed or moved outside VS Code, it counts as deleted.
- **If the main can't be shown,** such as when it doesn't exist or is a module, the preview says why with the CLI's message ([Errors](#projects-errors)). The main's row in the list says "Not found", or "A module now, so it can't draw as the main". You can still choose another program.
- The program you choose lasts while the preview is open. The next preview starts from the tab you open it from.

The playground's preview works the same way: see [The preview and the program list](#workspace-files-the-preview-and-the-program-list).

**Without a main,** the preview shows the file you're editing. That's a file with no `pathogen.json` in its folder or above, or one whose `pathogen.json` has no `entryPoints` and no `main.pathogen` beside it, such as a `{}` that only marks the project folder. A module's preview is empty there; to see its fns draw, open a program that imports it. The same goes while a `pathogen.json` has an error, which shows at the file's first `import` or `@font` ([In each tool](#projects-in-each-tool)).

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
