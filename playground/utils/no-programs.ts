// A saved workspace with no program draws nothing (2d, step 9a;
// docs/workspace-files.md "The main"). What it says then, in the words of
// mockup v7's screen X (state 5) and your answer of 2026-11-12 ("'No
// programs' should be fine"). Shared by the breadcrumb, its status, the
// Export shortcut and the Workspaces page. Set Thumbnail's reason, "Add a
// program first", comes from workspace-view's _thumbnailWait.

/** The status in the breadcrumb, and the label on the Workspaces page's card. */
export const NO_PROGRAMS = 'No programs';

/** The status's hover text. */
export const NO_PROGRAMS_WHY = 'Nothing draws: the workspace has no program. Add one with the + in the Files header.';

/** Under Export in the workspace's menu, and the Export shortcut's message. */
export const NO_PROGRAM_EXPORT = "Add a program first: there's nothing to export";

/** Under Make public, in the workspace's menu and on its card. */
export const NO_PROGRAM_PUBLISH = "Add a program first: there's nothing to show";

/** The Snapshot button's hover text. */
export const NO_PROGRAM_SNAPSHOT = "Add a program first: there's nothing to keep";
