# Deploying Helmetto

Helmetto runs as **one long-running Node process**: Express serves the API, the
SSE stream and the built web app, and keeps a SQLite file. That rules out
serverless hosts (Vercel/Netlify functions): they cut SSE connections and have
no persistent disk.

Requirements: Node 22.13+ (uses the built-in `node:sqlite`), HTTPS.

| Step | Command |
|---|---|
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health check | `GET /api/health` |

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DEVICE_ID` | yes | e.g. `scooter-001`. Goes into the firmware URL. |
| `DEVICE_API_KEY` | yes | Long random string, e.g. `openssl rand -hex 24`. Goes into the firmware `X-Device-Key` header. Only its hash is stored. |
| `DEVICE_NAME` | no | Shown in the app. |
| `DEMO_MODE` | no | `true` enables the in-app Demo panel. Off by default in production. |
| `DATABASE_PATH` | no | Default `./data/helmetto.db`. Point at a mounted disk to keep history across deploys. |
| `PORT` | no | Set by the host. |

Set secrets in the host's dashboard only. Never commit them.

## Render

1. Render dashboard → **New → Blueprint** → select this repo. `render.yaml` in the repo root does the rest.
2. After the first deploy open the service → **Environment** and copy the generated `DEVICE_API_KEY`.
3. Check `https://<name>.onrender.com/api/health`, then open `https://<name>.onrender.com`.
4. Give the hardware teammate: the host name, `DEVICE_ID`, `DEVICE_API_KEY` (privately) and `shared/PROTOCOL.md`.

Free plan caveats:

- The service sleeps after about 15 minutes without requests and takes up to a
  minute to wake. Open the app a minute before the demo; while the scooter (or
  the simulator) posts every 5 s it stays awake.
- The disk is wiped on every deploy or restart, so alert history and the safe
  zone reset. The device is re-seeded from the env vars on start. To keep data,
  add a Render Disk (paid) and set `DATABASE_PATH=/var/data/helmetto.db`.

## Railway

1. **New Project → Deploy from GitHub repo**.
2. Settings → build command `npm ci --include=dev && npm run build`, start command `npm start`.
3. Variables: the table above (`NODE_ENV`, `DEVICE_ID`, `DEVICE_API_KEY`, …).
4. Settings → Networking → **Generate Domain** for the HTTPS URL.
5. Optional: add a Volume mounted at `/data` and set `DATABASE_PATH=/data/helmetto.db`.

## Smoke test after deploy

```bash
curl https://<host>/api/health
```

```bash
curl -X POST "https://<host>/api/devices/scooter-001/telemetry" \
  -H "Content-Type: application/json" -H "X-Device-Key: <key>" \
  -d '{"helmet_connected":true}'
```

```bash
npm run simulate -- --url https://<host> --key <key> --scenario helmet-disconnect
```
