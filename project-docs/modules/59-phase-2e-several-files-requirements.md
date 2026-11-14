# Phase 2e, step 1: showing several files. The requirements

2026-11-14. Your answer 5 on note 58: "distill the requirements first for the experience and then create some mockups." This note says what the snapshots page, the public page and the review screen must do with a workspace of several files. The v12 mockups come after your review of it.

It starts from a read of the three screens' code (2026-11-14). Anything marked *from code, not checked* was read in the code but not seen in a browser.

## Who looks at each screen, and why

| Screen | Who | What they came for |
|---|---|---|
| **Snapshots page** | the owner | the code that drew an older image: to copy it, export it, or start a new workspace from it |
| **Public page** (`/u/:handle/:slug`) | visitors, and the owner | the drawing, how it's made, and a copy of their own (Open as new workspace) |
| **Review screen** | an admin | whether everything the public page will show, files and drawing, is fit to publish |

## Two viewers, one way of moving between files

- **The snapshots page and the review screen's modal** show code in `<mini-workspace>`, the blog's viewer (`playground/components/blog/mini-workspace.ts`): the drawing, with a read-only code pane beside it.
- **The public page doesn't.** Its drawing is a `<mini-preview>` (`playground/utils/detail-hero-mount.ts`), and its source is a closed "View source" section with an editor of its own (`playground/utils/detail-source-mount.ts`).

So note 58's shared pattern (question 5) is one way of moving between files, used in two places: mini-workspace's code pane, and the public page's View source.

## For all three

1. **One file looks exactly as today.** Nothing new appears for a single file. `<mini-workspace>` is shared with places where a change would go unnoticed, so each is checked after the change:
   - the blog's embeds (`website/blog/*.md`);
   - the BBWP `.mw.html` files in `website/bbwp/`;
   - mini-workspace's storybook stories;
   - snapshots made before 2e, which hold one file, `main.pathogen`;
   - one-file workspaces, on all three screens.
2. **It opens on the file that drew the image:**
   - on the public page and the review screen, the main;
   - on the snapshots page, the program the snapshot recorded (answer A).
3. **Every other file is one click or tap away,** named by its path with its folder (`parts/gears.pathogen`). A workspace holds up to 20 files. A long path is shortened, and the whole path shows on hover and once its file is open.
4. **Files look as they do in the workspace's tree.** Programs and modules have the tree's icons. The main has the `main` badge on the tree's rule: only when it isn't `main.pathogen`.
5. **Read-only,** highlighted, with line numbers, as today. Nothing recompiles on the snapshots page.
6. **Phones and touch:** moving between files works with a tap, and nothing is reachable only on hover. mini-workspace's code pane already stacks above the drawing at 768 px and below.
7. **Light and dark,** following a theme change while the page is open.
8. **Keyboard and screen readers:** Tab reaches the file switcher, which says which file is shown; the arrow keys move between files.
9. **A file that can't be read** says so in its place, and the other files still show.

## The snapshots page

| Today | After 2e |
|---|---|
| The page reads `/snapshot/:sid/code`, which answers 409 for a snapshot of several files. The whole viewer then fails, image included (`workspace-snapshots-view.ts:312-319`) | It reads `/snapshot/:sid/files`. The Code panel opens on the program that drew the image, with the other files one click away |
| **Copy code** copies the one file | It copies the program that drew the image (answer A) |
| **Start new workspace** copies every file on the server already | Unchanged. It opens on the main. Its tooltip says "files", not "code" |
| **Export's** legend lists the one file | It lists the program that drew the image. This follows from A; you didn't say it |
| The viewer's ↗ **"Open in playground workspace"** sends one file | Hidden on this page (answer B) |

- **Nothing marks the program that drew the image.** Its name shows only as the file the Code panel opens on, among the others. A label, a badge or a heading naming it is question 4(b), which is held.
- **Snapshots made before 2e** hold one file and look as today.
- Question 1 below: the viewer's own Copy button.

## The public page

| Today | After 2e |
|---|---|
| **View source** shows the main's text alone, and its summary counts that file's lines ("Pathogen · 120 lines", `website/_worker.ts:795-808`) | It shows every approved file, opening on the main. The summary says how many files there are |
| **Open as new workspace** reads only `code`, so with several files the new workspace's main is empty (`new-workspace-view.ts:250-263`, `:367`) | It carries every approved file, the folders and the main, and opens on the main (step 4) |
| The drawing is the main's | Unchanged |
| The code view picks light or dark once, when it loads (`detail-source-mount.ts:83-92`) | It follows a theme change |

- **Visitors see only approved files,** never the live ones. The page and `source.json` already read the approval.
- **The owner's "Open in playground"** is unchanged.
- Question 3 below: which files' text the page holds as served.

## The review screen

