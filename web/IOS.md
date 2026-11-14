# Helmetto on iPhone (TestFlight)

The iOS app is the same parent app wrapped with [Capacitor](https://capacitorjs.com):
the built web app runs inside a native iOS shell. The Xcode project is in
`web/ios`. You need a Mac with Xcode and an Apple Developer account.

```
scooter chips (ESP8266) ──HTTPS──▶  server on Render  ◀──HTTPS── iPhone app
                                    (one address)     ◀──HTTPS── website
```

The chips never talk to the app. They post telemetry to the server; the app
reads from the same server. So the server has to be online first.

## 0. Everyday testing: just press Run

Pick the **Helmetto** scheme at the top left of Xcode (not "App") and press
**Run**. Before every build it, by itself:

1. pulls the latest code for this branch (never over your own changes),
2. runs `npm install` if packages changed,
3. builds the app for the server and copies it into Xcode,
4. opens a **Helmetto server** Terminal window if the server isn't running.

The app uses this Mac as its server (`http://<your-mac>.local:3000`), which
works in the Simulator and on an iPhone on the same Wi-Fi (allow "find devices
on your local network" when asked). To use another server, e.g. Render, put
its address on one line in `web/ios/server.local` (not committed).

If something failed you get a macOS notification; the details are in
`/tmp/helmetto-xcode.log`.

To reset all demo data: close the server window, then

```bash
find ~/Helmetto/Helmetto/data ~/Helmetto/Helmetto/api/data -name 'scooter.db*' -delete 2>/dev/null
```

and press Run again.

## 1. Put the server online (Render)

1. Render dashboard → **New → Blueprint** → pick this repo, branch
   `claude/scooter-parent-app` (main is currently the gear-safety version).
   `render.yaml` sets everything up; the demo panel is on (`DEMO_MODE=true`).
2. When it's live, open `https://<name>.onrender.com/api/health`. It should say `"ok": true`.
3. Open **Environment** and copy `DEVICE_API_KEY` (for the chips, step 4).

Free plan notes: the server sleeps after about 15 minutes without requests and
takes up to a minute to wake. Its disk isn't kept, so a restart (**Manual
Deploy → Restart service**) also wipes all demo alerts: a quick demo reset.

## 2. Build the iOS app (on your Mac)

```bash
npm install
```

Build the app for your server and copy it into the Xcode project. Run this
again after every change to the app:

```bash
VITE_API_URL=https://<name>.onrender.com npm run ios:sync -w web
```

```bash
npm run ios:open -w web
```

## 3. Run it on your iPhone

In Xcode, select the **App** target → **Signing & Capabilities**:

1. **Team**: your Apple Developer team.
2. **Bundle Identifier**: one your team owns, e.g. `com.yourteam.helmetto`
   (also put it in `appId` in `web/capacitor.config.ts`).

Plug in the iPhone, pick it at the top of Xcode and press **Run** (⌘R). The
first time, turn on **Settings → Privacy & Security → Developer Mode** on the
phone and trust the developer under **Settings → General → VPN & Device Management**.

## 4. Connect the scooter chips to the same server

In `firmware/scooter_esp/telemetry_config.h` (copy of the `.example.h`):

| Setting | Value |
|---|---|
| `TELEMETRY_URL` | `https://<name>.onrender.com/api/devices/scooter-001/telemetry` |
| `TELEMETRY_DEVICE_KEY` | `DEVICE_API_KEY` from Render's Environment tab |
| `TELEMETRY_CA_PEM` | the root certificate of the server, see below |

The ESP8266 checks HTTPS against a root certificate. Find which one Render uses:

```bash
openssl s_client -connect <name>.onrender.com:443 -showcerts </dev/null 2>/dev/null | grep "i:" | tail -1
```

- `ISRG Root X1` → paste <https://letsencrypt.org/certs/isrgrootx1.pem>
- `GTS Root R1` or `GTS Root R4` → paste <https://pki.goog/repo/certs/gtsr1.pem> or `gtsr4.pem`

Then open the iPhone app: the sticker should change from **Waiting for scooter**
to Emma's status within a few seconds of the scooter starting.

## 5. TestFlight

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps → +** → New App,
   with the same bundle identifier.
2. In Xcode pick **Any iOS Device (arm64)**, then **Product → Archive** →
   **Distribute App → App Store Connect → Upload**.
3. After processing (10–30 min), **TestFlight** tab → add **internal testers**
   (people on your team; no review needed). External testers need a short beta review.

Raise the build number (App target → General → Build) before each new upload.

## What works differently in the app

- **Call** opens the phone dialler; **Share location** opens the iOS share sheet.
- **Notifications:** alerts appear while the app is open. Notifications with
  the app closed need Apple push (APNs): a push key from the Apple Developer
  account and a server change. Not built yet.
- The website keeps working at `https://<name>.onrender.com` alongside the app.
