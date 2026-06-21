# Major Update Summary — Production-Grade Docker / Coolify Readiness

Date: 2026-06-21
Related plan: [`tasks/make-the-app-production-grade.md`](../tasks/make-the-app-production-grade.md)
Target platform: Coolify v4.1 (Docker Compose deployment)

This update makes the app production-deployable: all config flows through
environment variables, secrets are no longer committed, Redis is external by
default, and the image is hardened and runs as a non-root user.

---

## Phase 1 — Configuration & secrets via environment

- **New `src/util/config.js`** — single place that reads and validates runtime
  config: `API_PORT`, `BROWSER_COUNT`, `REDIS_URL`, and access keys.
  - Access keys come from `ACCESS_KEYS` (comma-separated). Falls back to
    `accessKeys.json` for local dev only.
  - **Fails fast in production** if no keys are configured (prevents an open API).
- `src/index.js` and `src/queue-workers.js` now consume `config` instead of
  scattered `process.env` reads and the hardcoded `accessKeys.json` read.
- `src/web-requests-queue.js` — `REDIS_URL` now defaults explicitly to
  `redis://localhost:6379`.
- `.env.example` rewritten with all real variables documented (`ACCESS_KEYS`,
  `REDIS_URL` including auth/TLS examples, proxies, logging).

## Phase 2 — Redis externalized + optional bundled container

- Removed `redis-server` install from the **Dockerfile** and
  `service redis-server start` from **`start-container.sh`**.
- Production uses an **external** Redis via `REDIS_URL` (e.g. your shared
  instance).
- `docker-compose.yml` gained an **optional** `redis` service behind a
  `bundled-redis` profile — **off by default**. Enable with
  `COMPOSE_PROFILES=bundled-redis` + `REDIS_URL=redis://redis:6379`.

## Phase 3 — Dockerfile hardening

- Runs as **non-root `app`** user (safe: Chrome already launches with
  `--no-sandbox` / `--disable-setuid-sandbox`).
- Removed `chmod -R 777` → targeted `chown app:app`; pre-creates `/run/dbus`
  (owned by `app`) so the non-root dbus socket symlink works.
- Removed `mv .env.example .env` — no config/secrets baked into image layers.
- Consolidated apt layers + cache cleanup into one `RUN`; `npm ci --omit=dev`;
  modern `signed-by` keyring for the Chrome apt repo (replaces deprecated
  `apt-key`).
- Added a `HEALTHCHECK` against `GET /`.
- Removed unused build packages (`build-essential`, `sudo`, `nano`,
  `inotify-tools`) and added `--no-install-recommends` to core deps for a
  leaner image. *(All Node deps are pure-JS — no native build step.)*
- **New `.dockerignore`** excludes `node_modules`, `.git`, `.env`,
  `accessKeys.json`, logs, etc.
- `start-container.sh` ensures `/tmp/.X11-unix` exists for non-root Xvfb.

## Phase 4 — Coolify-ready Compose

- `docker-compose.yml` rewritten:
  - Dropped obsolete `version:` key and the hard `external: sg-network`
    dependency.
  - `${VAR:-default}` interpolation for all env (Coolify/`.env` driven).
  - `expose: 3030` instead of host port publishing (Coolify's proxy routes to
    it); added a healthcheck and the optional profiled `redis` service.
- **New `docker-compose.dev.yml`** override for local dev: live `./src` /
  `./util` mounts, host port publishing, bundled Redis, `.env` + local
  `accessKeys.json` mounts.
- Both prod and dev configs validated with `docker compose config`.

## Phase 5 — Repo hygiene & docs

- `.gitignore` now ignores `accessKeys.json`, `runtime/`, `*.log`.
- Untracked the committed `accessKeys.json` (kept locally for dev); added
  **`accessKeys.example.json`**.
- README: new **Configuration** and **Coolify deployment** sections; local-dev
  and production run commands.
- `Docker.md`: updated run examples (now include `ACCESS_KEYS` / `REDIS_URL` /
  Chrome flags); removed the obsolete SG-network section.
- `update-env.sh`: deprecated with a warning (config is now env-driven; redeploy
  instead of copying `.env` into a running container).

---

## Files changed

**Modified:** `.env.example`, `.gitignore`, `Dockerfile`, `Docker.md`,
`README.md`, `docker-compose.yml`, `start-container.sh`, `update-env.sh`,
`src/index.js`, `src/queue-workers.js`, `src/web-requests-queue.js`

**Added:** `.dockerignore`, `accessKeys.example.json`, `docker-compose.dev.yml`,
`src/util/config.js`, `tasks/make-the-app-production-grade.md`,
`docs/2026-06-21_major-update-summary.md`

**Removed from git tracking:** `accessKeys.json` (file kept locally, now
gitignored)

---

## How to deploy (Coolify v4.1)

1. Create a **Docker Compose** resource pointing at this repo.
2. Set env vars in the Coolify UI (secrets where appropriate): `ACCESS_KEYS`,
   `REDIS_URL` (your shared Redis), `BROWSER_COUNT`, `API_PORT`, `PROXY_*`.
3. Redis: leave `bundled-redis` profile off and point `REDIS_URL` at your
   existing Redis (or set `COMPOSE_PROFILES=bundled-redis` to bundle one).
4. Assign a domain to the `web-browsers` service (proxy routes to port `3030`).

### Local development

```sh
cp .env.example .env   # edit ACCESS_KEYS, proxies, etc.
COMPOSE_PROFILES=bundled-redis \
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

---

## Verify on first deploy

1. **Chrome launches as non-root** — run a `/browse` request and confirm HTML is
   returned (uses `SYS_ADMIN` cap + `seccomp:unconfined`, already set).
2. **Healthcheck passes** — `GET /` returns `API server is running`.
3. **Redis connectivity** — confirm `REDIS_URL` reaches the shared instance
   (auth / `rediss://` for TLS).

## Notes / risk

- `Dockerfile` drops `build-essential` and adds `--no-install-recommends` to core
  deps. If a future native dependency or missing shared lib breaks the build,
  this is the first place to check.
- Phase 5 of the plan (optional process/logging cleanup — e.g. dropping the
  `log-cleaner` in favor of stdout-only logging) was **not** done; deferred as
  optional.
