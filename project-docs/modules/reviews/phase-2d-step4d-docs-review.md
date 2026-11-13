# Step 4d docs review: three lines of docs/workspace-files.md (2026-11-12)

The design is mockup v11 (note 57), which the user approved: "v11 looks great. Let's proceed". The content-reviewer covered three changed lines, with four personas (UXD, UXE, PM, ID). All three match v11.

## Line "A tab's × closes it…": rewritten

Findings:
- **Must fix:** "the main" came before the page defines it. It's now linked to "The main".
- **Must fix:** "Any file in the tree opens too" repeated the line above it, and read as if files open by themselves. It's folded in: "or you can click any file in the tree".
- **Should:** name the button in bold (**New program**), and use "no programs", as the page does elsewhere.
- **Should:** "Opening the workspace again opens its main" read as if it held with no programs too. It's now in the first bullet, away from the no-program case.
- **Consider:** split it into two bullets. Done.

Now:
- A tab's **×** closes it, and so does a middle-click. You can close every tab. Opening the workspace again opens [the main](#workspace-files-the-main).
- With no tab open, the editor offers to open the main, or you can click any file in the tree. In a workspace with no programs, it offers **New program** instead.

## Line "Copy Code copies the file in the editor…": kept

It's accurate to v8's ⋮ menu and Copy Code, which v11 didn't change. Two optional points weren't taken:
- "wait until a file is open" instead of "off";
- saying that Format Document formats the file in the editor.

## Line "Deleting the last program…": one addition

The old line said what to do next; the new one didn't. Added "until you add a program", from the toast's own words.

Now: "The preview is empty until you add a program, the status in the breadcrumb reads "No program", and `pathogen.json` becomes `{}`."

## For the user and for later steps

- **"No program" against "No programs":** the breadcrumb status (v11) and the Workspaces card label (v7, note 53) differ by one letter, two sentences apart on this page. Both are approved strings; whether to align them is the user's call. Asked in the step 4d report.
  - *Answered 2026-11-12: "'No programs' should be fine."* The page now says the status reads "No programs", like the card. Step 9 builds it with that text.
- **Step 9:** the "No program" status isn't built yet. When it is, its hover text must not say "every file is a library" in a workspace with no files: the mockup's tooltip does in state 6.
