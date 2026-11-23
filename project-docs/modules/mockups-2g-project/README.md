# 2g mockups v1: Download source, and a new workspace from a project

2026-11-23. The states, what they show and the questions they raise are in note 68 (`../68-phase-2g-mockups-v1.md`).

- `<state>-light.png`, `<state>-dark.png`: 14 states in both themes, desktop (1320 px) and phone (390 px).
- `shoot.ts`: makes them. It opens a workspace (2f's gears project) on the dev playground, adds the proposed markup to the real page, and shoots each state. Run it with `npm run dev:stack` up: `npx tsx project-docs/modules/mockups-2g-project/shoot.ts`. The proposals (the menu item, the import section and its CSS, the program-name lines) are the strings at its top. It deletes its workspace when it's done.
