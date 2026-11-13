# Helmetto protocol

The contract between the scooter hardware, the API and the parent app.
Any chip (today's ESP8266, later ESP32-C3 / nRF52 behind a gateway) only has to
follow the **Telemetry** section. Nothing else in the system knows what chip it is.

**Stability rule:** changes are additive only. New optional fields and new
endpoints may appear; nothing here is renamed or removed. Devices must ignore
response fields they don't know, and the server ignores request fields it
doesn't know.

- Base URL (local): `http://localhost:3000`
- Base URL (deployed): `https://<your-app>.onrender.com` (HTTPS only)
- All bodies are JSON, `snake_case`, UTF-8. Times are ISO 8601 UTC.
- TypeScript types for everything below: `shared/src/types.ts`.

---

## 1. Telemetry (hardware → server)

```
POST /api/devices/:deviceId/telemetry
Content-Type: application/json
X-Device-Key: <device api key>
```

Send one reading about every **5 seconds** while the scooter is on.

```json
{
  "helmet_connected": true,
  "helmet_worn": null,
  "latitude": null,
  "longitude": null,
  "speed_kmh": null,
  "battery_percent": null,
  "crash_detected": false
}
```

| Field | Type | Meaning |
|---|---|---|
| `helmet_connected` | boolean, **required** | `true` if the equipment heard its gear tag's heartbeat in the last 15 s, else `false`. With several tags: `true` only if all are in range. |
| `helmet_worn` | boolean \| null | Wearing sensor. `null` until the hardware has one. |
| `latitude`, `longitude` | number \| null | Decimal degrees (WGS84). `null` without GPS or without a fix. |
| `speed_kmh` | number \| null | 0–200. |
| `battery_percent` | number \| null | 0–100. |
| `crash_detected` | boolean \| null | `true` while the accelerometer reports a hard impact. `null` if there is no accelerometer. |
| `equipment_active` | boolean \| null, optional | `true` while the equipment is in use: tool switched on, saw running, boat under way. `null`/missing = can't tell; the server then assumes a reporting device is in use. |
| `gear` | array \| null, optional | One entry per paired gear tag: `{"type": "...", "connected": true, "worn": null}`. See below. When present it is used instead of `helmet_connected` / `helmet_worn`. |
| `locked` | boolean \| null, optional | `true` while the equipment is locked out. `null` = no lock hardware. |

#### Gear tags (`gear`)

`type` is one of `helmet`, `eye_protection`, `ear_protection`, `gloves`,
`chaps`, `life_jacket`. `connected` (required) = heartbeat heard in the last
15 s. `worn` = wearing sensor, `null`/missing if the tag has none.

```json
{
  "helmet_connected": false,
  "crash_detected": false,
  "equipment_active": true,
  "gear": [
    { "type": "helmet", "connected": true, "worn": null },
    { "type": "chaps", "connected": false },
    { "type": "ear_protection", "connected": true }
  ],
  "locked": false
}
```

Hardware with a single tag can keep sending only `helmet_connected`: the
server then reads it as the state of the **first** required gear item of that
device (for example safety glasses on an angle grinder). Other required items
show as "no tag" and never raise an alert.

Rules:

- **`null` means "this hardware can't measure it yet".** It is never treated as a
  reading: no alert is raised from a `null`, and the app shows "unknown".
  Optional fields may also be left out entirely; that is the same as `null`.
- Never send placeholder values (`0`, `-1`, `false`) for a sensor you don't have. Send `null`.
- A GPS pair that is out of range, or exactly `0, 0` (no fix), is accepted but
  stored as "no location". It never triggers a geofence alert.
- The device ID and key are created by the server operator (`DEVICE_ID`,
  `DEVICE_API_KEY` in the server environment). Keep the key out of public repos.

### Responses

| Status | Body | What to do |
|---|---|---|
| `200` | `{"ok":true,"received_at":"2026-01-01T12:00:00.000Z","lock":false}` | If the equipment has lock hardware: `lock: true` = keep it locked (can't start); `false` = allow it. Older servers leave `lock` out: treat that as `false`. |
| `400` | `{"error":"invalid_payload","message":"helmet_connected: helmet_connected is required","details":[...]}` | Fix the JSON. `message` says which field. |
| `401` | `{"error":"missing_device_key" \| "invalid_device_key", ...}` | Check the `X-Device-Key` header. |
| `404` | `{"error":"unknown_device", ...}` | Check the device ID in the URL. |

On a network error or 5xx just try again on the next cycle; no retry queue is needed.

### What the server derives

Each device has a profile set in the app: its kind (power tool, chainsaw, boat,
…), the gear it requires, and whether auto-lock is on.

| Situation | Result in the app |
|---|---|
| In use while a required gear tag is not connected, or `worn: false` | Alert **No protection** (once), naming the missing gear |
| Same, with auto-lock on | Alert **No protection** and `lock: true` in every response until the gear is back. The alert stays active while it is locked. |
| Gear missing but the equipment is off (`equipment_active: false`) | Nothing: gear is only required while in use |
| `crash_detected` goes to `true` | Alert **Impact detected** (once) |
| Position leaves the work area (circle or drawn shape) | Alert **Left the work area** (once) |
| **No telemetry at all for 30 s** | **Offline** (gear status becomes unknown) |

Alerts fire on the change only, never once per reading. The matching recovery
(**Safe again**, back in the work area, back online, …) is logged when the
condition ends. So the equipment should keep sending telemetry while gear is
missing; if it stops sending, the manager sees "offline" instead.

### Example: curl

```bash
curl -X POST "http://localhost:3000/api/devices/scooter-001/telemetry" \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: $DEVICE_API_KEY" \
  -d '{"helmet_connected":true,"helmet_worn":null,"latitude":null,"longitude":null,"speed_kmh":null,"battery_percent":null,"crash_detected":false}'
```

A chainsaw running without chaps:

```bash
curl -X POST "http://localhost:3000/api/devices/demo-chainsaw/telemetry" \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: $DEVICE_API_KEY" \
  -d '{"helmet_connected":false,"crash_detected":false,"equipment_active":true,"gear":[{"type":"helmet","connected":true},{"type":"chaps","connected":false},{"type":"ear_protection","connected":true}]}'
```

Single-tag hardware, tag lost:

```bash
curl -X POST "http://localhost:3000/api/devices/scooter-001/telemetry" \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: $DEVICE_API_KEY" \
  -d '{"helmet_connected":false}'
```

### Example: Arduino ESP8266 (HTTPS)

Uses only the libraries that ship with the ESP8266 Arduino core
(`ESP8266WiFi`, `ESP8266HTTPClient`, `WiFiClientSecureBearSSL`).

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>

// ---- fill these in (do not commit real values) ----
const char* WIFI_SSID     = "YOUR_WIFI";        // 2.4 GHz only
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_HOST      = "your-app.onrender.com";
const char* DEVICE_ID     = "scooter-001";
const char* DEVICE_KEY    = "YOUR_DEVICE_API_KEY";
// ---------------------------------------------------

const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long HELMET_TIMEOUT_MS     = 15000;

// Set this to millis() whenever a helmet heartbeat arrives over ESP-NOW.
volatile unsigned long lastHelmetHeartbeat = 0;
unsigned long lastTelemetry = 0;

void setup() {
  Serial.begin(115200);
  // Keep the radio in station mode; if you also use ESP-NOW, both must be on
  // the same WiFi channel as the access point.
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

bool sendTelemetry(bool helmetConnected) {
  if (WiFi.status() != WL_CONNECTED) return false;

  BearSSL::WiFiClientSecure client;
  // Demo shortcut: encrypts the connection but skips certificate checks.
  // For production, pin the CA with client.setTrustAnchors(...) instead.
  client.setInsecure();

  HTTPClient https;
  String url = String("https://") + API_HOST + "/api/devices/" + DEVICE_ID + "/telemetry";
  if (!https.begin(client, url)) return false;
  https.setTimeout(8000);
  https.addHeader("Content-Type", "application/json");
  https.addHeader("X-Device-Key", DEVICE_KEY);

  // Sensors this board doesn't have yet are sent as null.
  String body = String("{\"helmet_connected\":") + (helmetConnected ? "true" : "false") +
                ",\"helmet_worn\":null"
                ",\"latitude\":null"
                ",\"longitude\":null"
                ",\"speed_kmh\":null"
                ",\"battery_percent\":null"
                ",\"crash_detected\":false}";

  int status = https.POST(body);
  if (status != 200) {
    Serial.printf("telemetry failed: %d %s\n", status, https.getString().c_str());
  }
  https.end();
  return status == 200;
}

void loop() {
  unsigned long now = millis();
  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;
    bool helmetConnected =
        lastHelmetHeartbeat != 0 && (now - lastHelmetHeartbeat) < HELMET_TIMEOUT_MS;
    sendTelemetry(helmetConnected);
  }
}
```

Notes for the hardware side:

- The TLS handshake takes 1–2 s on an ESP8266 and needs roughly 20 kB of free
  heap. A 5 s interval leaves enough room.
- To test without HTTPS on the same WiFi, use a plain `WiFiClient` and
  `http://<laptop-ip>:3000/...`.
- When GPS / accelerometer arrive, replace the matching `null` with the value.
  No server change is needed.

---

## 2. App API (app → server)

No authentication in the hackathon build (see README, "Known gaps").

### `GET /api/devices`

All equipment of the account.

```json
{ "devices": [ { "...": "DeviceState, see below" } ] }
```

### `GET /api/devices/:deviceId/state`

```json
{
  "device_id": "scooter-001",
  "name": "Chainsaw",
  "child_name": "Mantas",
  "operator_name": "Mantas",
  "kind": "chainsaw",
  "site": "Pavilniai forest",
  "required_gear": ["helmet", "chaps", "ear_protection"],
  "gear_status": [
    { "type": "helmet", "state": "ok" },
    { "type": "chaps", "state": "missing" },
    { "type": "ear_protection", "state": "ok" }
  ],
  "in_use": false,
  "auto_lock": true,
  "lock_engaged": true,
  "online": true,
  "last_seen_at": "2026-01-01T12:00:00.000Z",
  "telemetry": {
    "helmet_connected": true,
    "helmet_worn": null,
    "latitude": 54.6872,
    "longitude": 25.2797,
    "speed_kmh": 16.2,
    "battery_percent": 86,
    "crash_detected": false
  },
  "last_location": { "latitude": 54.6872, "longitude": 25.2797, "at": "2026-01-01T12:00:00.000Z" },
  "active_alerts": [],
  "geofence": { "shape": "circle", "latitude": 54.6872, "longitude": 25.2797, "radius_m": 250 },
  "zone_status": "inside",
  "server_time": "2026-01-01T12:00:03.000Z"
}
```

- `kind`: `power_tool` | `chainsaw` | `boat` | `scooter` | `other`.
- `operator_name`: who uses it, or `null`. `child_name` carries the same value for older clients.
- `required_gear`: gear that must be present while in use. `gear_status[].state`: `ok` | `missing` | `not_worn` | `unknown` (no tag for it, or offline).
- `in_use`: from `equipment_active` (unknown counts as in use); `null` while offline or never reported.
- `lock_engaged`: the server is currently answering `lock: true` to this device.
- `geofence` is `null` when no zone is set; see `PUT .../geofence` below for its two shapes.
- `online: false` with `last_seen_at: null` → the scooter has never reported.
- `online: false` otherwise → **scooter offline**; `telemetry` is the *last known*
  reading and must not be shown as current (in particular not as "helmet disconnected").
- `active_alerts` ⊆ `unprotected_use`, `crash_detected`, `geofence_exit`, `scooter_offline` (and, from older servers, `helmet_disconnected`, `helmet_not_worn`).
- `zone_status`: `inside` | `outside` | `unknown` (no zone, or no valid GPS in the latest reading).
- `last_location` keeps the last valid GPS fix when newer readings have none.

### `GET /api/devices/:deviceId/alerts?limit=100&before=<id>`

Safety history, newest first. `before` pages further back.

```json
{
  "alerts": [
    {
      "id": 2,
      "device_id": "scooter-001",
      "type": "helmet_reconnected",
      "severity": "recovery",
      "message": "Emma's helmet is connected again.",
      "created_at": "2026-01-01T12:01:10.000Z",
      "latitude": 54.6872,
      "longitude": 25.2797
    },
    {
      "id": 1,
      "device_id": "scooter-001",
      "type": "helmet_disconnected",
      "severity": "alert",
      "message": "Emma's helmet is out of range or switched off.",
      "created_at": "2026-01-01T12:00:40.000Z",
      "latitude": 54.6872,
      "longitude": 25.2797
    }
  ]
}
```

`type` is one of the alert types above (`severity: "alert"`) or a recovery
(`severity: "recovery"`): `protection_restored`, `crash_cleared`,
`geofence_enter`, `scooter_online` (older servers also `helmet_reconnected`, `helmet_worn`).

### `PUT /api/devices/:deviceId/geofence`

Set the work area (safe zone). Returns the new `DeviceState`. Two shapes are accepted.

**Circle** (the original format, unchanged). `shape` may be left out. Radius 50–5000 m.

```bash
curl -X PUT "http://localhost:3000/api/devices/scooter-001/geofence" \
  -H "Content-Type: application/json" \
  -d '{"latitude":54.6872,"longitude":25.2797,"radius_m":250}'
```

**Polygon** (a zone drawn on the map). `points` are the corners in drawing
order; the last one connects back to the first.

```bash
curl -X PUT "http://localhost:3000/api/devices/scooter-001/geofence" \
  -H "Content-Type: application/json" \
  -d '{"shape":"polygon","points":[{"lat":54.6862,"lon":25.2787},{"lat":54.6862,"lon":25.2807},{"lat":54.6882,"lon":25.2807},{"lat":54.6882,"lon":25.2787}]}'
```

Polygon rules (otherwise `400 invalid_payload` with the reason in `message`):

- 3 to 50 points, each with `lat` in -90..90 and `lon` in -180..180.
- The outline must not cross or touch itself, and no point may be repeated.
- Area of at least 400 m².

The zone in every `DeviceState` looks like this:

```json
{
  "shape": "polygon",
  "points": [{ "lat": 54.6862, "lon": 25.2787 }, { "lat": 54.6862, "lon": 25.2807 }, { "lat": 54.6882, "lon": 25.2807 }, { "lat": 54.6882, "lon": 25.2787 }],
  "latitude": 54.6872,
  "longitude": 25.2797,
  "radius_m": 128
}
```

- `shape` is `"circle"` or `"polygon"`. If it is missing, treat the zone as a circle.
- For a circle, `latitude` / `longitude` / `radius_m` are the centre and radius, and there is no `points`.
- For a polygon, the server fills `latitude` / `longitude` / `radius_m` with a
  circle that encloses the shape, so a client that only knows circles still has
  something to draw. The alert logic uses `points`, not this circle.

Alerts work the same for both shapes: **Left the safe zone** once when the
scooter crosses out, **Back in the safe zone** once when it returns. A position
exactly on the edge counts as inside. Readings without valid GPS are ignored.

### `DELETE /api/devices/:deviceId/geofence`

Remove the safe zone. Returns the new `DeviceState`.

### `PATCH /api/devices/:deviceId`

Change the equipment's profile. Send only the fields to change. Returns the new
`DeviceState`. A new gear list or auto-lock setting takes effect at once on the
latest reading.

| Field | Type |
|---|---|
| `name` | string, 1–40 characters |
| `operator_name` (or `child_name`) | string, 1–40, or `null` to clear |
| `site` | string, 1–40, or `null` to clear |
| `kind` | `power_tool` \| `chainsaw` \| `boat` \| `scooter` \| `other` |
| `required_gear` | array of gear types |
| `auto_lock` | boolean |

```bash
curl -X PATCH "http://localhost:3000/api/devices/scooter-001" \
  -H "Content-Type: application/json" \
  -d '{"kind":"power_tool","operator_name":"Tomas","site":"Workshop","required_gear":["eye_protection","ear_protection","gloves"],"auto_lock":false}'
```

### `GET /api/stream` (Server-Sent Events)

Live updates. Named events, each `data:` line is JSON:

| Event | Data | When |
|---|---|---|
| `hello` | `{ "devices": DeviceState[] }` | Once, on connect |
| `state` | `DeviceState` | Every telemetry, offline timeout, geofence change |
| `alert` | `SafetyEvent` (same shape as in `/alerts`) | A new alert or recovery was logged |

A `: keepalive` comment is sent every 15 s. Clients that can't use SSE can poll
`GET /api/devices` instead.

```bash
curl -N http://localhost:3000/api/stream
```

### `GET /api/health`

`{"ok":true,"server_time":"..."}`. Use it to check the deployment is up.

---

## 3. Demo mode

Only when the server runs with `DEMO_MODE=true` (default in local dev). Demo
mode also adds two simulated devices next to the hardware one:
`demo-chainsaw` (forest, auto-lock on) and `demo-boat` (lake).

- `GET /api/demo` → `{ "enabled": true, "running": false, "scenario": null, "device_id": "scooter-001", "runs": [], "devices": ["scooter-001", "demo-chainsaw", "demo-boat"] }`
- `POST /api/demo` with `{"scenario":"<name>","device_id":"demo-chainsaw"}` starts
  or switches that device's simulator (`device_id` defaults to the hardware device).
- `{"scenario":"start-all"}` starts every device in normal use; `{"scenario":"stop"}`
  stops all of them (or only `device_id` if given).

Scenarios: `normal`, `gear-removed`, `gear-back`, `idle`, `crash`,
`geofence-exit`, `offline`. The original `helmet-disconnect`,
`helmet-reconnect` and `helmet-not-worn` still work.

The simulator (also `npm run simulate`) sends real telemetry to
`POST /api/devices/:deviceId/telemetry` with the device key, and obeys `lock`
in the response like lock hardware would, so mock data takes the same path as
hardware.
