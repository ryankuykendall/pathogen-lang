# Phase 2 mockups v12: several files on the snapshots page, the public page and the review screen

2026-11-14. Note 58, step 1, after the requirements in note 59 and your answers to them. Your words on note 58's question 5: "distill the requirements first for the experience and then create some mockups."

## Where to look

The mockup is in `phase-2-mockups-v12/`:
- `multi-file-mockup-v12.html`, also as the BBWP `2026-11-14-14:25:40--multi-file-workspaces--mockup-v12.bbwp.html` (localhost:3001/website/bbwp/). The three earlier copies that day lack the follow-up fixes;
- a PNG of each state, light and dark: `<screen>-<state>-<theme>.png`, 22 states.

**The harness:**
- five screens: **F**, **S**, **P**, **R** and **N**;
- each screen's states, as chips;
- a switch at the top right, "Switch files with: List · Tabs · One after another", which redraws S, P, R and N in any of the three styles, phones included. The PNGs use the list, and the state descriptions describe it.

**What you can click:**
- a file opens it;
- View source opens and closes;
- a line of the re-review box opens its file;
- the phone's menu opens the sheet.

**How it's built.** v12 is v11's built page with five screens in place of v11's one. `build.ts` reads `phase-2-mockups-v11/multi-file-mockup-v11.html` in place, and `--bbwp` also writes the BBWP copy. The looks are copied from today's code:
- the blog viewer, from `mini-workspace.ts`. Its code colours (the GitHub theme) are approximate;
- the snapshots page and its filmstrip;
- the public page, from `workspace-detail.css`;
- the review screen, from `admin-moderation-view.ts`.

The example workspace is the one every mockup since v6 uses: six files and `pathogen.json`.

## Before and after

| | Today | v12 |
|---|---|---|
| **Snapshots page,** a snapshot of several files | Fails to open, image included | The Code panel shows the files in the tree's order, with the program that drew the image selected |
| **Snapshots page,** Copy code | The one file | The program that drew the image (answer A), whichever file is open. Its tooltip doesn't name it |
| **Snapshots page,** the viewer's ↗ and its own Copy | Shown | Hidden for every snapshot (answer B, note 59 Q1) |
| **Public page,** View source | The main's text; "Pathogen · N lines" | Every approved file, opening on the main; "Pathogen · 7 files" |
| **Public page,** as served | The main's text | The main's text and every file's name. The other texts load when View source opens (note 59 Q3) |
| **Review,** a card with several files | "compile failed" | The main's drawing; "7 files" in the meta line |
| **Review,** the modal | "No source available." | The drawing and every file, opening on the main |
| **Review,** a re-review | Nothing says what changed | A box lists the changes, and its lines open the files. A small badge with the same sign and colour marks each file in the list: + new, • changed, → moved, − removed |
| **Review,** files that can't be read | Looks like a compile failure; Approve works | Said on the card and in the modal; Approve is off |
| **One file,** anywhere | | Exactly as today (S4, P5, R7). On the snapshots page the ↗ and Copy are hidden, as B and Q1 say |

## What's drawn

**F · Three ways to move between files.** The same snapshot in each style, in the snapshots page's code pane (about 600 px; the review modal's is narrower, about 520 px):
1. **A list beside the code** (recommended). The tree's rows, with folders, icons, the `main` badge rule and `pathogen.json` last. A line above the code names the open file with its folder.
2. **Tabs above the code,** labelled as the editor labels them: no `.pathogen`, and a folder only where two names clash. With seven files, `pathogen.json` is already past the pane's edge, and folders are hidden.
3. **One after another:** every file in one scroll under its heading, opening scrolled to the file that drew the image, with a Jump to menu.

**Every style keeps the tree's order.** The file that drew the image is selected, not moved: putting it first would name it, and naming it is held question 4(b).

**S · The snapshots page:**
- **S1:** a snapshot drawn by the main, with the viewer's bar open to show what's left in it (no Copy) and no ↗;
- **S2:** another file opened;
- **S3:** a snapshot drawn by `demos/gears.pathogen`, with Copy code's tooltip ("Copy the code that drew this image");
- **S4:** a snapshot made before 2e: one file, today's code pane.

**P · The public page:**
- **P1:** View source closed. Its count comes from the names served with the page;
- **P2:** just opened. The list and the main's text are there; the other files are loading, in one request to `source.json`;
- **P3:** a module open;
- **P4:** the request failed. The main's text still shows, and the other rows and the list say so, with Try again;
- **P5:** one file, as today.

So **step 6 serves every file's name in the page.** The texts come from `source.json`.

**R · The review screen:**
- **R1:** the queue, with a card of seven files and a card of one;
- **R2:** the modal for a new entry;
- **R3:** a re-review where files changed: a file changed, one new, one removed, and the program list. The removed file stays in its place, struck out;
- **R4:** a re-review where no file's text changed: a move, an empty folder, and the program list's order. Without the box, this one would look like nothing changed;
- **R5:** a card whose files can't be read;
- **R6:** that entry's modal;
- **R7:** one file, as today.

**Two things the hash comparison decides:**
- A file renamed *and* edited shows as removed and new, not moved.
- `pathogen.json` shows as changed whenever the program list changes, even when only its order changes.

**N · On a phone** (390 px):
- the list becomes a menu above the code, naming the open file and the count;
- a tap opens the files as a sheet;
- the public page uses the same menu.

## Questions (recommendations first)

1. **Which way to move between files** (screen F):
   - **(1) a list beside the code.** *Recommended.* It's the only one that shows folders, holds 20 files, and looks like the workspace's tree. It costs about 190 px of the code pane.
   - **(2) tabs;**
   - **(3) one after another.**
2. **The ↗ in the review modal.** The modal's viewer has the same ↗ "Open in playground workspace" as the snapshots page's, and with several files it sends one file.
   - **(a) hide it when there are several files,** keeping it for one file, as today. *Recommended.* Drawn this way in R2 to R4.
   - **(b) keep it,** sending one file.

Also for your eye: the badges in the list. With words ("changed") in the list, names in the modal's narrow pane were cut short, to `gears.pa…`. So the list has a small badge with a sign and a colour, and the words are in the box and in the open file's line. The sign means the badges don't rest on colour alone.

## After your review

- The style you choose becomes the one built.
- **Step 2,** `program` in the snapshot's manifest, doesn't wait on this review.
- **Step 3** builds the snapshots page, **step 5** the review screen, and **step 6** the public page, each as drawn here once you've approved it.
- Note 58's step 1 is then done.
