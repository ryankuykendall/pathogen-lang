<!--
NOT PUBLISHED YET, on purpose: this page is not in scripts/build-docs.ts DOC_FILES. Registering it
('workspace-files.md': 'workspaceFiles') publishes it; that happens in the push that ships the
multi-file UI, which waits until step 2e is done (decided 2026-11-07, note 48), so publishing, forks
and snapshots carry every file from the first day. 2h's Copy Debug Info lands with 2d (note 42).
The page then needs sections for those, and this comment comes out. Export as a project folder (2g) comes later: see "Not yet".
Copy Code: which file it copies is decided in 2d.
On publishing, update in the same push: docs/projects.md line 3 ("The playground can't read files
yet"), its In each tool Playground bullet ("one program for now") with a link to this page, and the
program-list sentence held back in note 46; docs/modules.md's intro line "A playground workspace is
one program for now", its In each tool Playground bullet, and its Errors row "No project folder
(the playground)".
Sources: mockups v1 to v6 and their reviews (project-docs/modules/39- to 46-).
Marked [TO CONFIRM] in note 46: undo per file, clicking an error to open its file. Limits and name
characters: decided in note 50.
-->

# Files in a Workspace

> **Prerequisites:** This page assumes you know what `import`, `export` and `module;` do ([Modules](#modules-importing)), and what a project folder and its `pathogen.json` are ([Projects and Files](#projects-the-project-folder)).

A workspace can hold several files: programs that draw, and libraries they import. It works like a project folder in the CLI or VS Code, with the same `import` paths and the same `pathogen.json`, so a workspace and a folder on your computer have the same shape.

> **Not yet:** a workspace can't be downloaded as a project folder, or made from one; that comes in a later update. [TO DECIDE, note 41 #4: which program SVG, PNG and PDF export use.] [TO CONFIRM, note 38 Q12: share links (Copy URL) hold one file, so they're offered only for a workspace that is just `main.pathogen`.]

> **What changed ([month] 2026):** A workspace you made before now holds one program, `main.pathogen`, with its code unchanged, and a `pathogen.json` beside it. It draws as before. [If the page publishes with 2e: Older snapshots restore the same way.]

## A new workspace

A new workspace holds one program, `main.pathogen`, and `pathogen.json`, a project file the playground writes for you ([below](#workspace-files-pathogenjson)). With one program, the preview shows it, as before.

## The file tree and tabs

- **Files**, beside Console in the breadcrumb, shows or hides the tree. Folders come first, then files.
- The tree shows each file's full name. Programs and libraries have different icons.
- Click a file to open it in a tab. Tab labels leave out `.pathogen`. When two open files share a name, each tab adds its folder: `gears · parts` and `gears · demos`.
- The breadcrumb names the open file with its folder: `parts/gears.pathogen`.
- Each file keeps its own undo history while the workspace is open. [TO CONFIRM, note 46: undo per file.]

## Programs and libraries

- A file that starts with `module;` is a **library**, which [Modules](#modules-exporting) also calls a module. It holds fns, consts and enums for other files to import, and it never draws.
- Every other file is a **program**. Any program can be shown in the preview.

## The main

The workspace's **main** is the program it opens on and the one its thumbnail shows. It's `main.pathogen` unless you choose another.

- **Set as main**, in a program's menu in the tree, makes it the main. A main that isn't `main.pathogen` has a `main` badge in the tree and in the program list (the chip's list, [below](#workspace-files-the-preview-and-the-program-list)).
- Setting the main doesn't change what the preview shows.
- Renaming the main keeps it the main.
- **Deleting the main** makes the next program in `pathogen.json`'s list the main, and a message says which. After a Set as main, that's the program that was the main before.
- **Deleting the last program** leaves the workspace with no main. The preview is empty and says to add a program, and `pathogen.json` becomes `{}`.
- **Adding `module;` to the main** makes it a library, which can't draw. It stays the main, and the program list shows an error on it, until you take `module;` out or set another program as main. Adding `module;` to any other program takes it out of the program list and out of `pathogen.json`. Take `module;` out again and it goes back, at the end.

## The preview and the program list

With more than one program, a chip beside the zoom controls names the program the preview shows. Click it for the **program list**: each program with a small drawing, its name and its path. A check marks the one shown. The main comes first, then the others in the order they were added.

- **Only the chip changes what the preview shows.** Opening a file, editing a library or setting the main leaves the preview on the program you chose.
- Editing a file redraws every program that uses it. In the list, a dot marks the programs that use the file you're editing.
- Hover a program in the list and click **Open in the editor** to open its file without changing the preview.
- When another program has an error, the chip shows a red dot, and that program says in the list where it failed.
- If the program shown is deleted, the preview goes back to the main.

## Adding files and folders

The **+** in the Files header opens a menu: New program, New library, New folder, Upload files… and Upload folder…. Its first line says where new files go: the folder of the file you're editing, the folder you selected, or the top of the workspace. A folder's own menu has the same items, for that folder.

- **New program** and **New library** put a name field in the tree. Type a name; `.pathogen` is added for you. A slash makes folders: `shapes/star` creates `shapes/` too. Enter creates the file; Esc cancels. If the name is taken, the field says so, and Enter does nothing.
- A new library starts with `module;` and a comment. A new program starts like a new workspace.
- The new file opens in a tab. The preview doesn't change. A new program goes at the end of the program list.
- **New folder** makes an empty folder. It stays, empty, until you put files in it or delete it.
- **Names** use letters `a`–`z` and `A`–`Z`, digits, `-`, `_` and `.`, and start with a letter or a digit: `gear-train_2.pathogen` works, `my gear.pathogen` doesn't. A name can be up to 100 characters, and a path up to 255.
- Names in a folder must differ by more than letter case: `Gears.pathogen` and `gears.pathogen` can't both exist, because they would be the same file in a folder on macOS or Windows. The name `pathogen.json` is reserved in every folder: in the CLI, a `pathogen.json` inside a folder makes that folder a project of its own, and its files' `../` imports stop working.

## Uploading files

- **Upload files…** opens your system's file picker for `.pathogen` files. **Upload folder…** picks a folder and keeps the folders inside it: `shapes/round/dot.pathogen` arrives as `shapes/round/dot.pathogen`. Browsers can pick several files or one folder, but not both at once, so there are two items.
- You can also drag files and folders from your computer onto the tree. The folder under the pointer lights up, and that's where they go. Dropping on a file puts them in its folder; dropping on empty space puts them at the top.
- When a name is taken, a prompt beside the tree asks what to do: **Replace**, **Keep both** (the new file gets a number: `labels-2.pathogen`) or **Skip**. With several clashes, it offers to do the same for all.
- A message lists what was added. Uploading one file opens it in a tab. New programs go at the end of the program list.
- **Only `.pathogen` files** can be added for now. Anything else is left out, and the message says why.
  - Font files can't be added yet. Use a Google Fonts family instead, such as `@font "Raleway" 700;` (see [`@font`](#path-blocks-font-directive)). An `@font` with a file path, such as `@font "./fonts/Raleway-Bold.ttf";` in a project from the CLI or VS Code, gets a warning that suggests the family, as it does in a workspace today. [TO DECIDE in 2c: today's warning (recommended, until font files can be added), or the CLI's error.]
  - A `pathogen.json` is left out too: the playground writes its own.

## Renaming, moving and deleting

- **Rename…** is in each file's menu. A name with a folder in it moves the file; so does dragging the file onto another folder in the tree.
- Renaming or moving a file updates the `import` paths that name it in the workspace's other files, and its entry in `pathogen.json`.
- Moving a file also updates its own `./` and `../` import paths, so they still reach the same files. [TO CONFIRM in 2d, recommended.]
- A folder's menu also has **Rename…**, which moves everything in it, with the same updates, and **Delete…**, which deletes the folder and its files after asking. [TO CONFIRM in 2d, recommended; not drawn in the mockups.]
- **Delete…** asks before it deletes. The files that imported a deleted library show an error at their `import` line until you change them.
- **Duplicate** makes a copy beside the file, named with a number as Keep both does: `gears-2.pathogen`. A copy of a program goes at the end of the program list. [TO CONFIRM in 2d.]

## pathogen.json

Every workspace has a `pathogen.json` at the top: the same project file that the CLI and VS Code read ([pathogen.json](#projects-pathogenjson)). Its `entryPoints` list holds the workspace's programs, the main first:

```json
{
  "entryPoints": [
    "main.pathogen",
    "demos/gears.pathogen",
    "try-sizes.pathogen"
  ]
}
```

- **It's read-only.** The playground rewrites it as you add, rename and delete programs and set the main. Open it to see the list; typing in it does nothing, and a line at the top of the editor says how to change the main.
- It's the last row of the tree's top level, with a lock. Its tab keeps `.json`. It can't be renamed, moved or deleted, and the program list doesn't include it.
- Libraries aren't listed, since `module;` is what makes a file a library. The list sets only the order of the program list, and which program is the main.

## Errors in other files

An error in a file other than the program the preview shows names that file and its line, in the error panel and in the console, as [Errors in other files](#modules-errors-in-other-files) shows for the CLI. Click the file's name to open it at that line. [TO CONFIRM, note 46: not drawn in the mockups.] Red dots in the tree mark the file where the error happened and the program that ran into it.

## Limits

| | Limit |
|---|---|
| A `.pathogen` file | 1 MB |
| Files in a workspace | 500 |
| Folders inside folders | 8 deep |
| A whole workspace | 50 MB |

A save or an upload that would pass a limit is refused with a message that names it, before anything is lost. [When data files and fonts can be added: data files 5 MB each, fonts 20 MB each (note 50).]
