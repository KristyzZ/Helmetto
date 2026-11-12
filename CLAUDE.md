# Team rules (hackathon)

## Who owns what
| Person | Area | Folders |
|---|---|---|
| Person 1 | Frontend / UI | /web |
| Person 2 | Backend / API | /api |
| Person 3 | Data / AI logic | /ai |
| Person 4 | Integrations, deploy, pitch demo | /infra, /scripts |

- Only edit files inside YOUR area.
- If you need a change in someone else's area, add it to TODO.md under their name. Do not edit their files.
- Before editing anything outside your folder, stop and ask the user.

## Shared contract
- `shared/` (types, API routes, data schema) is the contract between areas.
- Changes there must be additive only: add fields or endpoints, never rename or remove.
- Tell the user when you change `shared/` so they can tell the team.

## Git workflow
- Never commit to main directly. Work on a branch: `<name>/<feature>`.
- Before starting work: `git pull --rebase origin main`.
- Commit small and often, with clear messages.
- Merge to main at least every 1–2 hours. Pull main first, make sure the app runs, then merge.
- Never force-push main. Never commit `.env` or secrets.

## Parallel sessions on one laptop
If more than one Claude session runs on the same machine, each one works in its own git worktree, never in the same folder:
`git worktree add ../<repo>-<task> -b <name>/<task>`

## Project basics
- Stack: npm workspaces, TypeScript everywhere, Node 22.13+.
  - `web/`: Vite + React, Leaflet + OpenStreetMap, PWA.
  - `api/`: Express 5, SQLite via built-in `node:sqlite`, zod, Server-Sent Events. Serves `web/dist` in production.
  - `ai/`: pure safety rules, tested with vitest. The API calls these; keep them free of I/O.
  - `shared/`: types, route constants, `PROTOCOL.md` (the hardware contract).
  - `scripts/`: `simulate.ts` mock scooter; `scripts/lib/simulator.ts` is also used by the API's demo endpoint.
- Run locally: `npm install`, then `npm run dev` (api on :3000, web on :5173). Mock scooter: `npm run simulate`.
- Checks before merging: `npm test` and `npm run typecheck`.
- Deploy: one Node service on Render/Railway, see `infra/DEPLOY.md`.
- Env vars: listed in `.env.example` (no real values)
