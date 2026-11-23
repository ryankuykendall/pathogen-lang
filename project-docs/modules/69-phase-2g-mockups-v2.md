# Phase 2g mockups v2: Download workspace, and the import's pathogen.json

2026-11-23. Your review of v1 (note 68) and your answers to its four questions, with the states that change. v1's other states stand as approved: "The mock-ups look fine".

## Your answers

- **The name:** "I think that we should call the menu item 'Download workspace' rather 'Download source'...I think the explainer text underneath is fine." The item is **Download workspace**, small text "A .zip of every file". It sits under **Copy Workspace**, so the two capitalize "workspace" differently. The menu already mixes the two styles ("Rename workspace", "Make public" beside "Copy Workspace", "Set Thumbnail"); I've used your spelling.
1. **Name the program** in Export, Copy SVG and Snapshot: "yes". v1's `3a`–`3c` are what gets built.
2. **A folder with no `pathogen.json`:** "yes, and on import, the web app should offer to generate a 'pathogen.json' file for the workspace". Every workspace has a `pathogen.json` the playground writes, so the file can't be left out. The import shows the file it will write, and what it will hold (`2e`). Create Workspace accepts it. Set as main changes the main afterwards.
3. **A `pathogen.json` that can't be read:** "notify the user that they have a malformed pathogen.json file, and ask them to fix it before uploading". That's (b): the import stops, nothing is added, and the message is the CLI's (`2i`).
4. **An `entryPoints` entry naming a file the workspace won't have:** "yes". It's dropped from the list and listed under "Not added" (v1's `2d`).

## Where the import stops, and where it goes on

Answers 3 and 4 meet here. The rule:

- **It stops** whenever the file can't be read as a `pathogen.json` at all: the checks every tool makes whenever it reads one (`parseProjectFile`, `docs/projects.md` "pathogen.json"). That covers bad JSON, not an object, an unknown key, the old `main` key, an `entryPoints` that isn't a list, an entry without `.pathogen`, and an entry outside the folder. Each gets the CLI's message, with the folder's name.
- **It goes on** when only the checks for using the list fail: an entry naming a missing file, a module, or a file left out for its kind or size. That entry is dropped and listed under "Not added". If it was the first, the next program in the list is the main.
- **Two cases on neither side, settled as defaults** (say if you'd rather):
  - an empty `entryPoints` is read as no list, as in answer 2;
  - a path listed twice is kept once.

## Where to look

`mockups-2g-project-v2/`, each state light and dark (`<state>-light.png`, `<state>-dark.png`). Made as v1 was: `shoot.ts` adds the proposals to the dev playground's real pages. v1's folder is kept as it was.

- `1a-menu`, `1b-downloaded`, `1c-menu-phone`, `3a-copy-svg`: the menu item renamed **Download workspace**.
- `2a-new`, `2g-new-phone`: the import's lead names it: "a .zip made by Download workspace".
- `2e-no-pathogen-json`: the card lists `pathogen.json`, marked **new**. Below it is the file the workspace will write: `main.pathogen` first, then the other programs by name. The text comes from the workspace's own writer (`projectFileText`), so the mockup shows what the build will write.
- `2i-malformed` (new): a folder whose `pathogen.json` still has the old `main` key. "This project's `pathogen.json` can't be read, so nothing was added. Fix the file, then choose the folder again:" and then the CLI's message. Create Workspace is off.

## For the build (adds to note 68's list)

- **The bad-JSON message** comes from the browser's own JSON parser, so its wording differs between Chrome, Safari and Firefox. The docs describe it without quoting it.
- **The folder name in messages** is the picked folder's or the .zip's name (`gears`), where the CLI names a path on disk.
- **The rename** reaches the docs, the CHANGELOG and the backlog ("Download workspace on a public page").

## Next

Your OK on v2. Then docs first: `docs/workspace-files.md` (a section on Download workspace and importing; "Not yet" goes; the "Uploading files" advice for project folders changes) and `docs/projects.md` ("In each tool"), with a content review and your approval.
