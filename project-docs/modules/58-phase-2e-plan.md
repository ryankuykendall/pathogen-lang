# Phase 2e: every file, everywhere a workspace goes. The plan

2026-11-14. "go ahead with the 2e plan." 2e is the last part of phase 2 (note 42): publishing, forks, snapshots, the admin tools and the public detail page, each carrying every file of a workspace. After it, everything from 2b to 2e ships together, with `docs/workspace-files.md` (approved 2026-11-14) and the production migration (note 50).

The server side was mostly built in 2b (note 50, steps 3–6). This plan comes from two audits of what's left (2026-11-14), mostly on the playground's side. File and line references are in "What the audits found" at the end.

## Before and after

| Today (2d, committed locally) | After 2e |
|---|---|
| **Snapshot** sends the shown program's text alone; the server stores it as `main.pathogen`, so a snapshot of a workspace with modules loses them, and a program from a folder lands at the top | A snapshot keeps **every file as it was when the preview drew**, and **which program drew it** |
| **The snapshots page** reads one file; a snapshot with several would fail to open, image included | It reads every file. **Code** shows the program that drew it, with the other files by name |
| **Copy Workspace** and the Workspaces page's **Duplicate** send `code`, which a workspace with several files doesn't have: the copy is an **empty `main.pathogen`** | A copy holds every file, folder and the main (the server's copy, built in 2b) |
| **Open as new workspace** on a public page reads `code` only: the same empty copy | It carries every file of the **approved** version |
| **Make public** compiles the main **alone**, so a main that imports a module is refused; on the Workspaces page it reads `code`, so a workspace with several files is refused as "empty" | It compiles the main **with its imports** |
| **The review screen** shows an entry with several files as having no source | It compiles the main with its imports, shows every file, and Approve sends the main's drawing |
| **The public page** shows the main's text | It shows **every file**, the main first (a mockup first) |
| The admin thumbnail tool and `backfill-approval-svgs.ts` skip a workspace with several files | They compile the main with its imports |
| `docs/workspace-files.md` waits; four published pages say a workspace is one program | It's published with its screenshot; the four pages are brought up to date |
| Older publishing problems (below): Make public freezes the last *saved* version; after Make private, approving a waiting re-review makes the workspace public again; Explore's cards follow live edits | Fixed, with your answers to questions 8 to 10 |

## What's decided

- **The shape:** a workspace and a project folder have the same shape (note 45, the docs page).
- **The main** is what a workspace opens on and what its thumbnail shows (2d, note 54 Q1: "always main").
- **Export and Copy SVG take the program the preview shows** (your answer for the docs page, 2026-11-13). 2g revisits it.
- **Snapshots and copies use the server's 2b routes as they are:**
  - snapshots as manifests of the workspace's own files;
  - `GET /snapshot/:sid/files`;
  - starting a workspace from a snapshot, which copies every file;
  - `POST /workspace/:id/copy`;
  - `GET /approval-source/:id`, which serves the approved files, never the live ones;
  - `source.json`, which carries `files`.
- **Scratch and `?state=` links stay one program,** by design. A scratch buffer has no files, and Copy URL is gone (note 52).
- **Shipping** (note 50): push, wait for both deploys, then the migration's dry run on production and its write, each after your go-ahead.

## Open: please decide (recommendations first)

1. **What publishing shows: the main.**
   - The Explore card is the thumbnail, the main's drawing.
   - The public page's drawing is the main's, compiled with its imports.
   - Its source is every file, the main first.
   - Make public checks that the main compiles with its imports.

   This settles step 10's finding 16: the docs page's "The main" says "…and the one its thumbnail shows and publishing uses", and Set as main's menu line stays as it is.

   *Recommended: yes.* The alternative, publishing the program the preview shows, would let the public drawing and the thumbnail disagree.
2. **Re-review after any change to the workspace's files.** An approved workspace goes back to review when its hash changes. The hash covers every file's path and bytes, the order of `pathogen.json`'s list, and the folders (`src/workspace/files.ts:265-270`). So each of these starts a re-review:
   - editing any file, including a module the main doesn't import, or another program;
   - renaming or moving a file;
   - **Set as main**;
   - adding an empty folder.

   A change to the name, the description or the canvas settings doesn't.

   *Recommended: keep it.* The public page shows every file and folder, and which program is the main, so each of these changes what visitors see.
3. **What a snapshot keeps:**
   - the drawing the preview showed (as now);
   - every file as it was when that drawing was made (not as it is when you press Save);
   - which program drew it.

   *Recommended: yes.* This is the rule Export follows. Note 42 had put "which program Snapshot uses" in 2g with export; this settles it the same way. 2g can revisit both together.
4. **A snapshot of a program that isn't the main.** Options:
   - **(a)** the snapshot panel names the program under its thumbnail (`demos/gears.pathogen`);
   - **(b)** the snapshots page labels it;
   - **(c)** "Start new workspace" opens the new workspace showing that program;
   - **(d)** "Copy code" copies that program's file.

   *Recommended: all four.* Each one keeps the image and the code it names together. "Start new workspace" still copies every file, and the new workspace's main is the one the snapshot kept.
5. **How the public page and the snapshots page show several files.** One shared pattern, drawn as a mockup first:
   - the main (or the program that drew the snapshot) open, with a line naming it;
   - each other file by name, as a row that opens its text;
   - folders as part of the name (`parts/gears.pathogen`).

   The review screen uses the same pattern.

   *Recommended:* a small **v12 mockup round** of those three screens and the snapshot panel's line (4a), reviewed before their code.
6. **The snapshots page's "Open in playground workspace" button.** The embedded viewer on the snapshots page has its own button, which makes a one-file workspace from the code it shows. "Start new workspace" does the same job, with every file.

   *Recommended: hide it on the snapshots page.* It stays on the blog's embeds, which are one program.
7. **The snapshot size limit** ("1 MB of code per snapshot"). Files the workspace has already saved are named by their hash and cost nothing. Only text not yet saved is uploaded.

   *Recommended:* keep the 1 MB cap on what's uploaded. The docs line becomes "up to 1 MB of edits not saved yet", since a 20-file workspace can hold more than 1 MB in all.

The audits also found publishing problems that **predate phase 2** (details at the end). They are **live on the site today**. Fixed in 2e, they stay live until 2e ships. Fixing one sooner would mean a branch from what's deployed, outside the commit-to-main habit; that's your call. Three questions cover them:

8. **Fix the plain bugs in 2e:**
   - Make public saves first, so the review sees the version that was checked.
   - Make private ends re-review: an edit to a private workspace no longer queues one, and Make private removes any that's waiting. Today, approving such a re-review **makes the workspace public again**.
   - Going back to the approved version removes the waiting re-review.
   - "Pending re-review" in the menu updates after each save, not only on load.
   - The Workspaces page's Make Public follows the same states as the breadcrumb's.
   - An admin can read an approval's older files.
   - `publishing.md` names the menu items as they are.

   *Recommended: yes, all seven.* 2e reworks publishing anyway, and each one is small.
9. **Freeze the public image at approval.** Explore's cards and the public page's fallback show the live thumbnail, which follows the owner's edits within about 10 minutes, including edits waiting for re-review. The docs say it's frozen.

   *Recommended: freeze it.* Approve makes a card image from the approved drawing: the review screen already compiles it in the admin's browser, and already makes thumbnails there (Regenerate). Explore, the profile page, Featured and the public page then read that image.
   - **Approvals that exist need one too:** a backfill on production, run only with your go-ahead.
   - **The backfill script can't make every image.** `backfill-approval-svgs.ts` skips programs with GPU gradients, which can't render headless. Those need the review screen's Regenerate, by hand.
   - **Before building it, I'll compare this with copying the thumbnail at approval on the server.** That copy is simpler, but it takes the live thumbnail, which can already hold edits made after submitting.

   The other answer is to change the docs to say the image follows your edits.
10. **Close the live files of a public workspace to everyone but the owner and admins.** Today anyone signed in can read a pending edit three ways:
    - `GET /workspace/:id`;
    - the file route;
    - `POST /workspace/:id/copy`, which copies another user's public workspace with its live files (`router.ts:699`).

    Under this answer:
    - visitors read only the approved files: the public page and `source.json`;
    - copying is for the owner and admins;
    - other people's forks go through `source.json`, as Open as new workspace will (step 4).

    *Recommended: yes.* Before closing anything, step 5 checks that no page of the site needs those reads from someone else. The new-workspace form's `copyFrom` reads a workspace through `GET`, so it's the first place to check.

    The thumbnail routes' missing visibility check goes on the backlog. Ids are random, and 9 already moves public pages to the approved image.

## The steps

Each step: tests first; light and dark; a puppeteer check against `npm run dev:stack`; the full suite; a code review; a local commit. Nothing is pushed until step 8.

1. **v12 mockups** (question 5): the snapshot panel's line, the snapshots page's Code panel, the public page's source and the review modal, each with several files, built on v11's page. Reviewed with you before steps 3, 5 and 6.
2. **Snapshots, the server:** the manifest gains `program` (the path that drew it), read back by `/files`. A snapshot made before 2e reads as `main.pathogen`. No D1 change: the field lives in the manifest in R2.
3. **Snapshots, the playground:**
   - The preview keeps what it drew from: every file's text (a map of references, no copies), the folders and `pathogen.json`'s list.
   - The snapshot sends all of that as it was drawn, plus `program`:
     - each file by hash when its text equals the saved file, and as text when it doesn't;
     - the folders and `entryPoints`, always. A `files` snapshot that leaves them out gets a new workspace's defaults (`snapshots.ts:450-457`), so "Start new workspace" would get the wrong main. Tested.
   - The snapshots page reads `/files` and shows the v12 Code panel.
   - Copy code and Export's legend use the drawing program's file.
   - Start new workspace opens showing that program.
   - The embedded viewer's own button is hidden on that page.
4. **Copies and forks:**
   - Copy Workspace and Duplicate use `POST /workspace/:id/copy`. The form keeps its name and description fields; they're applied after the copy.
   - Open as new workspace creates from `source.json`'s files (the approved ones), each sent as text.
   - The new workspace opens on its main.
5. **Publishing and review:**
   - Make public (the breadcrumb and the Workspaces page) saves first, then checks the main with its imports, through the same compile the preview uses.
   - The review screen loads an entry's files, compiles the main with its imports for the card, the modal and Approve's SVG, and shows the files (v12). An entry whose files can't be read says so.
   - Note 59's requirement 9, from 3c: a file that can't be read says so in its place in `<source-files>`, and the others still show. The server reads the rest instead of failing all. The snapshots page and the review modal both use it.
   - The admin thumbnail tool and `backfill-approval-svgs.ts` compile the main with its imports.
   - The server fixes, with your answers to 8 to 10:
     - re-review only while public;
     - removing the waiting re-review at Make private, and on going back to the approved version;
     - an admin reading any file of a workspace;
     - the approved card image;
     - live reads closed to visitors.
   - The menu's re-review state, after each save.
6. **The public page** (`/u/:handle/:slug`, the Pages worker): the v12 source view. `source.json` already carries every file. *A Pages worker change needs `dev:stack` restarted to check it (note 50, step 6).*
7. **The docs:**
   - Publish `docs/workspace-files.md`: its `DOC_FILES` line; the header comment out; `[month]`; the snapshot sentence; the publishing-and-main wording; the screenshot, in light and dark. And from step 3d, its three lines on Copy Code (7, 33 and 97 on 2026-11-15) become the copy icon at the end of the tabs, which isn't there with no file open (Format Document stays off then).
   - Bring four published pages up to date:
     - `projects.md`: "The playground can't read files yet", and its In each tool bullet;
     - `modules.md`: its intro line, its In each tool bullet, and the "No project folder" error row;
     - `snapshots.md`: several files, the no-program reason, the size limit; and from step 3c, Copy code leaves the actions (the icon copies the file shown) and Start new workspace copies "this snapshot's files";
     - `publishing.md`: the main and every file; the menu items' real names; the frozen image, if 9 is yes.
   - A content review, then your approval.
   - The CHANGELOG, covering 2b to 2e. Include the two preview speed fixes made during 2e (`project-docs/preview-raster-perf/`): c3b63c8, the preview's own compositing layer (switching files and tabs no longer redraws the drawing), and 90997bc, option 1 (Files, Console and the inspector slide past a still preview).
8. **Ship** (note 50, "At shipping"):
   - the push;
   - both deploys live;
   - the production dry run (your go-ahead) and the write (your go-ahead);
   - the dry run again;
   - the export and collision check as a smoke test;
   - if 9 is yes, the card-image backfill for existing approvals (your go-ahead), and Regenerate by hand for the ones it can't render.

## Your answers (2026-11-14)

Questions 1 to 7 answered; 8 to 10 still open. The steps above are left as written; what changes in them is listed at the end of this section.

1. **Publishing shows the main: yes, for the first release.** Later: "for a future release, we should actually be generating images for each entrypoint and making the whole collection the published artifact." On the backlog: "Publish every program's drawing".
2. **Publishing from a snapshot, after the first release.** "I am starting to feel like we should only allow publishing from a specific snapshot (or, when whe publish, we would simply create a snapshot as the reference for the state of the generated image and the code at that point in time.) Publishing should be an explicit action." On the backlog: "Publish from a snapshot".
   - *My reading, to confirm:* the first release keeps question 2 as it was asked. Any change to the files sends an approved workspace back to review, including renames, Set as main and an empty folder.
   - This bears on question 9: a published snapshot would freeze the image by itself.
3. **Yes.** A snapshot keeps the drawing the preview showed, every file as it was when that drawing was made, and which program drew it. Later: "whether we want give the user the ability to snapshot the results of each entrypoint." On the backlog: "Snapshots of every program".
4. **Held for a later release** ("based on my answers above"). On the backlog: "Snapshots of a program that isn't the main". This leaves question A below.
5. **Yes: "distill the requirements first for the experience and then create some mockups."**
6. **Your question: does hiding the button mean imports are joined into the main to make one file?** No. Nothing in 2e joins files. Both buttons make a new workspace and leave the snapshot's own workspace as it is. They differ in what they carry:
   - **"+ Start new workspace"** (the snapshots page's header, `app-breadcrumb.ts:362`) has the server copy the snapshot's stored files into a new workspace (`snapshots.ts:731-777`): every file at its path, the folders, and which program is the main.
   - **The viewer's "Open in playground workspace" icon** (`mini-workspace.ts:655-666`) belongs to `<mini-workspace>`, the viewer the blog's embeds use, which the snapshots page reuses. It sends only the text in its code pane to `/workspace/new?import=`, in a new tab. From a snapshot with several files it would make a workspace holding one file, whose imports then fail as not found.

   Today a snapshot holds one file, so both give the same workspace; after step 3 they won't. The purpose you describe, opening an older version in a new workspace once the workspace has moved on, is what Start new workspace does. Question B below.
7. **Yes:** the 1 MB code cap counts only text not saved yet.
   - **The 80 MB SVG is a different cap.** A snapshot's image is limited to 50 MB (`SNAPSHOT_LIMITS.svgBytes`), checked in the browser before anything is sent (`snapshot-controller.ts:213-220`). So the server never hears of a refused snapshot, and logging one needs a call from the playground.
   - That goes with the analytics follow-up, not 2e. On the backlog: "Snapshots over 50 MB" and "Usage events: what Cloudflare offers", the research to do after the first release. I took your two scenarios to be the 20-file limit (already on the backlog) and snapshots over the image cap.

### Still open

- **A. A snapshot drawn by a program that isn't the main,** with question 4 held. Under answer 3 such a snapshot can still be made: the preview can show any program, and Snapshot takes what it shows. Without question 4's four parts, the snapshots page still has to pick the file its Code panel opens on and Copy code copies: the main, which doesn't match the drawing, or the program that drew it. Options:
  - **(a)** the snapshots page's Code panel opens on the program that drew it, and Copy code copies that file. Nothing else names it; Start new workspace opens on the main, as any new workspace does. *Recommended:* the image and the code beside it agree, using only what answer 3 already keeps.
  - **(b)** Snapshot takes only the main's drawing for now, as the thumbnail does ("Show the main first", 2d step 5a). Simpler, but Snapshot stops working while you look at another program.
- **B. The viewer's icon on the snapshots page:**
  - **(a)** hide it there, keeping Start new workspace. *Recommended:* one button, one result.
  - **(b)** keep it, and have it do what Start new workspace does.
- **8 to 10,** with question 9 now weighed against answer 2. Explore's cards follow live edits today, including edits waiting for re-review. Options:
  - **(a)** freeze the card at approval from the approved drawing, with a production backfill for existing approvals (as asked);
  - **(b)** the server copies the workspace's thumbnail when it approves, and a one-time copy for existing approvals. Smaller, with no rendering; but the copy can include edits made after submitting. *Recommended for the first release,* since publishing from a snapshot (answer 2) replaces it, and a snapshot already keeps its own card image (`SNAPSHOT_LIMITS.cardBytes`);
  - **(c)** no code: the docs say the card follows your edits until publishing from a snapshot arrives. This leaves edits nobody has reviewed on Explore's cards.
- **Whether the publishing bugs live in production now get an early fix** from a branch of what's deployed, or wait for 2e.

### What changes in the steps

- **Step 1** becomes: the requirements for showing several files (the snapshots page, the public page, the review screen), your review, then the v12 mockups.
  - The public page and review screen parts depend on nothing still open.
  - The snapshots page part waits on A and B.
  - The snapshot panel's line (4a) is dropped.
- **Step 2:** unchanged. The manifest keeps `program`.
- **Step 3:**
  - "Copy code and Export's legend use the drawing program's file" and "Start new workspace opens showing that program" are replaced by A's answer.
  - "The embedded viewer's own button is hidden on that page" waits on B.
- **Step 7:** snapshots.md's size line stays "up to 1 MB of edits not saved yet". The 50 MB image limit is unchanged.

## Your second answers (2026-11-14)

- **Question 2:** confirmed. "I think that is fine for the initial release." The first release keeps re-review after any change to the files.
- **Question 7:** "50MB for a snapshot's image is a fine limit." Analytics waits ("We can circle back on the analytics issue in the future").
- **A: (a).** A snapshot drawn by a program that isn't the main: the snapshots page's Code panel opens on that program, and Copy code copies its file. Nothing else names it. Start new workspace opens on the main.
- **B: (a).** The viewer's "Open in playground workspace" icon is hidden on the snapshots page. Start new workspace stays.
- **8: agreed.** All seven fixes are in 2e.
- **9: (b).** "Yes...that's fine for the time being." When it approves, the server copies the workspace's thumbnail as the card image. Explore, the profile page, Featured and the public page read that copy. Existing approvals get a one-time copy on production, with your go-ahead. The copy can include edits made after submitting; publishing from a snapshot replaces it (backlog).
- **Early fix:** "Let them wait for 2e."
- **10:** not answered yet. It changes only step 5's server work. *Answered later the same day: "Agreed".* Only the owner and admins read or copy a public workspace's live files: `GET /workspace/:id`, the file route and `POST /workspace/:id/copy`. Visitors read the approved files through the public page and `source.json`, and step 5 first checks that nothing on the site needs those reads from someone else, the new-workspace form's `copyFrom` first. Recorded with note 59's answers.

What this changes in the steps:
- **Step 3:** Copy code and Export's legend use the drawing program's file (A); "Start new workspace opens showing that program" goes; the viewer's icon is hidden (B).
- **Step 5:** "the approved card image" is the server's copy of the thumbnail at approval (9b), not a drawing made in the admin's browser.
- **Step 8:** the backfill for existing approvals is that copy. No rendering is needed, and no GPU-gradient source needs Regenerate by hand.

## Step 1, done (2026-11-14)

The requirements (note 59) and three mockup rounds:
- **v12** (note 60): the list beside the code;
- **v13** (note 61): copying from an icon in the code panel;
- **v14** (note 62): that icon in a bordered cell in every header.

v14 approved: "v14 approved, go ahead and start building 2e".

## Step 2, built (2026-11-14)

**A snapshot keeps the program that drew its image** (`website/api/snapshots.ts`).

- **Sending it:** `files` may carry `program`, a path among the files sent. Leave it out and the program is the main, the first entry point. `code` (one program's text) is main.pathogen's.
- **Refused before anything is written,** with these messages:
  - not a string: `"program" must be the path of the program that drew the image, such as "main.pathogen".`;
  - not one of the files: `"program" names "X", which isn't one of the snapshot's files.`
  - After the files are stored, the same check runs against what was kept, so create and read can't disagree.
- **Stored** in manifest.json as `program`; no D1 change.
- **Read back** by `GET /snapshot/:sid/files` as `program`.
- **Snapshots saved before 2e** (a manifest without `program`, or the code.pathogen from before phase 2) read as drawn by the main, which is main.pathogen for every one in production. So the production migration, which writes manifests without `program`, needs no change.
- **A damaged `program`,** one present but naming no file of its own, makes the manifest read as damaged, like its other fields.

**Found by the code review, and fixed.** A file named `__proto__` is an own key of parsed JSON. Assigned into a plain object in `filesFromBody` (`website/api/workspace-store.ts`), it set the object's prototype instead, and the file vanished without being checked. That was true for saves too. With `program: "__proto__"`, the snapshot would have named a file it doesn't hold and been unreadable. `files` now has no prototype, so such a name is refused like any other bad name.

**Tested:**
- `tests/api/snapshots.test.ts`: eight new tests, and the exact-manifest test updated;
- every API test (235);
- the full suite (9,145 passed);
- `project-docs/modules/verify/verify-2e-step2-program.ts`: 6 checks against the local workerd API.

## Step 3, split

Step 3 is four commits, so that each one's tree works on its own:
- **3a:** a snapshot sends every file as drawn, and the snapshots page reads `/files`;
- **3b:** the blog viewer shows several files: the list, the 34 px file line, and the copy icon in its cell, floating for one file (v12 to v14);
- **3c:** the snapshots page with that viewer, Copy code in the code panel, Export's legend, and the hidden ↗;
- **3d:** the workspace's copy icon in the tabs, and Copy Code gone from the breadcrumb.

## Step 3a, built (2026-11-14)

- **The store keeps every file as the preview drew it** (`renderedFiles`: texts, folders, entry points, and the program that drew). It's copied when the compile starts, set in the same update as `renderedCode`, and cleared wherever that is.
- **The snapshot sends `files`,** built when Snapshot is pressed, while autosave still holds the workspace:
  - each file the server holds goes by its hash, and an edit not saved yet as text;
  - autosave's own rule decides which, now one method that saves and snapshots share (`autosave.filesBody`). It uses hashes only for the workspace autosave holds; for any other, every file goes as text;
  - a scratch buffer still sends `code`.
- **The 1 MB check measures the very string uploaded,** as the server does. Its message now says the unsaved edits are what's too big.
- **The "edited since this rendered" note covers every file,** the program that drew first:
  - "line 5 of `parts/gears.pathogen`" with several files;
  - the line alone with one, as before;
  - "You've changed the workspace's files" when a file was added, removed or renamed.
- **The snapshots page reads `/files`** for its code, Copy code and Export: the drawing program's text. `/code` answers 409 for several files, which would have left the page empty. The list and the copy icon come in 3b and 3c.

**The code review** found no critical problem. It traced the races:
- a save between capture and upload sends an older hash, which the server still finds, since saves never delete;
- a workspace switch is safe, because the body names the same workspace it's posted to.

Fixed from it:
- the folders and the program list are copied too, not shared with the store;
- the size message for a workspace autosave doesn't hold, where every file goes as text, says the code is over 1 MB, not that waiting for a save will help (`autosave.holds`);
- `snapshotApi.files` uses the snapshot calls' own fetch and errors.

**Tested:**
- `tests/playground-autosave-files.test.ts`: four new tests;
- `tests/playground-snapshots.test.ts`: seven new tests;
- the playground typecheck: no new errors (the four from before remain);
- `project-docs/modules/verify/verify-2e-step3a.ts`, 10 checks on the dev stack:
  - the real upload's `files` (saved files by hash, the edit as text);
  - `/files` after an unsaved module edit;
  - a non-main program;
  - the note naming a module's line;
  - the snapshots page opening a snapshot of several files;
  - Start new workspace;
  - a scratch buffer's `code`.

## Step 3b-1, built (2026-11-15)

**`<source-files>`** (`playground/components/shared/source-files.ts`) is the one viewer for code the web app shows but doesn't edit. 3b-2 puts it in `<mini-workspace>`'s code panel, and step 6 on the public page. Drawn as v12 to v14:
- **several files:** a list beside the code, in the workspace tree's order and look (its rows, icons, `main` badge rule, and pathogen.json last); a 34 px line naming the open file, with the copy icon in a 38 px cell with a border on its left, flush right;
- **one file:** the code alone, with the copy icon floating in its top right corner;
- **narrower than 480 px** (its own width, so the review modal's 520 px pane keeps the list): a menu above the code that opens the files as a sheet, fixed to the window's bottom;
- **copying** copies the file shown, and "Copied" comes only once the clipboard has taken it. A refusal says to select the text and copy it;
- **keyboard:** the arrow keys, Home and End move between the files, passing over folders; Enter or Space opens one;
- **CodeMirror** loads on `activate()`. Switching files swaps the document, not the view, and the theme follows `data-active-theme`.

It imports nothing that needs the playground's store. So `MAIN_FILE` and `PROJECT_FILE` moved to `utils/workspace-names.ts`, and the tree's order (`file-tree-rows.ts`) reads them there.

**The code review** found no critical problem. It confirmed every path and text is escaped, no listener is doubled, and the import move has no cycle. Fixed from it:
- the editor comes back when the viewer is taken out and put back, or activated before it's on the page;
- a CodeMirror load that fails is tried again;
- the sheet is `aria-modal`, Escape closes it wherever the keyboard is, and every way of closing it gives the keyboard back to the menu;
- a second copy keeps its full "Copied";
- "1 file";
- a kind it doesn't know draws as a program;
- the editor keeps its scroll through a re-layout;
- 8 px of give at the 480 px line.

Left for 3b-2: checking the sheet inside the review modal, where an ancestor's transform would pin `position: fixed` to the modal. For step 6: the public page must load the theme's dark tokens, since the viewer's colours fall back to light ones.

**Tested:**
- `tests/playground-source-files.test.ts`, 17 tests: escaping hostile paths and texts, the keyboard, the theme, the sheet, copying;
- the tree's tests, after the move;
- `project-docs/modules/verify/verify-2e-step3b1.ts`, 19 checks on the served storybook, light and dark. They found two styling bugs, both fixed:
  - the copy cell was 26 px tall, not the line's full height;
  - after a re-layout, the editor's line numbers sat one row off until it measured again.
- Baselines of today's blog viewer, for 3b-2's comparison: `2e-step3b-before-*.png`.

Committed as 1866440.

## Step 3b-2, built (2026-11-15)

**`<mini-workspace>`'s code panel is `<source-files>`.** It's used by every blog embed, the snapshots page and the review modal.
- **Copy moved into the panel.** It's gone from the control bar of every embed. A blog sample's icon floats in the panel's corner and says "Copy the code", since a sample isn't a file.
- **Several files** come through a new `sourceFiles` property: the files, the folders, the main, and the file to open on. Open in Playground still carries one text, the program that drew the image.
- **`hide-playground-link`** hides the ↗. Nothing sets it yet: the snapshots page in 3c and the review modal in step 5.
- **The code open or closed,** set by the toggle, the storybook's control or a page, now loads the editor in each case. Before, setting the attribute alone left plain text. Closed, the panel is `inert`, so its copy icon isn't in the Tab order ("with the code closed, nothing to copy", note 61).
- **On a phone** the panel stacks under the embed's corner, so its copy icon steps left of the ↗.
- **In `<source-files>`:** the code panel opens with a 0.3 s animation that passes through narrow widths. So a width now has to hold for 150 ms before the layout follows it, and a folded panel (under 120 px) is ignored. Without this, several files would show the menu, then the list, while the panel opens. One file never re-lays out for its width.

**Expected until 3c:** the snapshots page shows two ways to copy, its breadcrumb's Copy code and the panel's icon, which says "Copy the code" there too. 3c gives that page the several-files viewer and removes the breadcrumb's copy.

**Compared with the baselines** (`2e-step3b-before-*` and `2e-step3b-after-*`): the blog embed with its code open, the storybook, the open bar and a 390 px phone, in light and dark. The code, its colours, line numbers and wrapping are unchanged; the copy icon is new in the panel, and gone from the bar.

**The code review** found no critical problem. It confirmed that the snapshots page and the review modal build their viewers the way the new one reads them. Fixed from it:
- with no file named to open, the panel and Open in Playground could pick different files. They now share one rule (`shownPathOf`): the main, else the first program;
- files set later now give Open in Playground the new drawing's size as well as its code;
- returning to one sample clears the file the panel had open.

**Tested:**
- `tests/mini-workspace-code-panel.test.ts`, 13 tests:
  - a blog sample: the icon and what it copies, and no Copy in the bar;
  - the code closed or open: the panel inert while closed, and the attribute alone opening the editor;
  - the review modal's way, written into a page's HTML: one editor load;
  - the hidden ↗;
  - several files: the list, and what Open in Playground carries (with no file named too);
  - files set later, their size included;
  - an embed taken out and put back;
- `tests/playground-source-files.test.ts`, three more: a width followed only once it holds, the first layout fitting the width it starts at, and one file never re-laid out;
- `tests/mini-workspace-canvas.test.ts`: the bar's order without Copy;
- step 3a's check on the dev stack again: the snapshots page still opens a snapshot of several files;
- `project-docs/modules/verify/verify-2e-step3b2.ts`, 21 checks on the dev stack, light and dark:
  - the static blog page's embed: CodeMirror, the icon and the clipboard, no Copy in the bar, the closed panel taking no focus;
  - nothing above the panel that would pin the phone's sheet to an ancestor;
  - the header's own theme toggle reaching the editor;
  - the phone's icon clear of the ↗;
  - the several-files stories: the list, the ↗ hidden, opening the code passing through narrow widths without the menu showing, and a narrow panel's menu.

Committed as 127ed62.

**Checked after the commit:** the BBWP pages, the one place note 59's requirement 1 lists that 3b-2 hadn't opened.
- A `.mw.html` page loads `public/components/blog/mini-workspace.js` by a relative path, so the viewer's new imports have to resolve beside it.
- They do: on `2026-10-20-11:45:36--misc--01-digits.mw.html` (served on :3001), the embed upgrades, its code shows in CodeMirror, the icon says "Copy the code", and no request fails.
- Evidence: `2e-step3b2-bbwp-light.png`.

## Step 3c, built (2026-11-15)

**The snapshots page shows every file of a snapshot,** drawn as mockup v13's state 5 and v14's file line:
- **The code panel** lists every file in the tree's order and look. Each file is a program or a module as the engine reads it (`module;`), not by a guess. `pathogen.json` comes last, as the tree writes it.
- **It opens on the program that drew the image** (answer A).
- **One file shows the code alone,** as snapshots made before 2e do. Its icon says "Copy main.pathogen".
- **The panel's icon copies the file shown.** Copy code has left the breadcrumb, so the bug that said "Copied!" before the copy finished (note 59) goes with it.
- **The ↗ is hidden** (answer B). Start new workspace says it copies "this snapshot's files".
- **Export's legend lists the program the panel opens on.** One helper (`utils/snapshot-viewer-files.ts`) picks that file for both, so they can't disagree. The API client's own rule (`drawingText`) is gone.
- **Rename:** the viewer's title follows at once. It used to keep the old name until another snapshot was chosen (note 59).
- **← and →** step between snapshots, but not from the code panel's list, where they move between files. The page used to step whenever the keys weren't typed into a field or the code, which would have replaced the viewer under the reader.
- **Each snapshot's files are read and sorted into kinds once.** The engine parses every file to tell modules from programs.

**Still open, given to step 5:** note 59's requirement 9, "a file that can't be read says so in its place, and the other files still show".
- `/files` is all or nothing. If one stored file is missing, the page says "Couldn't load this snapshot", image included, as before 2e.
- Step 5 needs a "files can't be read" state for the review screen's Approve anyway. The per-file version, on the server and in `<source-files>`, goes there, and the snapshots page takes it up then.

**The code review** found nothing blocking. Fixed from it:
- if the engine can't write `pathogen.json`, the page shows the other files rather than failing;
- an answer without its lists of programs or folders reads as empty ones.

**Tested:**
- `tests/playground-snapshot-viewer-files.test.ts`, 10 tests (new), with the real engine:
  - the kinds, and `pathogen.json` as the tree writes it;
  - a snapshot of another program, and Export's legend;
  - one file;
  - an answer with its one text alone;
  - no program and no main;
  - an engine that fails, an answer without its lists, and no engine;
  - the breadcrumb without Copy code;
  - ← and → owned by the list;
- `tests/mini-workspace-code-panel.test.ts`: the caption follows its attribute;
- the playground typecheck: no new errors;
- `project-docs/modules/verify/verify-2e-step3c.ts`, 13 checks on the dev stack, with snapshots made in the playground:
  - every file and kind, opening on `demos/gears.pathogen`;
  - the icon and the clipboard;
  - Export's legend;
  - the breadcrumb;
  - Rename;
  - ← and → in the list and outside it;
  - a snapshot of the main, and a one-file snapshot;
  - no ancestor that would pin the sheet;
  - a phone's menu, sheet and breadcrumb;
- step 3a's check again (10): its snapshots-page line now reads the panel's text, since the page no longer adds a `<code>` child.

Committed as 78f671e.

## Step 3d, built (2026-11-15)

**The workspace copies from an icon at the end of its tabs,** as mockups v13 and v14 draw it (states 1 to 3, 5, 6):
- **A cell of its own,** before the docs book, the same size as the book's: the bar's height, 38 px wide, a border on its left.
- **It copies the file in the editor,** and its tooltip names that file ("Copy parts/gears.pathogen").
- **"Copied" shows only once the clipboard has taken the text.** A refusal says to select the text and press ⌘C. Before, Copy Code said "Copied!" whatever happened.
- **With no file open, the icon isn't there.**
- **Copy Code has left the breadcrumb,** on a phone too: the control row is the same markup.
- **One look for every copy icon** (`utils/copy-feedback.ts`): the check or cross, the note and its wording. The note's colours now come from the theme, light on a dark page, rather than fixed values.

**The code review** found nothing blocking. Fixed from it:
- a copy that finishes after another file has opened no longer says "Copied" with the new file's name; it says nothing. The same in `<source-files>`;
- "Copied" reaches a screen reader through a status region that stays on the page. One inserted already holding its words is often skipped;
- a stale comment.

Its docs findings (`workspace-files.md`, `snapshots.md`) are listed under step 7, which changes the docs with a content review and your approval.

**Superseded checks:** `verify-2d-step9a.ts` and `verify-2d-step4d.ts` look for the breadcrumb's Copy Code. They're kept as the record of those steps; run again, those lines fail.

**Tested:**
- `tests/playground-editor-tabs.test.ts`, five more:
  - the cell before Docs, and its event;
  - no icon with no file open;
  - "Copied" only when told, and gone after a moment;
  - a late copy naming no one;
  - a refusal, cleared by another file;
- `tests/playground-source-files.test.ts`: a late copy, and the status region;
- the two breadcrumb tests, now without Copy Code;
- the playground typecheck (no new errors);
- `project-docs/modules/verify/verify-2e-step3d.ts`, 15 checks on the dev stack, light and dark:
  - the cell's size and place;
  - the clipboard, and the note over the code (not under it);
  - another file opened from the tree;
  - no Copy Code in the breadcrumb;
  - every tab closed;
  - a phone;
- the 3b and 3c checks again, for the shared note.

**Checked after the commit** (note 59, requirement 1, and the readers the blog sends):
- **A snapshot made before 2e,** stored as its `code.pathogen` alone with no manifest: made in the playground, then turned back into the old form in local R2. The page shows the code alone, "Copy main.pathogen", and Export's legend lists it (`verify-2e-step3c.ts`, now 15 checks).
- **Signed out, on a scratch link,** where a blog embed's ↗ leads: the tabs' icon is there, named, and copies (`verify-2e-step3d.ts`, now 16).
- **And one fix:** the snapshots page kept files read before the engine had loaded, with every file passing for a program, for as long as the page stayed open. They're now read again next time.

**That ends step 3.** Every place the web app shows code now copies from an icon in the code's own panel: the workspace, the snapshots page and blog embeds. The review modal and the public page follow in steps 5 and 6.

## Step 4, built (2026-11-16)

**Copies and forks carry every file.**

**Copy Workspace and Duplicate** (`?copyFrom=`, the owner's workspace) copy on the server, with `POST /workspace/:id/copy`.
- The copy has every saved file, the folders, the programs' list (so the same main) and the canvas settings.
- It gets the form's name and description.
- It waits for the save that leaving the workspace started, so an edit typed just before Copy Workspace is in the copy.
- Nothing is created from text any more.

**Open as new workspace** (`?fromHandle=&fromSlug=`, someone's public workspace) creates from `source.json`'s files:
- It takes the approved version, each file sent as text, with its folders and list, so an edit waiting for review isn't carried.
- A `source.json` without files says "Failed to load workspace", and submitting creates nothing. Before, it made an empty workspace.

**Both open on their main**, including a main that isn't `main.pathogen`.

**What differs from the plan's wording:**
- **The copy route takes the description itself** (`description` in its body, else the original's) instead of the form applying it after the copy. That's one request, with no copy left with the wrong description if a second request failed.
- **The copy route drops `publicationState` and `rereviewPending`,** as it already dropped `flagged`. Both are read from the moderation records by id, which a copy has none of. A record that kept them stored mustn't pass them on.

**Visible changes:**
- **The breadcrumb's Copy Workspace shows only to the workspace's owner,** signed in or not (`workspaceOwnerId === getUserId()`, the workspace view's own test). This follows answer 10: someone else forks from the public page, which copies the approved files.
- **The Open as new workspace form reads like Copy Workspace:** the title "Copy Workspace", "Creating a copy of …", and no starting-template picker, which it never used.

**For step 5:**
- **The copy route's access rule is unchanged here.** Anyone signed in can still copy a public workspace's live files through it, until step 5 restricts it to the owner and admins (answer 10).
- **Public workspaces made before Phase 4, with no approval, have no public page.** Explore's and Featured's fallback links open them in the playground. With Copy Workspace now the owner's, visitors there have no way to copy them. Step 5's audit of the live reads should settle what those links do.

**The code review** found nothing critical. Fixed from it:
- **A load that ends after a newer one began is dropped.** Each load has a number. Before, a slow first link could fill the form with its workspace's name and, for a fork, its files.
- **The same fork link, notified twice, is left alone.** The store notifies once per key, so a route change that sets the view and the query runs the form's subscriber twice. The second ran the blank form's path and reset the form. That reset happened before this step too: a late load then filled the form back in.
- **Copy Workspace and Snapshot share one ownership test:** the owner is this browser's id or the signed-in account's.
- **Smaller fixes:**
  - a submit while the source loads does nothing;
  - the copy route ignores a name that isn't text, or a blank one;
  - a `source.json` whose folders or programs aren't text is refused;
  - a new load clears the last one's error;
  - `resetForm` drops the fork's files.

Declined:
- **Waiting at submit for a save that leaving the workspace hadn't started yet.** It's started when the route changes, and has finished by the time the form is submitted; the browser check types an edit and copies at once. A save that fails drops the edit whether or not you copy, as leaving a workspace always has.
- **A length limit on the description.** The create route has none on the server either; the form keeps its 500 characters.

**Tested:**
- `tests/api/workspace-files-api.test.ts`, four more:
  - the name and description given, with every file, the empty folder and a main that isn't `main.pathogen` kept, and the original untouched;
  - no description (or one that isn't text) keeps the original's;
  - a name that isn't text, or is blank, gives "(Copy)";
  - no publishing state carried.
- `tests/playground-new-workspace-copy.test.ts` (new), the form in jsdom:
  - Copy Workspace calls the copy route with the form's name and description, after the save, and never creates;
  - a refused copy (too many files) says why and goes nowhere;
  - Open as new workspace creates from the files, each as text, with no `code`;
  - a fork link set after the form mounted, the view and the query together as the router does, loads and stays (it fails without the fix);
  - a fork's load that ends after a newer one began leaves the form to the newer one;
  - an unreadable `source.json` creates nothing.
- `tests/app-breadcrumb-menu.test.ts`: Copy Workspace for the owner, signed in or not, and not on someone else's workspace.
- `project-docs/modules/verify/verify-2e-step4.ts`, 18 checks on the dev stack, in full Chrome:
  - **Copy Workspace:** an edit typed just before it is in the copy; every file, the empty folder, the list's order; the form's name and description; private and unpublished; it opens on its main (`demos/gears.pathogen`) with the empty folder in the tree; the original is unchanged.
  - **Duplicate** on the Workspaces page.
  - **Open as new workspace by a second user,** of an approved workspace with an edit waiting for review: the approved files, not the edit; the folders and list; it opens on its main.
  - **No Copy Workspace** on someone else's public workspace.
  - The form, light and dark (`2e-step4-copy-form-{light,dark}.png`).

## Step 5, split (2026-11-16)

Step 5 is the largest of 2e. Three read-only maps of the code, of the server, of Make public in the playground, and of the admin tools, split it into six parts, each committed on its own:
- **5a, the server's publishing rules:**
  - re-review only while public;
  - Make private, and going back to the approved files, withdraw a waiting re-review;
  - an admin reads any file;
  - the live files closed to visitors (answer 10).
- **5b, the card image frozen at approval** (answer 9b), with the one-time copy for existing approvals, to run in step 8.
- **5c, Make public, on the breadcrumb and the Workspaces page:**
  - it saves first;
  - it checks the main with its imports;
  - the Workspaces page follows the breadcrumb's states;
  - the menu's re-review state after each save.
- **5d, a file that can't be read says so in its place** (note 59, requirement 9): the server reads the rest, and `<source-files>` shows the file as unreadable.
- **5e, the review screen:**
  - the files, compiled with their imports, in the v12 list;
  - a re-review's marks;
  - unreadable files said, with Approve off;
  - the Approved and Featured tabs;
  - its dark-theme colours;
  - the ↗ hidden.
- **5f, the admin thumbnail tool and `backfill-approval-svgs.ts`,** compiling the main with its imports.

**What the maps found besides the audits' list:**
- **Approving a re-review always sets the workspace public.**
- **A re-approve without Feature** sets `featuredAt` to null, but leaves the id in `featured:workspaces`.
- **Owner Make private doesn't take the workspace off Featured.** The Featured page hides it only through its `isPublic` filter.
- **The Workspaces page reads `code` for its precheck,** which only a workspace that is just `main.pathogen` has. Any other workspace is refused as "Workspace is empty".
- **`workspacePublicationState` and `workspaceRereviewPending` have no types** in `types/store.d.ts`.

The Featured findings are left as they are: they are outside answer 8's list and need a decision of their own.

## Step 5a, built (2026-11-16)

**The server's publishing rules** (`website/api/router.ts`):
- **A re-review is only for a public workspace.**
  - An edit to a private workspace with an approval queues none.
  - Make private removes a waiting re-review, in the same block that unpublishes.
  - A save whose files are back to the approved ones removes a waiting re-review.
- **An admin's Unpublish and Flag remove a waiting re-review too,** and Requeue does, since its review entry holds the files as they are now.
- **A save re-reads the record just before queuing a re-review,** so a Make private that lands during the save doesn't find the entry queued again.
- **A re-review waiting for a workspace that isn't public any more,** as an older server could leave one, is withdrawn rather than decided. Approve or Reject answers 409 `{ error: "This workspace isn't public any more, so its re-review was withdrawn.", withdrawn: true }`. Approving it used to make the workspace public again. A submission waiting beside it, which is the owner asking again, is approved as usual.
- **The review screen** takes a withdrawn re-review off its list and shows the server's reason as a notice, not as "Approve failed".
- **Every save says whether a re-review is waiting** (`rereviewPending`), the skipped save included, for 5c's menu.
- **The live files are the owner's and the admins'** (answer 10). This covers `GET /workspace/:id`, the file route and the copy route.
  - The owner counts signed in, or by the browser's anonymous id.
  - An admin counts by token, or by a signed-in session in `ADMIN_EMAILS`. Before, `GET` took only the token.
  - Visitors read a public workspace's approved files through `/approval-source/:id`, which is unchanged.
  - Only a signed-in admin can copy: a token has no account to copy into.
- **An admin reads any file a workspace ever named,** public or not. Before, on a public workspace the admin check never ran, so a submission's or an approval's older file answered 404.

**Who loses a read:**
- Anyone opening someone else's public workspace in the playground, from a link kept before Copy URL went, or from Explore's, a profile's or Featured's fallback link for an index entry with no owner handle (`scripts/backfill-owner-handle.ts`: production has no approvals from before Phase 4, so in production those links are rare or absent).
- The playground then says "You do not have access to this workspace", as it does for a private one, with nothing armed to save (checked in a browser, below).
- Whether such a visitor should be sent to the public page instead is a question for you.

**For step 7's docs:**
- `docs/publishing.md:30` says an edited approved workspace "returns automatically to the re-review queue". It's now only while it's public, and Make private or going back to the approved version withdraws the re-review.
- Its menu names (answer 8) are already queued.

**For step 8:** a one-time removal of re-review entries whose workspace is private (your go-ahead). Until then the review screen withdraws each one when an admin acts on it.

**Left as they are** (from the code review; all predate 5a):
- **The re-review queue is one KV list, written read-modify-write.** Two saves of different workspaces at the same moment can lose one's change. 5a adds removals to it, but no new kind of write.
- **A save that reads the approval just before a first approval is written** queues no re-review for the edit. The next save does.
- **Flagging a user keeps their workspaces public** (for the unflag), so their re-reviews stay, and approving one puts the workspace back on Explore while the user is flagged.
- **The live thumbnail is public,** so a public workspace's card can show an edit waiting for review. That is 5b.

**Tested:**
- `tests/api/publishing-rules.test.ts` (new, 19), with a session user, a second user, a session admin and the token:
  - an edit queues a re-review, and with a public workspace only;
  - Make private, going back, an admin's Unpublish or Flag, and Requeue each withdraw it;
  - Make private then Make public: no re-review, and the edit is the submission;
  - a skipped save says whether one is waiting, public and private;
  - a stale re-review's 409 for Approve and for Reject (no rejection recorded), and a submission beside it approved;
  - a signed-in visitor and a signed-out one get 403 from the three routes, while `/approval-source` still serves them;
  - the owner, signed in and anonymous, reads and copies;
  - both admins read the live files and an approval's older file, and a file the workspace never named (another workspace's) is not found;
  - the session admin copies, the token can't.
- `tests/playground-admin-review-withdrawn.test.ts` (new, 3): Approve and Reject of a withdrawn re-review drop it with a notice; any other refusal is still an error and the entry stays.
- Every server test (`tests/api`, 258).
- `verify-2e-step4.ts` again, 18 checks. Its last check is now "someone else's public workspace: 'You do not have access', no Copy Workspace, nothing saved" (no PUT or POST; the browser's CORS preflight aside). Its open-on-main check now waits for the workspace's files rather than the moment before.
- A code review. Its three warnings are fixed above (the admin's Unpublish and Flag, the review screen's 409, the race with Make private); the rest is in "Left as they are".

## Step 5b, built (2026-11-16)

**The card image frozen at approval** (answer 9b; `website/api/approval-card.ts`):
- **Approve copies the workspace's live thumbnails as the approval's card.** For each size it takes the manual layer, else the auto one, and it copies the hero, to `${id}/approved-{1024,512,256,hero}.png`. It stamps `cardAt` on the approval and its index entry.
  - The copy happens before the approval is written, so the index entry has `cardAt` from the start.
  - A copy that throws leaves `cardAt` absent. Approve still succeeds, and the one-time copy tries again.
  - A re-approval copies again, and removes an older card's images that have no counterpart now.
- **`cardAt` has three states**, on the approval and on the index entry:
  - a time: the card;
  - null: approved without a thumbnail, so a placeholder;
  - absent: an approval from before 5b, which shows the live thumbnail, as before, until the one-time copy reaches it.
- **One builder for index entries,** `indexEntryFor` in `moderation.ts`. Before, reconcile built its own, so it would have dropped `cardAt`.
- **`GET /approval-card/:id/:size`** serves 256, 512, 1024 and hero.
  - It's guarded like `/approval-svg`: 404 unless the workspace is public and not flagged, except for an admin, with `private, no-store`, since the review screen's Featured tab lists unpublished workspaces too.
  - The hero falls back to the card's 1024, never the live hero.
- **Every public page links the card through one helper,** `cardImageUrl` in `_worker.ts`. That covers Explore, the profile, Featured, and the public page's og:image, hero image and More by.
  - The URL carries `?v=<cardAt>`, since Regenerate and a re-approval write the same keys.
- **The review screen's Regenerate and Set thumbnail write the card,** with `kind=approval` and `approval-hero` on the thumbnail upload. That upload is an admin's only, the owner included. It needs an approval, and never writes the live thumbnail or its times.
  - Before, both wrote the owner's live thumbnail from the approved files, over the owner's own.
  - The Approved and Featured cards show the card, and so does Set thumbnail's notice.
  - The crop modal takes `target: 'approval'`; its admin opener is the review screen alone.
- **The one-time copy:** `POST /admin/approval-cards` (admin) runs the same copy for approvals with no `cardAt`.
  - It works in batches that resume after the last workspace id read: at most 40 copies and 200 reads a call, inside the Worker's 1,000 calls.
  - `dryRun` counts without writing.
  - `scripts/copy-approval-cards.ts` loops it, and refuses a non-local API without `--confirm`. It runs in step 8, with your go-ahead.

**From the code review:**
- **The one-time copy writes the Explore index once a call.** KV takes about one write a second to a key, so writing it once per approval would have failed partway through production's run.
  - The write happens even when a copy throws, so the cards copied before it reach the index.
  - An approval with a card whose index entry lacks it (a run that stopped between the two) gets its entry repaired, counted as `repaired`.
- **A new hero stamps a new `cardAt`** when the approval has a card, so Set thumbnail's hero, which comes after its squares, is never cached under the squares' URL. A stamp is always later than the one before.
- **A card copied with only some sizes serves the nearest one** (`cardKeysFor`), never a broken image.
- **A re-approval whose copy fails keeps the earlier approval's card,** never the live thumbnail, and the failure is logged.
- **`scripts/backfill-publication-state.ts`**, the Phase 2 backfill, rebuilt index entries by hand. It now carries `cardAt` and `ownerHandle` from the approval.
- **The owner's thumbnail delete leaves the card,** now said in a comment.

**What stays as it was:**
- `/thumbnail/:id/:size` is still readable by anyone with the id; only the pages stop linking it. Closing it would break the owner's own `<img>` loads when signed out (an anonymous owner can't send its id with an image request). That's a question for later, not part of 9b.
- The copy takes the live thumbnail at approval, which can include edits made after submitting (accepted in answer 9).
- Approvals the dev seed made have no card until the one-time copy runs locally; the review screen shows their live thumbnail or placeholder, as before.

**For step 7's docs:** `docs/publishing.md:28` says visitors see "a stable version that does not change as you continue editing". With 5b that's true of the card image too, so the page needs no change for it; queued for a check during step 7's review.

**For step 8:** `scripts/copy-approval-cards.ts --dry-run` on production, then the copy (your go-ahead).

**Tested:**
- `tests/api/approval-card.test.ts` (new, 17):
  - Approve copies manual over auto, size by size, and the hero, and stamps `cardAt` on both records;
  - the owner's later thumbnails change the live images, not the card, and the card's hero falls back to its 1024;
  - with no thumbnail, `cardAt` is null and a re-approval removes the older card;
  - the route serves visitors while public, an admin after Make private, 404s after a flag, for a size it doesn't serve, and before approval;
  - the admin upload writes the card and stamps `cardAt`, never the live images or times; it's an admin's alone and needs an approval; it never puts an unpublished workspace back on Explore; a missing size writes nothing;
  - the one-time copy: a dry run writes nothing, batches resume, a second run copies nothing, inside the budget, with one index write a call, and an entry missing its card repaired;
  - a partial copy serves the nearest size; a re-approval whose copy fails keeps the earlier card;
  - a new hero stamps a later `cardAt`, and makes none where there's no card;
  - reconcile, a user's unflag, Feature, Unfeature and a new approval SVG keep `cardAt`.
- `tests/pages-card-images.test.ts` (new, 3) runs the Pages worker over the same storage:
  - every page's card URL;
  - the placeholder for a null card, even after the owner makes a thumbnail;
  - the live thumbnail for an approval from before the copy.
- `tests/api/publishing-harness.ts`: the 5a tests' harness, now shared.
- `project-docs/modules/verify/verify-2e-step5b.ts`, 15 checks on the dev stack in full Chrome, passing:
  - the owner's red thumbnail is approved, then the owner makes blue ones and a blue hero;
  - a visitor sees the red card load on Explore, the profile, og:image and the hero;
  - the review screen's Approved card shows the card;
  - Regenerate makes a new card from the approved files and leaves the live blue;
  - Set thumbnail saves the card and its notice shows it, and the live stays blue.
  - Screenshots: `2e-step5b-public-page.png`, `2e-step5b-review-approved-tab.png`.
  - The dev site's Pages worker was rebuilt alone (`tmp/2e-step5/build-pages-worker.ts`), since `build:website` regenerates the blog.
  - Run again after the review's fixes: all 15 pass.
- `scripts/copy-approval-cards.ts --dry-run` against the dev API: "Would copy 18 cards; 0 already had one", nothing written.
- A code review; its six warnings are fixed above.

## Step 5c, built (2026-11-16)

**Make public, on the breadcrumb and the Workspaces page:**
- **The breadcrumb saves the latest edits first.** Before, Make public submitted the last saved version, so an edit made within autosave's delay was left out. A save that fails, or a conflict with another tab, submits nothing and says why.
- **The check compiles the main with its imports**, as the preview does (`precheckWorkspace` in `services/publish-precheck.ts`). The main is the first program the workspace holds, which is what's published (answer 1).
  - Before, the main was compiled alone, so any main that imports a module failed the check.
  - A workspace with no program says "This workspace has no program to publish." The menu already holds Make public back then.
- **The Workspaces page does the same.** It waits for a save still leaving the editor, reads the workspace's files, and runs the same check.
  - Before, it read `code`, which only a workspace that is just `main.pathogen` has, so any other workspace was refused as "Workspace is empty."
  - It keeps the state the server answers. While a submission waits, its menu says "Pending Review", off, as the breadcrumb says "Pending review"; before, it offered Make Public again.
- **The menu's re-review state follows each save** (`publishingFrom` in `services/autosave.ts`). Every save's answer carries `rereviewPending` and `publicationState` (5a), the page-teardown save's too. An edit to an approved workspace shows "Pending re-review" once saved, and going back to the approved text shows "Make private" again, with no reload. Make private takes the answer's state as well.
- **`workspacePublicationState` and `workspaceRereviewPending` are typed** in `types/store.d.ts`.

**From the code review:**
- **Make public waits for every save still out** (`autosave.saveAndSettle`), a page-teardown save included. Before that, `saveNow` alone could answer at once while a save was still out, and the submission could reach the server first and freeze the older files.
- **A workspace the editor can't save** (autosave not armed for it) is checked and submitted as the server holds it, rather than refused as "Couldn't save".
- **Make private waits for a save still out** (`autosave.requestsAnswered`), so that save's answer, from before Make private, can't land afterwards and put back the re-review it withdrew.
- **`precheckCompile` is no longer exported**: compiled without its workspace, an importing main fails, and every caller had that wrong.
- **Left as it is:**
  - An edit typed during the moment the check compiles is saved by the next autosave, after the submission, as with any edit made after Make public.
  - On the Workspaces page, a save that failed when the editor was left can't be seen. The page submits the server's copy, as before.

**A question for you: Make private while a re-review waits.**
- Answer 8 says Make private withdraws a waiting re-review, and 5a does that on the server.
- But the breadcrumb's menu doesn't offer Make private then: it shows "Pending re-review", off, in its place.
- The Workspaces page still offers Make Private, so that's the only way to it today. 5c left it so, rather than follow the breadcrumb there and leave no way at all.
- Two ways:
  - **(a)** both menus offer Make private during a re-review, with "An edit is waiting for review" as its note (the menu's existing small-note style). *Recommended*: answer 8 assumed it.
  - **(b)** neither does, as the breadcrumb today: the owner waits for the review, or reverts the edit.
- Either is a change to a menu, so a mockup comes first.

**Your answer (2026-11-16): (a)**, "Let's go this direction for now."
- **The mockup:** `website/bbwp/2026-11-16-14:40:36--modules--rereview-make-private-menu.bbwp.html` (localhost:3001).
  - It shows Today and Proposed side by side, for both menus, in light and dark.
  - Its images are the real menus on the dev stack, with only the item's words and its note changed (`project-docs/modules/mockups-2e-5c-rereview-menu/capture.ts` and its PNGs).
- **Waiting for your review before the menus change.** Building it also needs the Workspaces page's listing to carry `rereviewPending` (one read of the re-review queue for the whole list), so the page knows when to show the note.

**Tested:**
- `tests/playground-make-public.test.ts` (new, 11):
  - each save's answer sets the re-review state, a skipped save's too, and an answer without it leaves it;
  - `precheckWorkspace` compiles the main with its imports; an import that can't load blocks with the compile's message; no program, nothing to publish;
  - the breadcrumb saves the edit, then checks, then submits; a failed save submits nothing; a page-teardown save still out is waited for; a workspace autosave doesn't hold is submitted as the server holds it;
  - Make private takes the answer's state, and waits for a save still out, whose older answer then can't put the re-review back;
  - the Workspaces page says "Pending Review"; its Make Public checks the main with its imports, submits, and shows the state answered.
- `project-docs/modules/verify/verify-2e-step5c.ts`, 9 checks on the dev stack in full Chrome, passing:
  - the breadcrumb right after typing: the edit is saved first and is what the review queue holds; the importing main passes; "Pending review";
  - the Workspaces page: an importing main is submitted; "Pending Review" (`2e-step5c-workspaces-pending.png`);
  - after approval, an edit saved with Ctrl+S gives "Pending re-review", and deleting it gives "Make private" with no re-review waiting.
  - Run again after the review's fixes: all 9 pass.
- A code review; its three warnings are fixed above.

## Step 5d, the server part (2026-11-16)

**Requirement 9** (note 59: "A file that can't be read says so in its place, and the other files still show"):
- **The reads that show files read every file they can.** A file whose bytes are missing comes back as `{ sha256, size, unreadable: true }`, without text (`filesToShow`, `readTextsLeniently`). These reads are:
  - the snapshot's `/files` (the snapshots page);
  - `/approval-source/:id` (the public page and its `source.json`);
  - `/admin/approval/:id` (the review screen).
  Before, one missing file failed the whole read with 500.
- **The reads that save or copy files still fail rather than lose one.** These are the editor's load, Copy, and a snapshot's Start new workspace.
  - A fork from `source.json` with an unreadable file refuses, as before: the fork form needs every file's text.
  - The admin queue listing still reports such an entry with `sourceError`, for 5e's whole-entry state (v12 R5).
- **The public page:** an unreadable main is no main text, so the page's source panel says the source can't be read, as when the API is down. A missing module leaves the main shown.
- **The snapshots page, until the viewer's state is approved:** a snapshot with an unreadable file shows the page's load error, naming the file ("Couldn't load this snapshot: parts/gears.pathogen couldn't be read."). Before, it failed with a storage error. No file is ever shown empty.
- **From the code review:**
  - The review screen's modal names a lost file ("main.pathogen couldn't be read.") instead of showing an empty source. Regenerate and Set thumbnail refuse with the same reason. 5e rebuilds the modal for several files.
  - An answer with a lost file isn't cached (`no-store`, the approved source and `source.json`), so a repair shows at once.
  - The interim no longer says "Try again later": a lost file doesn't come back by itself. The mockup's second line, "Reload the page to try again", has the same problem; for your review.

**The viewer's state, for your review:**
- **The mockup:** `website/bbwp/2026-11-16-14:53:07--modules--unreadable-file.bbwp.html`.
  - It shows the real viewer on the dev stack, a snapshot of three files whose module can't be read.
  - Proposed:
    - the row keeps its place, with a warning icon and its name muted;
    - shown, the file says "This file couldn't be read." and "The other files show as saved. Reload the page to try again." where its code would be;
    - its copy icon is off.
  - Today, the interim error. For reference, the snapshot with every file read.
  - The same state would apply in the review modal (5e) and the public page's View source (step 6).
  - Sources: `project-docs/modules/mockups-2e-5d-unreadable-file/`.
  - An earlier page, `…14:49:50--modules--unreadable-file.bbwp.html`, has a wrong "Today" (its storage delete missed, below): use the 14:53:07 one.

**Found along the way:**
- **The local dev API binds the preview R2 bucket** (`svg-path-extended-thumbnails-preview`, `api/wrangler.toml` `preview_bucket_name`), not `svg-path-extended-thumbnails`.
  - `verify-2e-step3c.ts` named the other one, so its swap to a snapshot made before 2e never reached the dev API. Its check passed anyway, because that snapshot already held only `main.pathogen`.
  - Fixed, and run again: 15 checks pass, the pre-2e path now really tested.
- **The snapshots page loads the live workspace too.** A file the live workspace still names going missing fails the whole page ("Couldn't load snapshots"), before any snapshot is chosen. Requirement 9 helps only when the lost file is a snapshot's older copy.
  - The page needs the workspace's name and owner, not its files. A lighter read is a possible follow-up; noted here, not done.

**Tested:**
- `tests/api/unreadable-files.test.ts` (new, 7):
  - `readTextsLeniently`;
  - the public source and the admin read mark a lost module and still read the main; a source with a lost file isn't cached, a repaired one is;
  - a just-main approval whose main is lost is marked, with no `code`;
  - the editor's load still fails;
  - the public page's reader accepts the mark, gives no main text for a lost main, and still refuses a file with neither.
- `tests/api/snapshots.test.ts` (+1): `/files` marks the lost file, reads the other, and Start new workspace still fails.
- `tests/playground-snapshot-viewer-files.test.ts` (+1): the interim names the file.
- `tests/playground-new-workspace-copy.test.ts` (+1): a fork with an unreadable file says so and makes nothing.
- `tests/playground-admin-review-unreadable.test.ts` (new, 2): the modal names the lost file; Regenerate refuses.
- The mockup's capture is itself a dev-stack check of the interim: the storage delete is real, and the page names the file.
- A code review: no critical findings, its three warnings fixed (above).

## The two mockups, approved and built (2026-11-16)

"The mock-ups look fine. Let's proceed with the next step."

**Make private while an edit waits for re-review** (5c's question, answer (a)):
- The workspace's menu offers Make private, on, with "An edit is waiting for review" under it. Before, it showed "Pending re-review", off, in its place.
- The Workspaces page's Make Private has the same note. `GET /workspaces` now says which workspace has an edit waiting (`rereviewPending`), from one read of the re-review queue for the whole list.
- Make private withdraws the re-review (5a). The note goes once the menu or the card takes the answer.
- One note for both menus: `REREVIEW_NOTE` in `services/publish-precheck.ts`.

**A file that can't be read, in the viewer** (5d; note 59, requirement 9):
- `<source-files>` takes `unreadable` on a file:
  - its row keeps its place, with a warning icon, its name muted, and "couldn't be read" on hover;
  - shown, it says "This file couldn't be read." and "The other files show as saved." where its code would be;
  - its copy icon is off.
- **Two differences from the mockup:**
  - The second line drops "Reload the page to try again": a lost file doesn't come back by reloading (proposed with the mockup).
  - The line naming the open file shows the warning icon, not a kind's: a file that can't be read has no known kind.
- The snapshots page shows it in place of the interim error. The review modal (5e) and the public page (step 6) will use the same state.
- Storybook: "A file that couldn't be read, shown".
- **From the code review:**
  - With no file asked for, the viewer opens on a readable program, never on one that couldn't be read (`shownPathOf`).
  - `<mini-workspace>` hides Open in Playground when the drawing's program couldn't be read: there's no code to open.
  - Export's legend leaves the code out for such a program, as it does for empty code; it never shows an empty program.
  - The copy refuses for a lost file even when asked directly.
  - A screen reader hears "couldn't be read" in the row's name.
  - The Workspaces listing survives a re-review queue that can't be read: it loses only the notes.

**Tested:**
- `tests/playground-source-files.test.ts` (+3): the row, the message and the copy icon off; another file shows again; one file alone.
- `tests/playground-snapshot-viewer-files.test.ts`: the file keeps its place, marked; the drawing's program unaffected.
- `tests/playground-make-public.test.ts` (+2): the breadcrumb's Make private with the note, and none with nothing waiting; the Workspaces page's note, and its Make Private taking the answer.
- `tests/api/publishing-rules.test.ts` (+1): the listing's `rereviewPending`.
- `project-docs/modules/verify/verify-2e-step5d.ts` (new, 4 checks), on the dev stack in full Chrome:
  - a snapshot's module really lost from local R2, after an edit;
  - the page opens with the drawing and every file;
  - the module's row and its message, the copy icon off;
  - another file shows again.
  - Screenshots `2e-step5d-unreadable-{light,dark}.png`.
- `verify-2e-step5c.ts`, now 11 checks:
  - Make private with the note, on, after a save;
  - no note once back to the approved text;
  - the Workspaces page's note;
  - its Make Private withdraws the re-review.
  - Screenshot `2e-step5c-make-private-waiting.png`.

## Step 5e, the review screen: the plan (2026-11-16)

**Four commits, to the v12 states R1 to R6 and v14:**
1. **The server:**
   - one source route, used by the card, the modal and Approve;
   - the comparison with the approved version, by hash;
   - the Re-review listing says what changed.
2. **The viewer's marks** (`<source-files>`):
   - a badge on each changed row, with a sign and a colour;
   - a removed file struck out in its place;
   - a badge on an added empty folder;
   - the mark in words on the open file's line;
   - opt-in, so the snapshots page is unchanged.
3. **The screen:**
   - **cards:** the main compiled with its imports, "N files", and the re-review's line;
   - **the modal:** the files, kept across the screen's redraws, with the changes box above;
   - **Approve:** gates itself on the loaded source and sends that source's drawing; an entry that can't be read is said, with Approve off;
   - **the ↗:** hidden for every entry (answer B).
4. **The rest:**
   - the Approved and Featured tabs reading every file;
   - the dark-theme colours;
   - the Rejected and Flagged cards.
- **Then:** a browser check of R1 to R6, light and dark.

## Step 5e, piece 1: the server (2026-11-16)

- **`GET /admin/review/:id/source?queue=review|rereview`** (admin) gives the named queue's entry: every file with its text, read leniently (an unreadable one marked, 5d), the folders and the programs.
  - The queue is named, since a workspace can wait in both: a re-review an older server left, then made public again.
  - A re-review also gives `changes` and `approvedAt`.
- **`compareManifests`** (`website/api/review-changes.ts`), by hash, reading no text:
  - a file new, changed, moved, or removed;
  - a move is one to one, between a path that's gone and a new path with the same bytes, in path order. A renamed and edited file is removed and new; empty files are never paired as moves;
  - an empty folder added or removed. A folder that holds files is said by their lines, and an empty folder inside it reports itself, not its parent too;
  - the program list, when it differs, its order alone included (`pathogen.json` changed);
  - counts for the card's line: new, changed and removed. Moves and `pathogen.json` are left out.
- **The Re-review listing** carries `changes` and `approvedAt` for each entry. That's one KV read an entry (its approval); both manifests are on the records.
  - A comparison that fails says so (`changesError`) and is logged, never shown as nothing changed.
- **Tested:**
  - `tests/api/review-changes.test.ts` (11): R3's and R4's cases, rename plus edit, duplicates, two moves paired, a new main, a nested empty folder, an empty-file pair, an approval from before phase 2;
  - `tests/api/review-source.test.ts` (6): a new entry, a re-review and the listing, a failed comparison, both queues, the gates, an unreadable file;
  - every server test (301);
  - a code review; its findings are fixed: the failure reported, nested folders, empty files, the cost comment.

## Step 5e, piece 2: the viewer's marks (2e, 2026-11-16)

- **`<source-files>` takes `marks`, opt-in.** The snapshots page sets none and is unchanged.
  - Each new, changed or moved file's row gets a small badge with a sign and a colour (+, •, →), the word on hover and to a screen reader.
  - A removed file keeps its place in the tree's order, struck out with a − badge. It isn't openable, and the arrow keys pass it.
  - An added empty folder's row gets the + badge.
  - The open file's line says the mark in words ("changed"; "moved", with "Moved from …" on hover).
  - The changed colour, `#b45309` light and `#e0a840` dark (the mockup's `--mark-chg`), is a local token switched with the viewer's own dark class. The others are the theme's success, warning and info tokens.
- **`<mini-workspace>`:**
  - passes `marks` to its panel;
  - `openFile(path)` shows a file without changing the drawing's program, which Open in Playground and the size still use;
  - it remembers the file being read, opened that way or clicked, so a re-attached embed (a fresh panel) opens on it again. The review modal's changes box will use it.
- **Storybook:** "A re-review's marks".
- **From the code review:**
  - A path both removed and among the files is the file: openable, marked as the files say.
  - `pathogen.json` is never shown as removed.
  - A screen reader hears the mark in the row's name ("gears.pathogen, changed"; "…, couldn't be read, changed"), and the badge is hidden from it.
  - A move with no origin says "moved".
  - The panel listens only to its own viewer's opens.
- **Tested:**
  - `tests/playground-source-files.test.ts` (+8):
    - the badges and their words, heard in the row's name;
    - a removed file in its place, struck out, not openable, passed by the arrow keys;
    - a path both removed and present;
    - a marked file that couldn't be read;
    - an added folder;
    - the open file's line, and the narrow menu;
    - marks set before the files, and cleared;
    - nothing without marks;
  - `tests/mini-workspace-code-panel.test.ts` (+2): the marks passed on; `openFile` and a re-attach keep the file being read without changing what Open in Playground sends;
  - screenshots from the story (`2e-step5e-marks-{light,dark}.png`, `verify/shoot-2e-step5e-marks.ts`), matching v12 R3.

## Step 5e, piece 3: the screen (2e, 2026-11-16)

- **One source an entry**, read by the card, the modal and Approve:
  - it comes from the listing when that carries every file's text (one file), else from `GET /admin/review/:id/source`;
  - it loads once a version: the key names the entry's `codeHash`, so a resubmitted entry is a new key, with no old thumbnail or drawing;
  - a failed load stays failed until Refresh.
- **The cards** (v12 R1, R2, R5):
  - the main compiled with its imports;
  - "N files" in the meta line, pathogen.json counted as the viewer counts it;
  - a re-review's line: "Since the approved version: **1 changed, 1 new, 1 removed**", "no file's text changed", or "Couldn't compare with the approved version." (never "nothing changed");
  - files that can't be read, or a source that didn't load: the mockup's message, Approve off with its reason on hover, Reject on.
- **Approve:**
  - off until the source has loaded, with "Approve waits for the submitted files to load" on hover;
  - it waits for a compile already running, then sends the drawing and the version it saw (`codeHash`). A drawing that doesn't compile is still approved, without one, as before.
- **The server's guard (found while building this).** A save replaces a waiting entry (`pushRereviewQueue` overwrites), so Approve could approve files nobody saw, with the old drawing.
  - `POST /admin/review/:id` takes an optional `codeHash`; a different version answers 409 `{changed: true}` and decides nothing.
  - The screen says "This submission changed after it was opened. Review the version waiting now.", closes the modal and reloads the tab. Reject sends it too.
  - A workspace waiting in both queues (an older server's leftover) is decided by its review-queue entry, as before. Approving it from the Re-review tab answers "This workspace also waits in Pending review, with a newer submission. Decide it there." (from the code review: it first said "changed", which a reload never cleared).
- **From the code review, also:**
  - a load that failed is tried again whenever the queue is listed again (Refresh, a tab visit, a refused decision), and versions no longer listed are dropped with their drawings; before, only a page reload retried;
  - an entry from before phase 2 round-trips: the source's `codeHash` is the one the decision checks (both are `readStoredFiles`' hash);
  - a disabled Approve on a lost entry points a screen reader at the card's reason (`aria-describedby`).
  - Not changed: the modal has no focus trap or Escape, as before (not a regression); Reject on an entry whose files haven't loaded sends no `codeHash`, so it's unguarded, as before.
- **The modal** (v12 R2 to R4, R6):
  - It lives outside the part of the screen `render()` rewrites, so a thumbnail finishing behind it never resets the file being read.
  - It shows the drawing and every file, opening on the main, with the ↗ hidden for every entry (note 61, answer 2).
  - A re-review's box says what changed, a line each, with the viewer's badges; the lines that name a file open it.
  - A compile that failed shows the reason and the files, in the viewer alone.
  - Files that can't be read are said in place of the viewer.
  - The Approved and Featured tabs' modal uses the same parts, with every file, and compiles the main with its imports when there's no frozen drawing (Regenerate and Set thumbnail are piece 4).
- **Shared, not copied:**
  - the viewer's badges and their colours (`markDot`, `MARK_DOT_STYLES`, `MARK_CHG_COLOR` from source-files);
  - the snapshots page's file mapping (`snapshotViewerFiles`), told to open on the program compiled.
- **Tested:**
  - `tests/playground-admin-review-screen.test.ts` (10): the card's count and line; Approve off until the files load; a failed comparison said; files that can't be read on the card, Approve doing nothing, and in the modal; a failed load retried on Refresh; Approve's compile (the main, with every file) and what it sends; a drawing that doesn't compile; a save since; the modal's files, marks and ↗, kept through redraws; the box's lines opening files; one file needing no fetch;
  - `tests/playground-review-entry.test.ts` (10): the pure helpers;
  - `tests/api/review-source.test.ts` (+3): a stale `codeHash`, for Approve and Reject, decides nothing; both queues; an entry from before phase 2;
  - on the dev stack, `verify/verify-2e-step5e.ts` (12): every state above, the redraw, the stale Approve and then the version waiting approved with its drawing, light and dark (`2e-step5e-{queue,modal-new,modal-changed}-{light,dark}.png`).

## Step 5e, piece 4: the Approved tab's actions and the colours (2e, 2026-11-16)

- **Regenerate and Set thumbnail** compile the approval's main with its imports, as the public page draws it. One helper, `sourceFromApproval`, reads the approval's answer for them and for the Approved and Featured modal; an approval carrying only its one text reads as main.pathogen.
- **The screen's own colours follow the theme.** Local tokens on the screen and the modal, with dark values:
  - the error panels (the tab's and the modal's);
  - the owner-flagged and other badges;
  - Reject (outlined) and Confirm reject (filled).
  - The primary button's ink is the theme's `--accent-text`: dark on the dark theme's light orange, where it was white and hard to read.
  - The reject notes box takes the theme's background and ink (from the code review: it had neither).
  - The drawings' white mat stays: drawings are made on white.
- **From the code review, also:** an approval carrying only its text gives its size in bytes, not characters.
- **Tested:**
  - `tests/playground-review-entry.test.ts` (+2): an approval's source, and one carrying only its text;
  - `tests/playground-admin-review-screen.test.ts` (+2): Regenerate's compile (the main, with every file); the dark class on the screen and the modal, following a later flip;
  - on the dev stack, `verify/verify-2e-step5e-4.ts` (6): Regenerate stores the main's drawing with its imports, Set thumbnail crops the same drawing, the Approved card's modal shows every file, and the computed colours in light and dark (`2e-step5e-colours-{light,dark}.png`).

## Step 5f: the admin tools draw every file (2e, 2026-11-16)

- **The thumbnail tool** (`/admin/thumbnails?token=…`) compiled `workspace.code`, which a workspace of several files doesn't carry, so it skipped them as "no code". It now compiles the main with its imports from the workspace's files (`GET /workspace/:id`, an admin's read).
- **`scripts/backfill-approval-svgs.ts`** skipped an approval of several files by name. It now compiles the main with its imports. An approval with a file that can't be read is reported and left alone, and the GPU-gradient skip looks in every file.
- Both use the review screen's helpers, `sourceFromAnswer` (renamed from `sourceFromApproval`: an approval's answer and a workspace's have one shape) and `reviewCompileInput`. `review-entry.ts` is DOM-free now, so a node script can import it; the viewer's files moved to `review-viewer-files.ts`.
- **Tested:**
  - `tests/playground-admin-thumbnails-imports.test.ts` (3): the tool compiles a workspace of two files from its main, with every file and its `toFixed`, and uploads that path (it skipped them before); a workspace carrying only its text compiles as before; a file that can't be read fails it (from the code review: it was marked done, with no thumbnail);
  - on the dev stack, `verify/verify-2e-step5f.ts` (6): the backfill run for real on an approval of two files stores the main's drawing with its imports, its dry run names the files, the token never printed; the tool's Auto-generate uploads a thumbnail for a workspace of two files.

### A question: what the Rejected and Flagged cards open

A card's image opens the approved version (`GET /admin/approval/:id`). A workspace never approved has none, so its modal says "No approval record". The rejection keeps no list of the files it rejected (its record holds the notes; the state row holds a hash), and the files' versions after it replace them in the workspace.

1. **Show the workspace as it is now** (recommended). Admins can read any workspace's files (5a). The modal would say "Never approved. This is the workspace as it is now, which may differ from what was rejected." No server change.
2. **Keep what was rejected.** A rejection would store the rejected version's file list, and the modal would show exactly that. Older rejections would fall back to 1. The cleanup script would have to keep those files too.
3. **Nothing to open.** A card never approved would have no clickable image, and would say "Never approved".

A card once approved (a re-review rejected, or a flagged workspace) keeps opening the approved version, which is what's public. Whichever is chosen, a mockup comes before it's built.

**Your answer (2026-11-17): deferred.** Likely 2 eventually, once snapshots become the foundation for publishing (a rejection would then point at the snapshot it rejected). Until then nothing changes: a never-approved card's modal still says "No approval record".

## Step 6, the public page: the plan (2026-11-16)

To mockup v12 P1 to P5 and note 59 answer 3a (the page holds the main's text; the others load when View source opens).

- **Served:**
  - every file's name, the folders and the programs, in a `data-` attribute (names are the owner's text: escaped, never inside a `<script>`);
  - the main's text in its `<pre>`, as now, for crawlers and visitors without scripts;
  - the summary: "Pathogen · N files" (pathogen.json counted, as the viewer counts it), or "Pathogen · N lines" for one file.
  - The main is the first program the approval holds, as on the review screen (`mainSourceText` took `entryPoints[0]`).
- **Opened** (several files): the viewer from the snapshots page and the review modal (`<source-files>`, the list beside the code), opening on the main. The other texts load in one request to `source.json`.
  - The files are `source.json`'s when it arrives, the open file kept if it's still there: a re-approval between the page load and the click can change them.
  - New viewer states, beside 5d's "couldn't be read": a file loading (a spinner on its row; "Loading <name>…" in the code), and a file that didn't load (a "!" on its row; "This file's text didn't load. Only the main's text comes with the page." in the code; the list's foot "The other files couldn't load." with Try again).
- **Each file's kind** (program or module) is the engine's call on its text, as everywhere else. The page's parser comes with the code view's own bundle (`/dist/highlight.global.js`), so the call runs in the browser when the texts arrive; the Pages worker stays free of the parser. `isModuleSource` moves to a module of its own that the highlight bundle exports too.
  - **Unlike the mockup's P2:** while the texts load, the programs (from the list) show the program icon and the others a plain file icon, until their text says which they are.
- **One file** (P5): today's code view, now following a theme change (note 59, found along the way).
- **Tested:** the viewer's new states; the served page (every name, the count, no text but the main's); the mount with `source.json` answering, failing and changed; on the dev stack, P1 to P5 in light and dark.

## Step 6, built (2026-11-16)

As planned above, and:
- `isModuleSource` lives in `src/parser/module-source.ts` (only the generated parser); the module loader re-exports it, and `src/highlight.ts` exports it with `workspaceProjectFileText`, so the public page uses the snapshots page's mapping (`snapshotViewerFiles`) with the highlight bundle as its engine.
- `website/approval-source.ts`: `approvalMainPath` (the first program held), used by `mainSourceText`; `servedSource` (names, folders, programs, main; no text).
- `playground/utils/detail-source-files.ts` (pure: the files before and after `source.json`) and `detail-source-mount.ts` `mountSourceFiles` (each attempt answers only for itself; Try again is the viewer's `source-files-retry` event). The highlight bundle's URL is a constant, so bundlers and tests leave the import alone; the mount takes its loader as an argument for tests.
- `<source-files>`: `pending` (`loading` | `failed`) and the kind `file` (a new plain icon in `file-icons.ts`); two storybook stories.
- **From the code review:**
  - Without the highlight bundle the viewer doesn't mount (no kinds, no pathogen.json, so the list wouldn't match the count): the page keeps the main's text, as without scripts.
  - The main badge is the first program held, before and after the texts come, as the file it opens on.
  - A screen reader hears "Loading 3 files", "3 files didn't load" and "The files have loaded", once each, from a status region of its own.
  - An answer that can't be shown counts as failed, with Try again, never a spinner forever; the one-file view's theme watch stops when its editor leaves the page; the source.json URL's parts are encoded.
  - A file name can hold only letters, digits, `-`, `_` and `.` (`nameProblem`), so no stored name can break out of the served attribute; it's escaped anyway.
- **Found while checking:** the line numbers looked out of step with their lines in the first screenshots. CodeMirror measures its lines only while the editor is on screen, and the check's window showed View source below the fold. Scrolled into view, as a reader sees it, they line up; the check now asserts that, in light and dark.
- **Tested:**
  - `tests/playground-source-files.test.ts` (+5): loading, failed with Try again, the texts arriving, what a screen reader hears, and the default never a file still to come;
  - `tests/playground-detail-source-files.test.ts` (8): the files before and after, the first program listed not held, the guards, the mount answering, failing then retried, without the highlight bundle, and a re-approval since;
  - `tests/pages-detail-source.test.ts` (2): the served page (every name, the count, the main's text and no other) and one file as before; `source.json` carries every text;
  - `tests/api/approval-source-pages.test.ts` (+2): the main is the first program held; `servedSource`;
  - on the dev stack, `verify/verify-2e-step6.ts` (9): P1 to P5, a phone's width, the line numbers, the theme followed with the page's own toggle (`2e-step6-*.png`).

## Step 7, done (2026-11-17)

The docs (note 63, review record `reviews/phase-2e-step7-docs-review.md`) and the CHANGELOG entry (note 64, without its "For you to decide" list), approved and committed together.

**Your answers:**
1. Docs and CHANGELOG: approved.
2. Edits made while a submission is pending: kept as documented (reviewed at the next save after approval). To revisit once snapshots become the foundation for publishing.
3. A rename changes the URL at the next approval: kept as documented.
4. What a never-approved Rejected or Flagged card opens: deferred to the snapshots work (above, under step 5f).

**Still open, from note 64's list, for step 8:** whether a visitor opening someone else's public workspace should go to its public page (**settled 2026-11-17:** the "no access" message ships; the redirect is on the backlog, below under "The count"); a script for removing the re-review entries of private workspaces (**answered 2026-11-17: no script**; the review screen withdraws each when an admin acts on it, and the CHANGELOG says so). (The preview pane at 0 px with the tree, console and inspector open in 1024 and 1280 px windows was settled on 2026-11-16: left until the console "mole"; `project-docs/preview-raster-perf/README.md`, "Narrow windows". Note 64 missed that.)

**Before step 8 (2026-11-17):** the full suite passes (9,378); origin/main is still ecbaabc, so the push is a fast-forward; the files migration's local dry run on today's dev data: 397 to migrate, 8 already holding files, 1 orphan approval, 0 errors, every approval's re-review answer unchanged. The migration copies each record whole and swaps only `code` for the files, so `cardAt` and the other fields added in 5a to 5f survive, and the card copy and the migration can run in either order.

**Who can load a workspace (your question, 2026-11-17).** Production (ecbaabc) lets anyone load an approved, public workspace's live files: `getWorkspace` denies only `!isAdmin && !workspace.isPublic && workspace.userId !== userId` (router.ts:378), and the copy route the same (:602). That includes edits not reviewed yet. 5a (answer 10) made both the owner's and the admins' only (`router.ts` `getWorkspace`, :551); it ships with this push. Not a regression: private workspaces were always the owner's only. The open question is only what a visitor sees at such a link. It matters for one more case: Explore, Featured and profile cards link to `/workspace/…` when their index entry has no `ownerHandle` or `slug` (`_worker.ts` :183, :407, :1033). After the push, a visitor clicking such a card gets "You do not have access to this workspace". How many production entries lack them needs a read-only count.

**The count (2026-11-17, read-only, your go-ahead).** Probes in `tmp/2e-step8/` (`count-card-fallbacks.ts`, `check-missing-handles.ts`, `check-legacy-entries.ts`, `legacy-entry-names.ts`):
- **Featured:** 19 cards, all with a handle and a slug. **Profiles:** every index entry has a slug. Neither falls back.
- **Explore:** 16 of 36 entries have no `ownerHandle`, places 21–36 (4 cards on page 1, 12 on page 2). All 16 are your own early workspaces (@ryan), last edited 2026-02-18 to 2026-09-05. Each one:
  - has **no approval record**, so no public page exists to send a visitor to (giving the entry a handle would only turn "no access" into "Workspace not found");
  - has `isPublic: true` on the workspace record, no state row in D1 (so you see it as "unpublished"), and an index entry carrying an older anonymous `userId` (the workspaces were moved to your account later, so your profile page doesn't list them).
- **They predate reviews.** `scripts/backfill-publication-state.ts` was written for exactly these and was never run on production.
- **They also block Make public:** `updateWorkspace` submits only when `!workspace.isPublic` (router.ts:618, the same at ecbaabc), so for these Make public does nothing.
- **Not used:** `backfill-publication-state.ts` (it would approve them unreviewed, in the record shape from before 2e) and `/admin/reconcile-indexes` (it re-sorts `featured:workspaces` and leaves `isPublic` true).

**The fix, ready, waiting on your answer:** `tmp/2e-step8/unpublish-unreviewed.ts` calls the existing admin Unpublish (`POST /admin/unpublish/:id`) for each index entry without an approval record.
- **What Unpublish does,** without needing an approval at ecbaabc or at HEAD: `isPublic` false, off the public and featured indexes, an "unpublished" state row (HEAD also clears the re-review queue).
- **The script:** a dry run by default. `--write` needs `--backup-dir` and saves the index and each record first. The token comes from `ADMIN_TOKEN` or `--token-file` and is never printed.
- **Dev rehearsal,** `tmp/2e-step8/rehearse-legacy-cleanup.ts` (17 checks) and `rehearse-cleanup-script.ts` (16 checks), all pass:
  - before the cleanup, Explore links the card into the playground, a visitor can't load it, and Make public does nothing;
  - after it, the card is off Explore, the other entries are kept in order, `isPublic` is false, and Make public sends the workspace to review.
- **Production dry run:** exactly these 16.

After it, any you want public go through Make public and review like any other workspace.

**Not checked yet:** workspaces with `isPublic: true` and no approval that aren't on Explore have the same stuck Make public. Finding them takes a read-only scan of every production workspace record (about 400 `wrangler` reads). It doesn't block the push, since nothing links visitors to them.

One of the 16 has an id containing "undefined" (`3Yf4qyxq2Pw884m8e9undefinednB`), from an older id generator: today's `generateNanoId` masks into a 64-character alphabet and can't produce it.

Before a `--write` run on production, the script was changed to space its calls 2 s apart. Each Unpublish rewrites `public:workspaces`; KV allows about one write a second to a key, and local KV has no such limit, so the rehearsals can't show it. The dev rehearsal passes again with the change.

**Your answer (2026-11-17): option 2, leave them.** The 16 stay listed, and after the push a visitor clicking one gets "You do not have access to this workspace". So that message is what a blocked visitor sees: the open question from note 64 is settled for this release. The cleanup wasn't run, and neither was the scan. Both are on the backlog ("Public workspaces from before reviews"), with the redirect to an approved workspace's public page as a possible companion.

**Step 8, the push (2026-11-17, your go-ahead).** `ecbaabc8..8716907f`, 100 commits, a fast-forward.
- **No setup to do by hand:** no D1 migrations, no new bindings or secrets, no wrangler or workflow changes since ecbaabc. Production's API was running 175fd45, whose API sources match ecbaabc.
- **Pages** was live at 21:42:19Z.
- **The API deploy** (run 44182210952) started at 21:40:14Z, sat in `actions/checkout` for about 30 minutes on GitHub's side, and finished at 22:14:39Z. Its usual time is about 40 s.
- **So the new playground ran against the old API from 21:42 to about 22:14Z,** which note 47 §8's order ("the API learns the new shape first") was meant to avoid. What that old API did with each request:
  - **Safe:** new workspaces from blank or a template (they send `code`), Copy Workspace and Duplicate (the old copy route, which ignores `description`), and saves of a one-file workspace (`autosave._saveBody` sends `code` while the server holds just main.pathogen).
  - **At risk:** Open as new workspace (it creates with `files` and no `code`, so the old API makes an empty workspace), and a save after adding a second file (the old API ignores `files` and answers as if saved).

  Whether anyone did either needs a read-only look at the records created or updated in that window. **Checked 2026-11-21 (read-only, your go-ahead):** `tmp/2e-step8/check-deploy-window.ts --env prod --confirm` read all 195 workspace records, and none was created or last saved between 21:40 and 22:20Z. The files migration keeps each record's times, so it didn't hide one. A record saved in the window and again later would show the later time; that later save went to the new API, which stores every file the playground holds.
- **Live checks** (`tmp/2e-step8/check-live.ts`, no workspace data): the API answers the 5b card image route ("Workspace not found" for a made-up id) and the card copy route (401 without a token); `/docs` has the workspace files page; both screenshots load as PNGs; the 2e playground's `source-files.js` is served; `/explore` loads.

**Step 8, the files migration (2026-11-17, your go-ahead).** `scripts/migrate-workspace-files-kv.ts --env prod`:
- **The dry run:** 195 workspaces, 20 approvals, `queue:review` (1 entry), `queue:rereview` (5 entries), 2 snapshots. That's 218 to migrate and 1 already holding files: a workspace saved through the new API after it went live, since saves convert records themselves. 0 orphans, 0 errors, and every approval answers the re-review question the same before and after.
- **The write,** with `--backup-dir tmp/kv-backups/files-prod-2026-11-17`: 218 migrated, 201 blobs written (identical texts share one, such as an unedited workspace and its approval), 0 skipped for a concurrent write, 0 errors, re-review answers unchanged.
- **The dry run again:** 219 already, 0 to migrate, 0 errors.
- **The public pages** (`tmp/2e-step8/check-public-pages.ts`, public data only): all 20 `/u/…` pages linked from Explore and Featured load, and each `source.json` carries `files` with the main's text.
- **The reports** name workspace ids, so they stay in `tmp/2e-step8/` (`prod-dry-run.json`, `prod-write.json`, `prod-dry-run-after.json`).

**Step 8, the card copy (2026-11-21, your go-ahead).**
- **You ran it from the browser, signed in as an admin,** since there was no saved production token: `tmp/2e-step8/copy-cards-console.js`, pasted into the console on pathogen.studio. It makes the same calls as `scripts/copy-approval-cards.ts`; `POST /admin/approval-cards` takes an admin's session as well as the token. It counts, asks before writing, copies, then counts again.
- **Rehearsed on dev first,** in headless Chrome, running the snippet's own text (`tmp/2e-step8/rehearse-console-snippet.ts`, 14 checks): not signed in (a 401 that says so), Cancel (nothing written; the API still counts 18), OK (18 copied, none left), and a second run ("Nothing to copy"). Dev's 18 approvals now have cards: 5 are on dev's Explore, 1 with an image and 4 with the placeholder, having no thumbnail.
- **On production:** 20 cards copied in one call, 0 Explore entries repaired; the count after: 0 left, 20 with a card.
- **The public pages** (`tmp/2e-step8/check-card-images.ts`, public data only):
  - before, all 30 card images on Explore, Featured and the profile page were live thumbnails;
  - after, the 20 approved workspaces show their approved card on Explore, Featured (19), the profile page and each of their 20 public pages, and 67 of 67 images load;
  - two approved workspaces that showed the placeholder now show their picture: their Explore entries had no `thumbnailAt`, though R2 held a thumbnail, and the copy reads R2;
  - the live thumbnails and placeholders left on Explore (10 and 6) are the 16 never-reviewed entries, which have no approval and so no card.

## What the audits found (2026-11-14)

### Snapshots, copies, forks

- **The snapshot is captured from the live preview,** which draws the program shown (`snapshot-capture.ts:45-73`; `programToShow`, `workspace-files.ts:153-159`).
  - It sends that program's text alone as `code` (`api.ts:297-318`; `snapshot-controller.ts:335-346`).
  - The server's `code` branch makes a one-file manifest, `main.pathogen` (`snapshots.ts:505-512`, `workspace-store.ts:229-235`).
  - The store keeps no copy of the other files' texts as they were drawn.
- **The snapshots page** reads `/snapshot/:sid/code` (`workspace-snapshots-view.ts:332-338`). It answers 409 for several files, and the page would then show neither the code nor the image (`:315-320`).
  - Copy code and Export read the same route.
  - The playground has no call to `GET /snapshot/:sid/files`.
  - Start new workspace already copies every file (`snapshots.ts:731-777`).
- **Copy Workspace** (the breadcrumb menu, `app-breadcrumb.ts:677-682`) and **Duplicate** (`landing-view.ts:226-228`) open `/workspace/new?copyFrom=`. That form reads `code` and creates with it (`new-workspace-view.ts:283-310`, `:366-397`). `workspaceApi.copy` (`POST /workspace/:id/copy`) has no caller.
- **Open as new workspace** (`_worker.ts:756-773`) reads `source.json` but keeps only `code` (`new-workspace-view.ts:246-281`). `source.json` already sends `files`, `folders` and `entryPoints` (`_worker.ts:523-534`).
- **The copy route copies live files.** `POST /workspace/:id/copy` lets anyone copy a public workspace (`router.ts:699`), but it copies the live files, edits pending re-review included. So forks must go through `source.json`, which serves the approved files.
- **Untested today:** snapshot-controller, the snapshots page, new-workspace-view's copy and fork paths, the Workspaces page's Duplicate, and `renderWorkspaceSourceJson`. 2e's steps add tests for each.

### Publishing, review, the public page

- **The server keeps the whole manifest at every step:** submit, both queues, approve, `GET /admin/approval/:id`, `GET /approval-source/:id` and `source.json`. Everything around it reads one `code` string.
- **Make public, in the breadcrumb, checks the main alone.** `precheckCompile` passes no workspace (`publish-precheck.ts:64`), so a main that imports fails with "this program has no project folder… a playground workspace is one program for now". There is a code comment about it (`app-breadcrumb.ts:729-731`).
- **Make public on the Workspaces page** prechecks `full.code` (`landing-view.ts:242-243`), which only a just-main workspace has. So any other workspace is refused as "Workspace is empty."
- **The review screen** reads `entry.code` only (`admin-moderation-view.ts:44-59`, `:332-379`). An entry with several files shows "Compile failed" and "No source available". **Approve still succeeds, with no SVG** (`:440-442`): the approval has no drawing, so the public page falls back to the live thumbnail.
  - The Approved and Featured tabs read `data.code` only (`:667-680`, `:702-704`, `:736-737`).
  - `sourceError` is never shown.
- **`backfill-approval-svgs.ts`** skips an approval with several files, but counts one with a single file that isn't just main as **failed** (`:225-231`). It compiles with no imports.
- **The admin thumbnail tool** skips a workspace with several files as "has no code" and marks it done (`admin-thumbnails-view.ts:116-125`).
- **The public page** shows only the first entry point's text (`approval-source.ts:75-78`; `_worker.ts:612-618`, `:795-808`). With several files, approved through today's screen, there's no approval SVG, so the hero is the live thumbnail.
- **ViewBox:** a module can't `define ViewBox`, so the main always holds its own, and reading dimensions from the main's text stays right.

### Found along the way: publishing problems that predate phase 2

Each was checked in the code (`router.ts`). None was run.

- **Make public doesn't save first.** The precheck compiles the text in the editor, but the server freezes the last saved version (`router.ts:595-598`). So the review can see an older version than the one checked. `new-workspace-view.ts:290` does flush first.
- **Make private doesn't stop re-review.**
  - The re-review trigger (`router.ts:616-621`) doesn't check `isPublic`, and Make private keeps the approval (`:508-511`), as designed.
  - So after Make private, the next edit queues a re-review. **Approving it makes the workspace public again** (`:1257-1260`), against the owner's choice.
  - Make private also leaves any re-review entry in the queue (`:585-593`).
- **Going back to the approved version** leaves a stale re-review entry: there's a push, but no remove.
- **"Pending re-review"** in the menu is set only when the workspace loads (`workspace-view.ts:822-823`), not after a save.
- **The Workspaces page's Make Public** ignores the pending, rejected and re-review states. It toggles `isPublic` locally (`landing-view.ts:236`, `:253`).
- **An admin can't read an approval's older files on a public workspace.** The file route computes `admin` only when `!mayRead` (`router.ts:764-770`), so for a public workspace it serves only hashes the live manifest names. The review screen needs exactly those older files.
- **The live files of a public workspace are readable by anyone** through `GET /workspace/:id` (`router.ts:435-478`) and the file route, edits waiting for re-review included. Workspace ids appear in public thumbnail and approval-SVG URLs. The playground's own fork path doesn't use them.
- **The Explore, profile and featured cards, and the public page's fallback image, are the live thumbnail** (`_worker.ts:172`, `:381`, `:966`, `:726`, `:605-608`, `:666`, `:673`). It refreshes up to every 10 minutes as the owner edits, so an edit waiting for re-review reaches Explore's card. `docs/publishing.md:45` says the thumbnail is frozen at approval.
- **The thumbnail routes have no visibility check** (`router.ts:903-941`). A private workspace's thumbnail can be read by anyone who knows its id. Ids are random.
- **`docs/publishing.md`** names menu items that don't exist: "Publish workspace" and "Unpublish workspace" (the menu says Make public and Make private), and a "Make this workspace public" option in the new-workspace form, which has none.
