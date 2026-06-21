# Dockerized Web Browsers

Yes, it's dirty, but it works.

A basic setup for my web browser experiments. Starting with Puppeteer first.
- `queue-workers.js` runs multiple browsers with a dedicated `xvfb` display for each.
- - With `xvfb` sessions, we can launch `headless:false` chrome instances
- - no need to start/shutdown a browser for each request. the browsers should stay open.
- `/browse` endpoint receives a web-request, writes it to **redis** queue and waits for its completion.
- - it checks the request status every 70ms with a 30s timeout.


## Configuration

All runtime config is driven by environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3030` | API server port. |
| `BROWSER_COUNT` | `2` | Number of concurrent browser workers / queues. |
| `ACCESS_KEYS` | — | **Required in production.** Comma-separated list of valid API keys. |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string. External by default. |
| `PROXY_DEFAULT`, `PROXY_<CC>` | — | Per-country proxy URLs (e.g. `PROXY_US`). |
| `PUPPETEER_LAUNCH_LOG` | `/tmp/puppeteer-session.log` | Puppeteer log path. |
| `LOG_CLEAN_INTERVAL_MS` | `3600000` | Log cleanup interval. |
| `LOG_CLEAN_STRATEGY` | `delete` | `delete` or `truncate`. |

Access keys come from `ACCESS_KEYS`. For local dev only, an `accessKeys.json`
file (`{ "validKeys": [...] }`) is used as a fallback if `ACCESS_KEYS` is unset
(see `accessKeys.example.json`). The legacy committed `accessKeys.json` is no
longer tracked in git.

## Setup

### Local development

Live source mounts + a bundled Redis, port published on the host:

```sh
cp .env.example .env          # then edit ACCESS_KEYS, proxies, etc.
COMPOSE_PROFILES=bundled-redis \
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Production (plain Docker Compose)

Uses an **external** Redis by default — set `REDIS_URL` to your shared instance:

```sh
ACCESS_KEYS=... REDIS_URL=redis://:pass@host:6379/0 docker compose up -d --build
```

To bundle Redis instead of using a remote one, enable the optional container:

```sh
COMPOSE_PROFILES=bundled-redis REDIS_URL=redis://redis:6379 \
  docker compose up -d --build
```

## Deployment on Coolify (v4.1)

1. Create a **Docker Compose** resource pointing at this repo (uses
   `docker-compose.yml`).
2. Set environment variables in the Coolify UI (mark secrets accordingly):
   - `ACCESS_KEYS`, `REDIS_URL` (your shared/remote Redis), `BROWSER_COUNT`,
     `API_PORT`, and any `PROXY_*` you need.
3. **Redis:** leave the `bundled-redis` profile off and point `REDIS_URL` at your
   existing Redis. To bundle one instead, set `COMPOSE_PROFILES=bundled-redis`
   and `REDIS_URL=redis://redis:6379` (or provision a Coolify Redis resource).
4. Assign a domain to the `web-browsers` service; Coolify's proxy routes to the
   exposed port `3030` (no host port publishing in production).
5. The image runs as a non-root `app` user, with a healthcheck on `GET /`.

## Use 

Check the API server's availability: `curl http://127.0.0.1:3030/`

### Browse endpoint

Fetches a webpage and returns the HTML content:

```sh
curl -X POST http://localhost:3030/browse \
  -H "Authorization: Bearer iserter-sample-access-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://iserter.com"}'
```

### Screenshot endpoint

Captures a screenshot of a webpage and returns it as base64:

```sh
# Using custom viewport dimensions
curl -X POST http://localhost:3030/screenshot \
  -H "Authorization: Bearer iserter-sample-access-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://iserter.com", "viewport": {"width": 1920, "height": 1080}, "proxy_country_code": "DE"}'

# Using viewport preset
curl -X POST http://localhost:3030/screenshot \
  -H "Authorization: Bearer iserter-sample-access-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://iserter.com", "viewport": "iphone-14-pro", "proxy_country_code": "DE", "wait_ms":2000}'
```