| Today | After 2e |
|---|---|
| A queue card compiles `entry.code`. With several files it shows "compile failed" (`admin-moderation-view.ts:340-342`) | It compiles the main with its imports. The card says how many files there are |
| The Review modal says "No source available." | It shows the drawing and every file, opening on the main |
| **Approve** sends no drawing for several files (`:440-442`) | It sends the main's drawing |
| **Approved and Featured** read `data.code`. They show an empty code pane, or "Approval record is missing its source code", and **Regenerate preview** and **Set thumbnail** fail (`:667-737`) | They read the approval's files and compile the main with its imports |
| An entry whose files can't be read (`sourceError`) looks like a compile failure | It says the files couldn't be read |

- **The admin can read every file,** including modules the main doesn't import and other programs, because the public page shows them all.
- **The modal keeps the file the admin is reading** while thumbnails finish. *From code, not checked:* a thumbnail compile that finishes late redraws the whole view, modal included (`:416`, `:943-956`), which would lose it.
- **Approve and Reject stay on the cards,** as now; the modal has neither.
- Questions 4 and 5 below: marking what changed on a re-review, and Approve when the files can't be read.

## Questions (recommendations first)

1. **The viewer's own Copy on the snapshots page.** The viewer's bar has a Copy of its own (`mini-workspace.ts:823-836`). With several files it would copy the file open in the Code panel, so the page's two copy buttons could copy different files.
   - **(a)** hide it on this page, as B hides the ↗ icon. *Recommended:* the page keeps one Copy code, and answer A says what it copies.
   - **(b)** keep it, copying the file the Code panel shows.

   In the review modal, which has no other copy button, the viewer's Copy copies the file shown.
2. **pathogen.json.** The workspace's tree shows it, read-only.
   - **(a)** show it after the other files, read-only. *Recommended:* the same shape as the workspace and a project folder (note 45), and it says which files are programs.
   - **(b)** leave it out. The `main` badge still says which program is the main.
3. **The public page's file text.** As served, the page holds the main's text today, inside the closed View source. A workspace holds up to 20 files of up to 1 MB each.
   - **(a)** the main's text in the page as served, as now. The other files' text loads when View source opens, in one request to `source.json`, which already holds them. *Recommended:* the page stays as light as now for visitors who never open the source. Without scripts, a visitor sees only the main.
   - **(b)** every file's text in the page as served. It works without scripts and shows every file to search engines, but a large workspace makes a heavy page.
4. **On a re-review, mark what changed.** With note 58's question 2 confirmed, an empty folder or Set as main starts a re-review with nothing visibly changed, and the admin can't tell why. Comparing the submitted files with the approved ones by hash, without reading any text, shows:
   - each file as new, changed, moved or removed (removed files listed by name);
   - a line for a new main, and for a folder added or removed.

   *Recommended: yes, in 2e.* Line-by-line differences go on the backlog.
5. **Approve when an entry's files can't be read.** *Proposed:* Approve is off, with the reason, until the files load. Today it would approve files nobody has seen. This changes how moderation works, so it's your call. *Recommended: yes.*

## Found along the way

Each one was read in the code, and a step fixes it if you agree.

- **Snapshots page:** Copy code says "Copied!" before the copy has finished, even when it fails (`app-breadcrumb.ts:643`). Step 3.
- **Snapshots page**, *from code, not checked:* after Rename, the viewer's title keeps the old name until you choose another snapshot. mini-workspace reads `caption` once (`mini-workspace.ts:888-890`); the page sets it later (`workspace-snapshots-view.ts:472`). Step 3.
- **Public page:** the code view doesn't follow a theme change (in the table above). Step 6.
- **Review screen:** some colours are fixed for the light theme, so the dark theme shows light boxes: the error box, two badges, a button, and the white behind thumbnails (`admin-moderation-view.ts:1383`, `:1393`, `:1403-1404`, `:1414-1416`, `:1439`). Step 5.
- **Review screen**, *from code, not checked:* the Rejected and Flagged workspaces cards read `/admin/approval/:id`, which probably answers 404 for a workspace that was never approved (`router.ts:1302`). Step 5 checks it.
- **Out of date:**
  - a comment at `admin-moderation-view.ts:686` says the public page uses mini-workspace;
  - `website/blog/CLAUDE.md:93-111` describes a `code-data` attribute nothing reads.

  Fixed in passing.

## Not in 2e

- Editing in any of these viewers: all three stay read-only.
- Held, or for later (`backlog.md`, "Publishing and snapshots"):
  - naming the program that drew a snapshot (note 58, question 4);
  - a drawing for each program;
  - publishing from a snapshot.
- Line-by-line differences on a re-review, if question 4 is yes.

## What the v12 mockups will show

- **The snapshots page:**
  - a snapshot of four files drawn by the main;
  - one drawn by `demos/gears.pathogen`;
  - one made before 2e.
- **The public page's View source:** closed, open on the main, and open on a module.
- **The review modal:**
  - a new entry;
  - a re-review with its marks, if question 4 is yes;
  - an entry whose files can't be read.
- Each at desktop and phone width, in light and dark.
- Two or three ways of moving between files side by side, to choose from: for example, tabs above the code like the editor's, or a list of files like the workspace's tree.
