# Publishing Workspaces

Pathogen Studio's [Explore](/explore) and [Featured](/featured) pages showcase community workspaces. Anyone can browse them; only verified-email accounts can submit, and every submission is reviewed before it appears.

## Who can publish

You can submit a workspace for review once you:

- have signed in via email OTP, and
- have an active account in good standing.

Anonymous (signed-out) drafts and accounts that have not yet verified an email cannot submit. If your account is unable to submit, **Make public** doesn't appear in the workspace's menu or on your Workspaces page.

## Submitting for review

1. Open the workspace you want to submit.
2. From the workspace's menu (the `⋮` at the right end of the breadcrumb), choose **Make public**. On your Workspaces page, the same item is **Make Public**, in the workspace's own menu.
3. Your latest edits are saved, and then the workspace's [main](#workspace-files-the-main) is checked, with the files it imports. If the save fails, or the main doesn't compile or draws nothing, a message says why and nothing is submitted. With no program, **Make public** is off and says why.
4. The workspace enters the review queue. The menu item now reads **Pending review** (**Pending Review** on your Workspaces page), and is off until a reviewer decides.

Pending workspaces are not visible on Explore. You can keep editing while you wait — your edits do not change what the reviewer sees, because the files are frozen at the moment of submission. Edits you make while it's pending aren't part of this review: once it's approved, your next edit sends them for review. The reviewer sees every file, including modules that no program imports, so leave out of the workspace anything you don't want public.

If a workspace is approved, it appears on [Explore](/explore) with a public page at a URL under your handle ([Workspace URLs](#publishing-workspace-urls)). If the reviewer also chooses to feature it, the workspace appears on [Featured](/featured) as well.

If a workspace does not become public after review, the menu offers **Make public** again. You may revise the workspace and submit it again — each submission is treated as a fresh review.

## Editing a published workspace

Approved workspaces can be edited freely. Explore and your workspace's public page show the version that was reviewed, not the live workspace, so visitors see a stable version that does not change as you continue editing. The card on Explore, Featured and your profile is the image taken when that version was approved.

While the workspace is public, any change to its files, folders or program list sends it back for review the next time the workspace saves: editing a file, adding, renaming, moving or removing one, adding or removing an empty folder, or changing the main or the programs' order. Under **Make private**, the menu says **An edit is waiting for review** until a reviewer decides. The approved version stays on Explore until the new version is approved — visitors never see a half-edited workspace. Undoing your edits so the files match the approved version again withdraws the review.

Renaming the workspace, changing its description or setting its thumbnail doesn't send it for review on its own. The public page shows them after the next approval.

If the new version isn't approved, the approved version stays public and the note under **Make private** goes away; you aren't told why. Your next edit sends the workspace for review again.

To remove a workspace from Explore, choose **Make private** from the workspace's menu, or **Make Private** on your Workspaces page. The workspace returns to a private draft, and an edit waiting for review is withdrawn. You can make it public again later — it goes through review again.

## Limits

- **Explore** shows the 100 most recently approved workspaces. Older approvals continue to be reachable at their URL but no longer appear on the Explore grid.
- **Featured** is curated and is limited to 100 entries.

## Workspace URLs

Approved workspaces have a URL of the form `/u/<handle>/<workspace-slug>`. The slug comes from the workspace's name as it was submitted for review. Renaming the workspace changes its URL when a new version is next approved, and the old URL stops working. If two of your workspaces resolve to the same slug, the second is suffixed with a short identifier so both remain reachable.

The workspace's public page shows the **approved version** — the files, name and description as submitted, and the card image captured at the moment of approval. Subsequent edits to the live workspace do not change what visitors see at this URL until the new version is approved through re-review.

- **The drawing** is the [main](#workspace-files-the-main)'s.
- **View source** shows the main's code. With several files, it lists every approved file beside the code and opens on the main.
- **Open as new workspace** gives a visitor a workspace of their own with every approved file, the folders and the program list, which opens on its main. On your own workspace's page, the button is **Open in playground** and opens the workspace itself.

A breadcrumb at the top of the public page links back to your profile (`/u/<handle>`) and to the public Explore page.

## Reviewer access

The review queue is gated by an internal allow-list (the `ADMIN_EMAILS` environment variable on the API Worker). There is no self-service path to becoming a reviewer.
