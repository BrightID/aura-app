# Vouch App

The Vouch App is how people join Aura and vouch for each other. A newcomer makes a key and asks people who know them for an endorsement. Those people answer yes or no, and how sure they are. This repo is an experimental version you can use today, on practice data.

It covers two of Aura's domains:
- **Interfold:** before someone can run an Interfold node, Interfold's players have to endorse them as trustworthy.
- **Uniqueness:** BrightID's check that each person has only one account. Players, trainers and managers rate each other, and enough Yes answers move someone up a role.

Use it alone in one browser, or with others in a shared room, where each person's asks and answers show up for everyone within seconds.

**None of it touches the real BrightID network.** Everyone in the practice world is invented, except Philip, Adam and Auryn, who play themselves.

## Try it

- **Solo:** open `index.html` in a browser. Each browser keeps its own practice world.
- **Shared:** run `npm install`, then `TEAM_CODE=local npm run serve`, and open `http://localhost:4811/?room=demo` in two browsers. Both see one world. A room name is 3 to 40 lowercase letters, digits or dashes. `TEAM_CODE` is the code the side drawer asks for when you reset a room. A shared room starts with some activity already waiting for Philip, Adam and Auryn, so a demo has something to answer.

## Where the code is

`index.html` holds the HTML, CSS and JS, with no build step. Search the script for these section banners:

- `// Seed data`: the invented practice world.
- `// Adapter`: `MockAdapter`, which owns all practice state. Every choice about a person passes through `PendingOp`, which gives a 1.5 s window to undo it before it counts.
- `class NodeAdapter`: an outline of the live side. Each method throws "not wired" and names, in a comment, the BrightID call it should make. The app always uses `MockAdapter` today. **Going live takes two pieces of work:** filling in these methods, and the switch that lets the app use them (see Next).
- `// Legos`: the small view functions every screen is built from (`ScreenShell`, `DenseRow`, `StatusChip`, `AnswerControl`, `SendSlot` and others). [`docs/legos.md`](docs/legos.md) describes them.
- `// Screens`, then `// Actions and events`: one function per screen, then click handling.

## How shared practice works

A room's state has two parts. **World** state is shared by everyone in the room: answers, requests, nodes, name grants. **Viewer** state stays in one browser: which person you're playing, which screen you're on, an undo window still open. The comment headed `Shared sync inventory` lists every field and which part it belongs to.

Each world record has a key, plus `updatedAt` and `by`. When two copies of the world differ, the merge keeps the newer record for each key. A deleted record stays in the world, marked `removed`.

The server, in `api/`, keeps one slot per room on Upstash Redis, holding `{ version, generation, world }`:

- `GET /api/world?room=R` reads the slot.
- `PUT /api/world?room=R` sends `{ baseVersion, generation, world }` and writes only if no one else has written since. If someone has, it answers 409 with `{ version, generation, world }`, and the client merges and tries again.
- `POST /api/world/reset?room=R` resets the room, if the request carries the team code, and raises `generation`. The practice cast goes back to the start; real people who joined, and what passed between them, stay (the client sends that part as `keep`). A browser that sees a higher generation drops its own copy and takes the server's, so a tab left open can't restore what the reset cleared.
- `POST /api/claim?room=R` decides who gets an invite. An invite link can be opened in several browsers, but only the first claim wins; the others see "This invite was already used".
- `/api/presence` tracks who is in the room.

`npm run serve` keeps the slots in memory instead of Redis.

## Checks

```
npm install
npx playwright install chromium
npm run test:server   # the room server: writes, conflicts, reset, presence
npm run check         # every browser check in checks/, in parallel (about 3 minutes)
```

The browser checks drive `index.html` with Playwright. They cover:
- a stability test: no control moves when you tap;
- each role's walk through the app;
- the shared world, run as two browsers against a fake server.

## Deploy

`./deploy.sh` publishes the app and server to Vercel, printing each step; it needs the Vercel CLI, logged in. On its first run it makes a room name and a reset code and keeps them in `local/`, which git ignores. **Anyone with a room link can join that room**, so share links only with the people who should play.

The first deploy needs one step in the Vercel web dashboard, because Vercel only creates storage there: open the project's Storage tab, create an Upstash for Redis database, and connect it to the project. Until that's done, the server answers every request with a 500 error, and `deploy.sh` stops and says so.

## Next

Today the app has one connection, all practice. The next change splits it by capability: reading levels, sending evaluations, requests and the rest. Each one can then switch from practice to the real network on its own as `NodeAdapter` gets filled in.

## Design and changes

- **Design.** Every screen follows [`docs/design-principles.md`](docs/design-principles.md).
- **Changes.** Screens, wording, layout, demo data and docs land directly on `main` once every check passes. Changes to what others build on (the room server's API, the world and data shapes, `NodeAdapter`) go through OpenSpec, in `openspec/`.
- **How Aura works.** That's described in `how-aura-works.md` in BrightID/foundations.
- **Licence.** MIT; see `LICENSE`.
