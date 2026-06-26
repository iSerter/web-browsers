# Suppress Benign Chromium Log Noise (DevTools / DBus-UPower / GCM)

Status: **Proposed (2026-06-27)**
Context: Reported while deploying the consuming `sage-grids-datahub` stack on
Coolify. The `web-browsers` container floods Coolify's log view with Chromium
startup chatter. The messages are harmless but noisy and grow container logs.

---

## 1. Symptoms

Container stdout repeatedly shows, per browser launch:

```
DevTools listening on ws://127.0.0.1:46809/devtools/browser/<uuid>
[NNN:NNN:MMDD/HHMMSS.uuuuuu:ERROR:dbus/object_proxy.cc:572] Failed to call method:
  org.freedesktop.DBus.Properties.GetAll: object_path=/org/freedesktop/UPower/devices/DisplayDevice:
  org.freedesktop.DBus.Error.ServiceUnknown: The name org.freedesktop.UPower was not provided by any .service files
[NNN:NNN:MMDD/HHMMSS.uuuuuu:ERROR:google_apis/gcm/engine/registration_request.cc:291]
  Registration response error message: DEPRECATED_ENDPOINT
```

## 2. Root cause

All three lines originate from **Chromium**, not the Node app. They reach the
container log because of `dumpio: true` in the Puppeteer launch options:

- `src/browser/puppeteer-chrome-xvfb/index.js:112` — `dumpio: true` forwards
  Chrome's raw stdout+stderr into the Node process stdio (→ PM2 → Docker →
  Coolify).

Per-message origin:
- **`DevTools listening on ws://…`** — printed directly to stderr by Chrome when
  the remote-debugging endpoint opens (Puppeteer always enables it). It does
  **not** pass through Chromium's logging framework, so `--log-level` cannot hide
  it. Once per browser launch.
- **`dbus … UPower … ServiceUnknown`** — Chrome probes the *system* DBus bus for
  power/battery state. `start-container.sh` symlinks a *session* bus that has no
  UPower service, so the lookup fails. Emitted via `LOG(ERROR)`.
- **`gcm … DEPRECATED_ENDPOINT`** — Chrome's push-messaging (GCM) registration,
  firing despite `--disable-background-networking` in `chromeFlags`. Emitted via
  `LOG(ERROR)`.

## 3. Impact

- **Functional:** none. Chrome operates normally without UPower, GCM, or a stderr
  reader. These are environment complaints from a headless Linux container with no
  desktop session — not app errors.
- **Operational:** the only real risk is **unbounded container-log disk growth**
  (Docker `json-file` driver is uncapped by default), made worse by `dumpio: true`
  plus frequent browser launches.

## 4. Plan

### 4.1 Stop forwarding Chrome stdio by default (root cause)
In `src/browser/puppeteer-chrome-xvfb/index.js`, gate `dumpio` behind an env var
so raw Chrome output is opt-in for debugging only:

```js
// was: dumpio: true,
dumpio: process.env.CHROME_DUMPIO === 'true',
```

The structured logger (`/tmp/puppeteer-session.log`) already records meaningful
launch events, so no diagnostic value is lost in normal operation.

### 4.2 Quiet Chromium's internal logger (defense-in-depth)
Add `--log-level=3` to `chromeFlags` (around `index.js:60-80`). Severity 3 = FATAL
only, suppressing the DBus + GCM `ERROR` lines even when `dumpio` is re-enabled.
(Does not affect the one-shot "DevTools listening" line — that bypasses the
logger.)

```js
const chromeFlags = [
  "--no-first-run",
  "--log-level=3",        // suppress INFO/WARNING/ERROR internal logs (dbus, gcm)
  // …existing flags…
].concat(args);
```

### 4.3 Cap container logs (safety net)
Independent of the source, bound log disk usage in every compose file that runs
this image (`docker-compose.yml` here, and the consumer's
`docker-compose.production.yaml` `web-browsers` service):

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

## 5. Acceptance

- With defaults (no `CHROME_DUMPIO`), the three message types no longer appear in
  container stdout / Coolify logs.
- Setting `CHROME_DUMPIO=true` restores full Chrome stdio for debugging, and even
  then the DBus/GCM `ERROR` lines stay suppressed via `--log-level=3`.
- Browser sessions still launch and scrape successfully (no regression from the
  flag change).
- Container log files are size-capped on the host.

## 6. Notes / non-goals

- Not attempting to make UPower or GCM actually work — they are unnecessary for
  headless scraping. Suppression is the correct response.
- `--log-level=3` is broad; if app-level Chrome warnings are ever needed for
  diagnosis, raise it to `--log-level=2` or just set `CHROME_DUMPIO=true`
  temporarily.
