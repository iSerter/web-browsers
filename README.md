# Dockerized Web Browsers [WIP]

Yes, it's dirty, but it works.

A basic setup for my web browser experiments. Starting with Puppeteer first.
- `queue-workers.js` runs multiple browsers with a dedicated `xvfb` display for each.
- - With `xvfb` sessions, we can launch `headless:false` chrome instances
- - no need to start/shutdown a browser for each request. the browsers should stay open.
- `/browse` endpoint receives a web-request, writes it to **redis** queue and waits for its completion.
- - it checks the request status every 70ms with a 30s timeout.


## Setup

```sh
docker compose up
```

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

```
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

# Copy .env and restart all apps
docker cp .env wb-app:/home/app/.env && \
docker exec wb-app pm2 restart all



### TODO

- run the app with `app` user. (currently chrome is complaining about it)
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