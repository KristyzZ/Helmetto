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
- Stack: <fill in>
- Run locally: <fill in>
- Env vars: listed in `.env.example` (no real values)
