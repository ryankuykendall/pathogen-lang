# Phase 2g mockups v1: Download source, and a new workspace from a project

2026-11-23. Your answers to note 67's five questions, and the mockups drawn from them. Nothing is built yet.

## Your answers

1. **Where a project is downloaded:** neither of my options. "Export implies a transformation which is what we currently have with SVG, PNG, and PDF. This is really just a download of the code as a zip file. We should just create new menu item under the overflow menu for 'Download source'". So the menu item is **Download source**, in the workspace's ⋮ menu, and Export keeps its three formats.
2. **What the .zip holds:** "Just the project files...not the generated svgs" (a).
3. **Where a project comes back in:** your answer reads "Just a", cut off. I've read it as (a) only: a new workspace, from a project folder or a .zip, on the new-workspace page. Upload folder… inside a workspace stays as it is.
4. **Which program Export, Copy SVG and Snapshot take:** "Copy SVG and Snapshot will be for the currently selected entry point. For the initial release, the same will hold for Export. However, we should add a follow-up item to provide a workflow that supports an entrypoint picker in the export modal." All three already take the program the preview shows, so nothing changes there. The picker is on the backlog ("A program picker in the Export modal", Playground). Whether the three should **name** that program is question 1 below.
5. **Visitors:** "Agreed, yes, but add it to the backlog for the time being." On the backlog: "Download source on a public page" (Publishing and snapshots).

## Before and after

| | Today | Proposed |
|---|---|---|
| Taking a workspace to the CLI or VS Code | Copy each file by hand | **⋮ → Download source:** `Gear-studies.zip`, holding a `Gear-studies/` folder with every file and folder and the workspace's `pathogen.json`. `pathogen-lang Gear-studies` compiles its main; VS Code's preview opens on it |
| Bringing a project folder in | Upload folder… inside a workspace; its `pathogen.json` is left out, and its programs join the end of the list | **New workspace → Or import a project:** a folder or a .zip (or one dropped there) becomes a new workspace with its files, folders and program list. Upload folder… is unchanged |
| Export, Copy SVG and Snapshot | Take the program the preview shows, without saying which | The same. If you say yes to question 1, they name it when the workspace has more than one program |

## Where to look

`mockups-2g-project/`: each state in both themes, `<state>-light.png` and `<state>-dark.png`. They're the dev playground with the proposals added to the page: `shoot.ts` opens a workspace on the dev server, adds the proposed markup, and takes the shots. So the menus, the form and the modal are the real ones, and only the new parts are drawn by hand. The proposed markup and CSS are the strings at the top of `shoot.ts`.

**1. Download source**
- `1a-menu`: the ⋮ menu with **Download source**, small text "A .zip of every file".
- `1b-downloaded`: the menu's own feedback, "Downloaded Gear-studies.zip". The card beside it shows what the .zip holds. It's a note on the mockup, not part of the page.
- `1c-menu-phone`: the same menu on a phone.

**2. A new workspace from a project** (the new-workspace page)
- `2a-new`: a new section under Starting Template, **Or import a project**, with Choose folder…, Choose .zip…, and a drop area.
- `2b-dragging`: a folder or a .zip dragged over the drop area.
- `2c-picked`: `gears.zip` picked. The name is filled from the folder or .zip's name, and Starting Template goes. The card lists every file that comes in: programs in the list's order with the main badged, then modules. `sketch.pathogen` isn't in that `pathogen.json`'s list, so it joins the end.
- `2d-left-out`: a folder with files the workspace can't take. They're listed under "Not added", with the same reasons Upload gives, and the same "Not added:" heading as Upload's toast. The last line is an `entryPoints` entry that names a missing file (question 4).
- `2e-no-pathogen-json`: a folder without a `pathogen.json` (question 2).
- `2f-refused`: a project with 34 files. Nothing is added, and Create Workspace is off. Upload does the same: it refuses an upload that would take a workspace past 20 files, rather than taking part of it. Here a partial import would also break the imports between files.
- `2g-new-phone`, `2h-picked-phone`: on a phone, only Choose .zip…. Phones can't pick a folder: Upload folder… is hidden on touch devices for the same reason (`file-tree.ts`).

**3. The program named** (question 1; try-sizes is in the preview, main.pathogen in the editor)
- `3a-copy-svg`: the menu, with Copy SVG's small text "The program shown: try-sizes", beside Download source.
- `3b-export`: the Export modal titled "Export try-sizes".
- `3c-snapshot`: the Snapshot popover with "Of try-sizes, the program shown" under the name. Its image is blank in the mockup; the real popover shows the drawing.

