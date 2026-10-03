# Agent guidelines

Raycast extension "Quak for Sonos" for [Quak](https://quak.party), published through the Raycast Store
(`raycast/extensions`). It talks to the Quak API only through [`@quak/js`](https://www.npmjs.com/package/@quak/js).

## Rules for all Quak repos

- **English only in public repos.** README, docs, agent instructions, code comments, UI texts and commit messages are
  English. German planning docs are removed, not translated.
- **One backlog for all repos.** Planning lives in the backlog of the private quak-api repo. This repo has no planning
  or TODO files of its own; open points go there.

## Working on the extension

- **npm for installs** (`npm install`, `package-lock.json`), never `bun install`: the Raycast Store builds with npm.
  Start the dev server with `bun run dev` (or `npm run dev`). Changes to `package.json` (titles, descriptions,
  preferences, commands) only show after restarting it.
- **Gates:** `npx ray lint` and `npx tsc --noEmit -p .`. Don't run `npx ray build` while a dev server runs: the Swift
  build of Talk to Speakers shares `swift/.raycast-swift-build` and locks.
- **Store rules:** MIT, US English, no `navigationTitle` in root commands, no settings commands (configuration goes
  into the preferences), first action = Enter, second = ⌘↵. ⌘P is Raycast's shortcut for the search bar dropdown.
- **Product decisions:** few commands; no browser fallbacks for features; credits show up only after a play below 20 (`LOW_CREDITS` in
  `src/lib/play.ts`) and as "Out of credits" when they run out; workspace defaults apply unless the user saved own defaults per command in the options form;
  limits, `canReplay` and `canSave` come from the API, never hardcoded.
- **Keys** live only in the preferences (up to three, one per workspace), never in links, logs or LocalStorage.
- Commits: `<scope>: <action>`, English, small steps.
