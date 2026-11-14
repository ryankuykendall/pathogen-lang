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
   - Publish `docs/workspace-files.md`: its `DOC_FILES` line; the header comment out; `[month]`; the snapshot sentence; the publishing-and-main wording; the screenshot, in light and dark.
   - Bring four published pages up to date:
     - `projects.md`: "The playground can't read files yet", and its In each tool bullet;
     - `modules.md`: its intro line, its In each tool bullet, and the "No project folder" error row;
     - `snapshots.md`: several files, the no-program reason, the size limit;
     - `publishing.md`: the main and every file; the menu items' real names; the frozen image, if 9 is yes.
   - A content review, then your approval.
   - The CHANGELOG, covering 2b to 2e.
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