The shots are taken signed out, so the ⋮ menu has no Rename workspace or Make public.

With one program, the chip isn't shown, and the three stay as they are today.

## What the mockups settle, unless you say otherwise

- **Who sees Download source:** the workspace's owner, signed in or not, as for Copy Workspace (`_ownsWorkspace`). It isn't shown in an unsaved scratch buffer, which has no workspace yet. Copy SVG and Export cover that case. It stays on when the workspace has no program to draw: a workspace of modules is still source to download.
- **The .zip's name:** the workspace's name, made to fit the names a workspace allows, as Upload does for a picked file (`fittedName`): "Gear studies" becomes `Gear-studies.zip`, holding `Gear-studies/`. Export's file names come from the workspace's name too (`Gear-studies.svg`).
- **What's in it:** each file as the editor holds it, including edits not saved yet: what you see. `pathogen.json` is the file the workspace shows, from its one writer (`workspaceProjectFileText`). Empty folders are kept.
- **Where the import is offered:** on the new-workspace page as you reach it from **+ New Workspace**. It isn't offered when the page is copying a workspace or opening code from a link. Those already have their source, as they have no Starting Template today.

## Questions for you

1. **Name the program?** Should Export's title, Copy SVG's small text and the Snapshot popover name the program they take, when the workspace has more than one (`3a`–`3c`)? *Recommended: yes.* The chip already names it, but only at the bottom of the preview. A Snapshot or an Export of the wrong program is easy to miss until afterwards.
2. **No `pathogen.json` at the top** (`2e`): the CLI refuses such a folder ("my-gears is a folder with no pathogen.json. Add one (an empty {} compiles main.pathogen), or compile a file directly."). The playground would take it: the main is `main.pathogen`, as an empty `{}` would make it, and the other programs follow by name. Without a `main.pathogen`, the first program by name is the main, and a line under the card says so. *Recommended: yes.* The workspace writes its own `pathogen.json`, so Download source gives back a folder the CLI compiles.
3. **A `pathogen.json` that can't be read** (bad JSON, the old `main` key, an `entryPoints` that isn't a list):
   - **(a)** import anyway: the program list is made as in question 2, and "Not added" says why the list couldn't be read, in the CLI's words. *Recommended.*
   - **(b)** refuse the whole import until the file is fixed.

   The workspace writes its own `pathogen.json` anyway, so the file's only use here is its list.
4. **An `entryPoints` entry that names a file the workspace won't have** (missing, a module, or left out for its kind or size): it's dropped from the list, and "Not added" says so (`2d`, last line). If it was the first entry, the next program in the list is the main. *Recommended: yes.* The CLI stops on a missing main; the playground can't keep a list entry with no file.

## For the build (not for you)

- The import's sorting reuses Upload's (`sortUpload` with an empty workspace), with two changes:
  - a `pathogen.json` at the top is read, not left out with Upload's "the playground writes this file itself" message;
  - zips made in macOS's Finder hold a `__MACOSX/` folder, which doesn't start with a dot, so the dot rule doesn't catch it.
- A .zip whose files all sit in one folder, as Download source makes, is read from inside that folder.
- **A drop that misses the drop area:** the new-workspace page has no guard for it. The workspace's guard is a document listener that works only while `currentView === 'workspace'`. Without one, a .zip dropped on the name field makes the browser open the file and leave the page.
- **Empty folders:** a browser's folder picker never delivers them, only a drop does. So an empty folder survives a .zip or a dropped folder, but not Choose folder…. The docs say so, and the round-trip test covers the .zip.
- **Reading a .zip** needs inflate: a small vendor chunk such as `fflate`. Writing one can store files without compressing them.
- **The icon:** Material Symbols' `folder_zip`, at weight 300, joins the sprite as `folder-zip`.
- **The docs step:** "Uploading files" in `docs/workspace-files.md` (line 174) suggests dragging what's inside a project folder onto the tree, to keep `/` imports working. That advice changes once a project can become a workspace of its own.

## Next

Your review of the mockups and answers to the four questions. Then docs first: `docs/workspace-files.md` (a section on Download source and importing; "Not yet" goes) and `docs/projects.md` ("In each tool"), with a content review and your approval.
