# Snapshots

A **snapshot** saves the picture in your preview together with the exact code that drew it. Press **Snapshot**, name it, and save. Think of it as a photo of a moment in your work, with the recipe written on the back. Tweak a value, press Refresh to roll new random values, and when a variation is worth keeping, take a snapshot and carry on. Later you can browse every snapshot of a workspace, export any of them as SVG, PNG or PDF, or start a new workspace from one.

Snapshots are a Pathogen Studio feature (they aren't available in the CLI or VS Code) and are stored in your account, so you need to be signed in to take them. They're private: only you can see them, and they have nothing to do with [publishing](#publishing-publishing-workspaces) a workspace to Explore. (The publishing page also says "snapshot", meaning the approved version of a workspace that Explore shows. That's a separate thing, and taking snapshots never changes what's published.) Snapshots are deleted along with their workspace, and each account can keep up to 500 (see [Limits](#snapshots-limits)).

## Before you start: random values re-roll

A snapshot keeps the **image** exactly as you saw it. It also keeps the **code**, but code that uses randomness (`random()`, `randomRange()`, or a shuffled `Cycler`) picks new numbers every time it runs. Pathogen has no way to replay the numbers a past run picked.

So:

- **The snapshot itself never changes.** Viewing it or exporting it as SVG, PNG or PDF always gives you the image you captured. Nothing is recompiled.
- **A new workspace started from a snapshot draws a fresh variation.** The code is identical, but the random parts roll again.

If a program uses no randomness, starting a new workspace from its snapshot redraws the same image, as long as current Pathogen runs that code the same way it did when you took the snapshot.

## Taking a snapshot

In the editor, the **Snapshot** button is in the toolbar at the top of the workspace, between **Refresh** and **Console**. It has two halves: the left half takes a snapshot, and the count on the right opens the snapshots page. In fullscreen preview it's the camera button in the right-hand column, under Refresh.

1. Press **Snapshot**. A small panel opens with a thumbnail of what you're about to save.
2. Give it a name, or keep the suggested one (`<workspace name> #<number>`), and optionally add a note.
3. Press **Save snapshot**, or **Enter** in the name field. In the note, **Enter** adds a line and **⌘/Ctrl+Enter** saves.

The panel confirms with **Saved** and a link to the workspace's snapshots. **Undo** in that panel deletes the snapshot you just took.

In fullscreen, each snapshot you take also appears in a small tray in the bottom-right corner. Its **All →** link opens the snapshots page.

### Which code gets saved

A snapshot always pairs the image with the code that **drew that image**, not with whatever is in the editor right now. If you've typed since the preview last finished rendering, the panel tells you so and saves the code from that last render. Your newer edits aren't included.

### When you can't take a snapshot yet

- **While a compile is running.** The button comes back when rendering finishes, so the image and the code always match.
- **When the code has an error.** Fix the error first. A snapshot always pairs the image with code that rendered successfully.
- **When you're signed out.** The button still opens the panel, which asks you to sign in first.

A snapshot belongs to a workspace. If you take one in an unsaved scratch buffer, the panel offers to save the buffer as a new workspace first and lets you name it.

## The snapshots page

Each workspace has its own snapshots page at `/workspace/<your workspace>/snapshots`. To get there:

- click the **count** on the right half of the Snapshot button (`Snapshot | 12 ›`),
- click **View snapshots** in the panel after saving, or
- click **All →** in the fullscreen tray.

The breadcrumb at the top (`Workspaces / Scatter Rings / Snapshots / …`) takes you back to the editor.

The page shows one snapshot at a time in a preview you can pan and zoom, using the same viewer as code examples elsewhere on the site. **Code** opens the snapshot's source beside the image. Below the preview are the snapshot's name, number, date, dimensions, file size and note. Click the note, or the ✎ pencil if it has none yet, to edit it.

Along the bottom, a **filmstrip** shows every snapshot of the workspace, newest first and grouped by day. Click a frame, or use the **←** and **→** keys, to step through them. You can also sort oldest first or show only snapshots that have a note. Each snapshot has its own address (`…/snapshots/7`), so you can bookmark one and come straight back to it.

The preview shows the saved image. Nothing is recompiled, so even heavy artwork appears without waiting for a compile.

### What you can do with a snapshot

The actions sit at the top right of the snapshots page:

- **Copy code**: copies the snapshot's source to the clipboard.
- **Start new workspace**: creates a workspace that contains the snapshot's code and opens it in the editor. It's named after the snapshot, such as `Scatter Rings — dense bottom-left`. A snapshot that kept its default name, such as `Scatter Rings #3`, gives a workspace of that name. The snapshot stays with the original workspace. Random values roll again (see [Before you start](#snapshots-before-you-start-random-values-re-roll)).
- **Export…**: opens the [Export dialog](#exporting-exporting-your-work) on the saved image, with the same SVG, PNG and PDF formats. The legend's source listing is the snapshot's code. The workspace grid isn't part of a snapshot, so it can't be added.
- **⋯ → Rename**: changes the snapshot's name.
- **⋯ → Delete snapshot**: removes it permanently.

## Deleting a workspace deletes its snapshots

Snapshots live inside their workspace. When you delete a workspace, its snapshots are deleted too, and this can't be undone. The delete confirmation tells you how many snapshots will go. Export any you want to keep first. Starting a new workspace from a snapshot keeps its code but not its image, because random values roll again.

Copying a workspace doesn't copy its snapshots.

## Limits

- **500 snapshots per account**, across all workspaces. When you reach the limit, the panel explains why the snapshot can't be saved. To make room, delete snapshots from a workspace's snapshots page. There's no single list of all your snapshots yet, so open each workspace's page in turn. The count on its **Snapshot** button shows how many it holds.
- **50 MB per snapshot image.** Extremely dense artwork, such as thousands of dashed offset strokes, can produce larger SVGs. The panel reports the size and suggests lowering the workspace **Precision** setting or exporting that render directly instead.
- **1 MB of code per snapshot.** Programs larger than this can't be saved as snapshots.

If the upload fails, for example because you've gone offline, the panel keeps your name, note and captured image. **Retry** sends it again without re-rendering, or you can download the SVG instead.
