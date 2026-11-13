# TODO

Requests for changes in someone else's area go here, under their name.

## Person 1 — Frontend / UI (/web)
- Check the map on a real phone: tiles, marker movement and the safe-zone editor were only tested in a headless browser without map tiles.
- Test "Add to Home Screen" on Android and iOS.

## Person 2 — Backend / API (/api)
- Parent login: the parent endpoints (state, alerts, geofence, stream) have no auth yet.
- Endpoint to add scooters; today one device is seeded from DEVICE_ID / DEVICE_API_KEY.
- Web push (needs VAPID keys and a subscriptions table) so alerts arrive with the app closed.

## Person 3 — Data / AI logic (/ai)
- Decide whether "helmet not worn" should only alert while the scooter is moving.
- Crash alert currently clears as soon as the scooter reports crash_detected false; consider keeping it until the parent acknowledges.

## Person 4 — Integrations, deploy, pitch demo (/infra, /scripts)
- Firmware (equipment tag): report `equipment_active` (e.g. current sensor or vibration on the tool) so gear is only checked while it runs; until then a reporting device counts as in use.
- Firmware: read `lock` from the telemetry response and drive a relay/lockout; send `locked` back.
- Firmware: with several gear tags, send the `gear` array (one entry per tag) — see shared/PROTOCOL.md.
- Deploy to Render (infra/DEPLOY.md), then put the real host name into shared/PROTOCOL.md and give the hardware teammate DEVICE_ID + DEVICE_API_KEY privately.
- Flash the Arduino example from shared/PROTOCOL.md onto the scooter ESP8266 and confirm HTTPS works from the board.
