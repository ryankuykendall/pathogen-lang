# Publishing Workspaces

Pathogen Studio's [Explore](/explore) and [Featured](/featured) pages showcase community workspaces. Anyone can browse them; only verified-email accounts can submit, and every submission is reviewed before it appears.

## Who can publish

You can submit a workspace for review once you:

- have signed in via email OTP, and
- have an active account in good standing.

Anonymous (signed-out) drafts and accounts that have not yet verified an email cannot submit. If your account is unable to submit, the **Make this workspace public** option will not appear in the new-workspace form, and the **Publish workspace** action in the editor menu will be hidden.

## Submitting for review

1. Open the workspace you want to submit.
2. From the overflow menu (`⋮`), choose **Publish workspace**.
3. The workspace enters the review queue. Its state is now **Pending review**.

Pending workspaces are not visible on Explore. You can keep editing while you wait — your edits do not change what the reviewer sees, because the code is frozen at the moment of submission.

If a workspace is approved, it appears on [Explore](/explore) at a permanent URL under your handle. If the reviewer also chooses to feature it, the workspace appears on [Featured](/featured) as well.

If a workspace does not become public after review, its state returns to **Not published**. You may revise the workspace and submit it again — each submission is treated as a fresh review.

## Editing a published workspace

Approved workspaces can be edited freely. The version shown on Explore and on your workspace detail page is the snapshot that was reviewed, not the live workspace, so visitors see a stable version that does not change as you continue editing.

If you make changes to an approved workspace, it returns automatically to the **re-review queue** as soon as your code differs from the approved snapshot. Your editor menu shows **Pending re-review** until a reviewer approves the new version. The previously approved snapshot stays on Explore until the new version is reviewed — visitors never see a half-edited workspace.

If a re-submission is not approved, the previously approved version stays public. The owner can either resubmit again or revert their edits to match the approved snapshot.

To remove a workspace from Explore, choose **Unpublish workspace** from the overflow menu. The workspace returns to a private draft. You can resubmit it later — it goes through review again.

## Limits

- **Explore** shows the 100 most recently approved workspaces. Older approvals continue to be reachable at their permanent URL but no longer appear on the Explore grid.
- **Featured** is curated and is limited to 100 entries.

## Workspace URLs

Approved workspaces have a permanent URL of the form `/u/<handle>/<workspace-slug>`. The slug is derived from the workspace name at the moment of approval and remains stable even if you rename the workspace later. If two of your workspaces resolve to the same slug, the second is suffixed with a short identifier so both remain reachable.

The workspace detail page renders the **frozen approved snapshot** — the code, name, description, and thumbnail captured at the moment of approval. Subsequent edits to the live workspace do not change what visitors see at this URL until the new version is approved through re-review.

A breadcrumb at the top of the detail page links back to your profile (`/u/<handle>`) and to the public Explore page.

## Reviewer access

The review queue is gated by an internal allow-list (the `ADMIN_EMAILS` environment variable on the API Worker). There is no self-service path to becoming a reviewer.