#### Available Viewport Presets

**Mobile:**
- `iphone-se` (375×667)
- `iphone-12` (390×844)
- `iphone-14-pro` (393×852)
- `iphone-14-pro-max` (430×932)
- `pixel-5` (393×851)
- `samsung-s20` (360×800)
- `samsung-s21` (384×854)

**Tablet:**
- `ipad-mini` (768×1024)
- `ipad-air` (820×1180)
- `ipad-pro-11` (834×1194)
- `ipad-pro-12.9` (1024×1366)
- `surface-pro-7` (912×1368)

**Desktop:**
- `laptop` (1366×768)
- `desktop` (1920×1080)
- `desktop-4k` (3840×2160)
- `macbook-air` (1440×900)
- `macbook-pro-13` (2560×1600)
- `macbook-pro-16` (3072×1920)

#### Endpoint Options

Both endpoints support the following options:
- `url` (required): The URL to visit
- `headers` (optional): Array of HTTP headers to send
- `method` (optional): HTTP method, defaults to 'GET'
- `proxy_country_code` (optional): Country code for proxy selection
- `randomize` (optional): Enable browser fingerprint randomization (true/false/1/0)
- `viewport` or `windowsize` (optional, screenshot only): 
  - Object with `width` and `height` properties (e.g., `{"width": 1920, "height": 1080}`)
  - String preset name (e.g., `"iphone-14-pro"`, `"desktop"`)

For a quick verification of the API server's availability: `curl http://127.0.0.1:3030/`



### Troubleshooting & Frequently Used Commands 

#### Fix: `ERROR: for ... 'ContainerConfig'` (Ubuntu 24.04 / Cyberpanel)
If you see a Python traceback or `ContainerConfig` error when using `docker-compose`, it means you are using the obsolete v1 version. Install the modern Docker Compose V2 plugin:

```sh
sudo apt update
sudo apt install docker-compose-v2
# Then use 'docker compose' (no hyphen)
docker compose up -d
```

#### Debugging & Commands
```sh
docker exec -it wb-app /bin/bash
npx @puppeteer/browsers install chrome@133.0.6943.53
export PUPPETEER_EXECUTABLE_PATH=/home/app/chrome/linux-133.0.6943.53/chrome-linux64/chrome
export DBUS_SESSION_BUS_ADDRESS=unix:path=/var/run/dbus/system_bus_socket
```

#### Debug DBus
```
ps aux | grep dbus-daemon
dbus-monitor --system
dbus-send --system --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames
```

#### Updating environment (deprecated)

Previously `.env` was copied into a running container with `update-env.sh`.
Config now comes from environment variables — update them in Coolify (or your
compose `.env`) and redeploy/restart the service instead.

### TODO

- implement proxies

## Logging

Puppeteer launcher writes structured JSON lines to `/tmp/puppeteer-session.log` (override with `PUPPETEER_LAUNCH_LOG`). Queue workers write to `/tmp/queue-workers.log` (override with `QUEUE_WORKERS_LOG_FILE`). All paths are forced under `/tmp/`.

## Log Cleanup

An hourly cleanup job (`log-cleaner` in `ecosystem.config.js`) deletes or truncates these debug logs.

Env configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_CLEAN_INTERVAL_MS` | `3600000` | Interval between clean runs (ms). |
| `LOG_CLEAN_STRATEGY` | `delete` | `delete` removes files; `truncate` empties contents. |
| `LOG_FILES` | (auto defaults) | Comma list of log files; relative coerced into `/tmp/`. |

Example:
```bash
LOG_CLEAN_INTERVAL_MS=600000 LOG_CLEAN_STRATEGY=truncate LOG_FILES=puppeteer-session.log,queue-workers.log pm2 start ecosystem.config.js
```

Disable by removing the `log-cleaner` entry or setting a very large interval.