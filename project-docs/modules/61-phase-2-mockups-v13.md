# Phase 2 mockups v13: copying code from an icon in the code panel

2026-11-14. Your direction on v12 (note 60, answer 1), from the snapshots page's screenshot: "what does copy code mean? In the context of the snapshot page, the button feels like it is too far away from the actual code, and there is uncertainty as to which code is being copied...It makes me think that we should be moving the copy code action into an icon button that sits in the top right of the code panel. This seems like the right solution on snapshot page as well as anywhere else where we will be displaying code in the web app (including the primary workspace.)"

## Where to look

The mockup is in `phase-2-mockups-v13/`:
- `multi-file-mockup-v13.html`, also as the BBWP `2026-11-14-14:50:23--multi-file-workspaces--mockup-v13.bbwp.html` (localhost:3001/website/bbwp/);
- a PNG of each state, light and dark: `copy-<state>-<theme>.png`, 15 states.

It has one screen, **C · Copying code**. A click on a file opens it; a click on the icon shows "Copied".

**How it's built.** v13 is v12's built page with one screen in place of v12's five. `build.ts` reads `phase-2-mockups-v12/multi-file-mockup-v12.html` in place. It replaces v12's span from `const SCREENS = {` on, so v12's state helpers stay. The workspace is v8's window, with its breadcrumb, tabs and phone row redrawn without Copy Code. Everything uses the list style you chose.

## Before and after

| | Today (and v12) | v13 |
|---|---|---|
| **The workspace** | Copy Code in the breadcrumb, copying the file in the editor | An icon at the right end of the tabs, before the docs book (state 1), or floating over the code (state 2) |
| **The snapshots page** | Copy code in the breadcrumb, copying the program that drew the image (answer A) | An icon at the right end of the line naming the open file. It copies that file |
| **The review modal** | The viewer's Copy, in its bar; the ↗ | The icon in the code panel; no ↗ for any entry (answer 2) |
| **The public page** | No copy | The icon in the code panel |
| **A blog embed** | The viewer's Copy, in its bar | The icon in the code panel's corner. With the code closed, nothing to copy |
| **One file, anywhere** | | No path line, so the icon floats in the panel's top right corner, over the code |

## What's drawn

- **One icon everywhere.** It copies the file it sits on and names it: "Copy `parts/gears.pathogen`". A blog sample isn't a file, so it says "Copy the code".
  - On the snapshots page, the file shown starts as the program that drew the image.
  - Export's legend still lists the program that drew the image.
  - Naming the file shown isn't question 4(b): nothing says that file drew the image.
- **"Copied" only once the copy has worked** (state 6), for about two seconds. If the browser refuses, the icon shows an × and says to select the text and press ⌘C (state 7). This folds in note 59's "Copied! before the copy finishes".
- **The workspace with no file open** (state 3) has no icon: there's nothing to copy, and the editor's zero-state shows. Today Copy Code stays there, off.
- **Phones:**
  - the workspace's icon stays at the right end of the tabs (state 4), and the control row loses Copy Code;
  - the snapshots page's icon sits at the right end of the file menu (state 15). Its actions row loses Copy code and fits on one line.
- **The floating icon covers the end of the first line or two** in one-file panels (states 8, 10, 12 and 13). The other way would be a slim line above the code with just the icon, at 28 px of height. I kept the float, since it's what you described ("an icon button that sits in the top right of the code panel").

## Your readings to confirm

1. **The icon copies the file shown.** On the snapshots page that replaces answer A, where Copy code always copied the program that drew the image. It also settles note 59's question 1, about the viewer's own Copy.
2. **The review modal's ↗ is hidden for every entry,** one file included, until publishing points at a snapshot (backlog).

## Questions (recommendations first)

1. **Where the workspace's icon goes:**
   - **(a) at the right end of the tabs, before the docs book.** *Recommended:* always visible, and it never covers the text you're typing;
   - **(b) floating over the top right of the code,** as in the one-file panels: nearer the code, but it covers the end of long lines.
2. **Code blocks in the docs and the blog** (the examples on each page, not the embeds) have no copy today. *Recommended: later, on the backlog.* They're built by the docs and blog scripts, a separate change. And the blog can't be rebuilt now without overwriting your blog edits in progress.

## What this changes in work you approved

- **`docs/workspace-files.md`,** approved 2026-11-14: "The file tree and tabs" says "**Copy Code** copies the file in the editor. With no file open, it's off, and so is **Format Document** in the workspace's menu." That becomes the icon at the end of the tabs, absent with no file open. Format Document's half of the line stays.
- **`docs/snapshots.md`,** "What you can do with a snapshot": Copy code leaves the actions, and the icon copies the file shown.
- **v7's screens K and M:** Copy Code in the breadcrumb, kept on one line on a phone.
- **Note 59's requirement 1** (one file looks exactly as today): copying is now the exception, in blog embeds too.
- **Note 59's question 1, and note 58's step 3 bullet on Copy code.**
- **mini-workspace's storybook stories:** Copy moves out of the bar.

Both docs pages change in step 7's docs round, with a content review and your approval.

## After your review

- The icon is built with the screen each step builds:
  - the snapshots page in step 3;
  - the review screen in step 5;
  - the public page in step 6;
  - the workspace and blog embeds with step 3. They share mini-workspace's code panel, and the workspace's change is small.
- Step 2 (the snapshot's manifest records `program`) doesn't wait on this.
