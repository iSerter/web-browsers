# Dockerized Web Browsers [WIP]

Yes, it's dirty, but it works.

A basic setup for my web browser experiments. Starting with Puppeteer first.
- `queue-workers.js` runs multiple browsers with a dedicated `xvfb` display for each.
- - With `xvfb` sessions, we can launch `headless:false` chrome instances
- - no need to start/shutdown a browser for each request. the browsers should stay open.
- `/browse` endpoint receives a web-request, writes it to **redis** queue and waits for its completion.
- - it checks the request status every 70ms with a 30s timeout.


## Setup

### Create image 
```
docker build -t web-browsers .
```

### Launch a container
```
docker run -d -p 3030:3030 --name wb-app web-browsers
```

### via docker-compose (WIP)

```sh
docker compose --profile debian up
```
 or 
```sh
docker compose --profile macos up
``` 
depending on your host system.

## Use 

```sh
curl -X POST http://localhost:3030/browse \
  -H "Authorization: Bearer iserter-sample-access-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://iserter.com", "proxy_country_code": "DE"}'
```

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