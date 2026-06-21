# Make the App Production-Grade (Coolify v4.1 Deployment)

Status: **Implemented (2026-06-21)** — Phases 1–6 done; Phase 5 (process/logging
cleanup) deferred as optional. Verify Chrome launch + healthcheck on first deploy.
Target platform: **Coolify v4.1** (Docker Compose deployment)
Author: review prepared 2026-06-21

---

## 1. Current State Review

A focused audit of the Docker/runtime setup surfaced the following issues. Each
is addressed in the plan below.

### 1.1 Environment variables are not actually wired to the container
- `docker-compose.yml` hardcodes a handful of `environment:` entries (Chrome/DBus
  related) but **none** of the variables in `.env.example` (`API_PORT`,
  `BROWSER_COUNT`, `PROXY_*`, `PUPPETEER_LAUNCH_LOG`).
- Instead, the live `.env` file is **bind-mounted** into the container
  (`./.env:/home/app/.env`) and read by `dotenv`. This works locally but is the
  wrong model for Coolify, which manages env vars in its UI and injects them into
  the container. Bind-mounting `.env` means Coolify's env management is bypassed
  and a `.env` file must exist on the host next to the compose file.
- `update-env.sh` is a workaround for the above (copies `.env` into a running
  container and restarts PM2) — it should become unnecessary.

### 1.2 Access keys are hardcoded in a committed file
- `accessKeys.json` is committed to the repo with sample keys and bind-mounted
  into the container. Real keys would either be committed (bad) or require a
  manual host file (fragile). `src/index.js:74-75` reads this file at boot.

### 1.3 Redis is baked into the app image
- `Dockerfile:24` installs `redis-server` and `start-container.sh:41` runs
  `service redis-server start` inside the same container as the app.
- The code **already supports** an external Redis via `REDIS_URL`
  (`src/web-requests-queue.js:18-20`), so the embedded server is redundant when a
  remote Redis is available.
- The user has a shared production Redis they want to reuse. We need: (a) ability
  to point at a remote Redis via env, and (b) an *optional* bundled Redis
  container for environments without one.

### 1.4 Dockerfile / image hygiene
- Runs as **root** at runtime (`USER root` near the end) despite creating an
  `app` user.
- `chmod -R 777 /home/app` and `chmod -R 777 /tmp` — overly permissive.
- `mv .env.example .env` bakes example/proxy values into the image layer.
- Source code is **bind-mounted** in compose (`./src`, `./util`) — a dev pattern
  that means the deployed image content can drift from what actually runs.
- No `.dockerignore` → `node_modules`, `.git`, logs, etc. are sent to the build
  context.
- Single `RUN` layers are not consolidated; apt caches partially cleaned.

### 1.5 Compose file issues for Coolify
- `version: '3.8'` is obsolete (ignored by Compose v2 / Coolify).
- Depends on an `external` network `sg-network` that must pre-exist — Coolify
  manages its own network/proxy (Traefik), so this will break a clean deploy.
- Publishes `3030:3030` directly; under Coolify, routing is normally done by the
  built-in proxy via domain + `expose`, not host port publishing.
- No `healthcheck`, no `depends_on`, no resource limits.

### 1.6 Process & concerns mixing
- One container runs: dbus, Xvfb, redis, and PM2 with 3 Node processes
  (`api-server`, `queue-workers`, `log-cleaner`). Redis at minimum should be
  separable. (The Node processes + Xvfb are tightly coupled and can stay
  together for now.)

### 1.7 Misc / observability
- No structured healthcheck endpoint distinction (there is `GET /` returning a
  string — usable for health).
- Logs written to `/tmp` and `/home/app/logs`; only `logs` is volume-mounted.
- `.gitignore` ignores `.env` but **not** `accessKeys.json` or `runtime/`.

---

## 2. Goals

1. All runtime config flows through environment variables that Coolify can
   manage — no bind-mounted `.env` or `accessKeys.json` required in production.
2. Access keys provided via env (secret), not a committed file.
3. Redis is **external by default** (point at the shared production Redis via
   `REDIS_URL`), with an **optional** bundled Redis container via a Compose
   profile for standalone/local use.
4. Hardened, smaller, non-root image with a `.dockerignore` and no baked-in
   secrets/examples.
5. A Coolify-friendly `docker-compose.yml`: no obsolete keys, no hard external
   network dependency, healthcheck, sane defaults via `${VAR:-default}`.
6. Backwards-compatible local development path preserved (documented).

---

## 3. Plan

### Phase 1 — Configuration & secrets (code changes)

**1a. Centralize config loading.**
- Add `src/util/config.js` that reads and validates env once:
  - `API_PORT` (default 3030), `BROWSER_COUNT` (default 2),
    `REDIS_URL` (default `redis://localhost:6379`),
    `ACCESS_KEYS`, proxies, log paths.
  - Fail fast with a clear error if a required var (e.g. `ACCESS_KEYS` in
    production) is missing.
- Replace scattered `process.env.X || default` reads in `index.js`,
  `queue-workers.js`, `web-requests-queue.js`, `proxies.js` with this module.
  (Optional but recommended; keeps env handling consistent.)

**1b. Access keys from env.**
- Change `src/index.js:74-90` to load keys from an env var instead of
  `accessKeys.json`:
  - Support `ACCESS_KEYS` as a comma-separated list, e.g.
    `ACCESS_KEYS=key1,key2`.
  - Keep an optional fallback to `accessKeys.json` **only if** the file exists,
    so local dev still works. Production uses the env var.
  - Trim whitespace, ignore empties, reject startup if zero keys in production.
- Remove `accessKeys.json` from the repo (keep an `accessKeys.example.json`),
  and add `accessKeys.json` to `.gitignore`.

**1c. Default `REDIS_URL`.**
- `getRedisUrl()` currently returns `undefined` when unset (node-redis then
  defaults to `localhost:6379`). Make the default explicit and configurable:
  `process.env.REDIS_URL || 'redis://localhost:6379'`. Document the format
  including auth: `redis://:password@host:6379/0`.

**1d. `.env.example` rewrite.**
- Add all real knobs with comments, including new ones:
  ```env
  # --- API ---
  API_PORT=3030
  BROWSER_COUNT=5

  # --- Auth: comma-separated access keys ---
  ACCESS_KEYS=changeme-key-1,changeme-key-2

  # --- Redis (external by default) ---
  # For the bundled optional redis container use: redis://redis:6379
  # For a remote/shared redis use the full URL incl. auth + db index:
  REDIS_URL=redis://:password@your-redis-host:6379/0

  # --- Proxies (PROXY_<CC>) ---
  PROXY_DEFAULT="http://user:pass@host:port"
  PROXY_US="http://user:pass@host:port"
  # ... UK, CA, AU, DE, FR, IT, ES, PL, NL

  # --- Logging ---
  PUPPETEER_LAUNCH_LOG=/tmp/puppeteer-session.log
  LOG_CLEAN_INTERVAL_MS=3600000
  LOG_CLEAN_STRATEGY=delete
  ```

### Phase 2 — Redis: external default + optional bundled container

**2a. Remove embedded Redis from the app image.**
- Delete `RUN apt-get install -y redis-server` from `Dockerfile:24`.
- Remove `service redis-server start` from `start-container.sh:40-41`.

**2b. Add an optional `redis` service behind a Compose profile.**
- In `docker-compose.yml`, define a `redis` service guarded by
  `profiles: ["bundled-redis"]` so it is **not** started by default.
- When using the shared production Redis: set `REDIS_URL` to the remote host and
  do nothing else (profile off → no redis container).
- When standalone: enable the `bundled-redis` profile (Coolify lets you set
  `COMPOSE_PROFILES`, or document `docker compose --profile bundled-redis up`)
  and set `REDIS_URL=redis://redis:6379`.
- Give the bundled redis a named volume for persistence and a healthcheck
  (`redis-cli ping`).

> Note on Coolify: the cleanest production option is to provision Redis as a
> Coolify-managed database resource and inject its connection string as
> `REDIS_URL`. The bundled-redis profile is the fallback for non-Coolify or
> all-in-one deploys. Document both.

### Phase 3 — Dockerfile hardening

- Add **`.dockerignore`**:
  ```
  node_modules
  .git
  .env
  accessKeys.json
  logs
  runtime
  test-results
  playwright-report
  blob-report
  *.log
  Docker.md
  README.md
  tasks
  ```
- Remove `mv .env.example .env` (config comes from env now). Do not bake
  `.env`/keys into the image.
- Drop source **bind mounts** in compose for production (see Phase 4); the image
  should be self-contained (`COPY . .`). Keep a documented dev override.
- Run as **non-root**: end the Dockerfile with `USER app` instead of
  `USER root`. Pre-create `XDG_RUNTIME_DIR`/dbus dirs owned by `app` with `700`,
  not world-writable `777`. Replace `chmod -R 777` with targeted `chown -R app:app`
  + minimal perms on the dirs that truly need write (`/tmp` subdirs, `logs`,
  `runtime`).
  - Caveat: Chrome sandbox needs `SYS_ADMIN` cap (already granted) or
    `--no-sandbox`. Verify the non-root + cap combination still launches Chrome;
    if problematic, keep `seccomp:unconfined` + `SYS_ADMIN` (already present) and
    run Node as `app`.
- Consolidate apt layers and clean caches in the same `RUN` to shrink the image.
- Add a `HEALTHCHECK` (curl `http://localhost:${API_PORT}/`).
- Consider pinning `node:22-slim` to a digest for reproducible builds.

### Phase 4 — Coolify-ready `docker-compose.yml`

Rewrite to:
- Drop `version:` key.
- Remove the `external: true` `sg-network` (let Coolify attach its own network).
  If inter-service comms are needed, use a single internal bridge network or the
  Coolify-provided one.
- Replace hardcoded env block with `${VAR:-default}` interpolation so Coolify's
  injected env (and `.env` locally) drive everything:
  ```yaml
  services:
    web-browsers:
      build: .
      environment:
        - NODE_ENV=production
        - API_PORT=${API_PORT:-3030}
        - BROWSER_COUNT=${BROWSER_COUNT:-5}
        - ACCESS_KEYS=${ACCESS_KEYS}
        - REDIS_URL=${REDIS_URL:-redis://redis:6379}
        - PROXY_DEFAULT=${PROXY_DEFAULT:-}
        - PROXY_US=${PROXY_US:-}
        # ... rest of PROXY_* and Chrome/DBus vars
      expose:
        - "3030"            # Coolify proxy routes to this; avoid host publish
      shm_size: '2gb'
      cap_add: [SYS_ADMIN]
      security_opt: [seccomp:unconfined]
      restart: unless-stopped
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:3030/"]
        interval: 30s
        timeout: 5s
        retries: 3
        start_period: 40s
      volumes:
        - /dev/shm:/dev/shm
        - app-logs:/home/app/logs
        - app-runtime:/home/app/runtime
    redis:
      image: redis:7-alpine
      profiles: ["bundled-redis"]
      restart: unless-stopped
      command: ["redis-server", "--appendonly", "yes"]
      volumes:
        - redis-data:/data
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 10s
        timeout: 3s
        retries: 5
  volumes:
    app-logs:
    app-runtime:
    redis-data:
  ```
- Remove app source bind mounts (`./src`, `./util`, `./.env`, `./accessKeys.json`).
  Provide a separate `docker-compose.dev.yml` override that re-adds them for local
  development.
- `depends_on` redis only meaningfully applies when the profile is on; document
  that external Redis needs no dependency.

### Phase 5 — Process management review (optional, lower priority)

- Keep `api-server` + `queue-workers` + `log-cleaner` under PM2 in one container
  (they share Xvfb/Chrome). This is acceptable.
- Ensure PM2 logs go to the mounted `logs` volume, and that `log-cleaner` targets
  the right files.
- Reconsider whether `log-cleaner` is needed if logs go to stdout (Coolify/Docker
  capture stdout). Optionally switch loggers to stdout and let the platform
  handle rotation; drop `log-cleaner`.

### Phase 6 — Repo hygiene & docs

- `.gitignore`: add `accessKeys.json`, `runtime/`, `*.log`, keep `.env`.
- Remove committed `accessKeys.json`; add `accessKeys.example.json`.
- Update `README.md` / `Docker.md` with:
  - Coolify deployment steps (env vars to set, choosing external vs bundled
    Redis, domain/port, healthcheck).
  - Local dev via `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`.
  - Migration note: `accessKeys.json` → `ACCESS_KEYS`, `.env` mount removed.
- Deprecate/remove `update-env.sh` (Coolify redeploys on env change).

---

## 4. Coolify v4.1 deployment checklist (end state)

1. Create a new **Docker Compose** resource pointing at this repo.
2. Set environment variables in the Coolify UI:
   - `ACCESS_KEYS` (secret), `REDIS_URL` (shared/remote Redis, secret),
     `BROWSER_COUNT`, `API_PORT`, all needed `PROXY_*` (secret).
3. Redis choice:
   - **Shared/remote (preferred):** leave `bundled-redis` profile off; set
     `REDIS_URL` to the remote instance.
   - **Bundled:** set `COMPOSE_PROFILES=bundled-redis` and
     `REDIS_URL=redis://redis:6379`. (Or provision a Coolify Redis resource and
     use its URL.)
4. Set the domain on the `web-browsers` service; Coolify's proxy routes to the
   exposed port `3030`.
5. Confirm `SYS_ADMIN` cap + `seccomp:unconfined` + `shm_size` are honored
   (needed for Chrome). Verify on first deploy.
6. Verify healthcheck passes and `GET /` returns "API server is running".

---

## 5. Suggested implementation order

1. Phase 1 (config + access keys via env) — code.
2. Phase 2 (remove embedded redis, add optional profile).
3. Phase 3 (Dockerfile hardening + `.dockerignore`).
4. Phase 4 (compose rewrite + dev override).
5. Phase 6 (gitignore, remove committed keys, docs).
6. Phase 5 (process/logging cleanup) — optional.

Each phase is independently testable: after Phase 1–2 you can run against the
shared Redis with `ACCESS_KEYS` set; Phases 3–4 finalize the deployable image.

---

## 6. Risks / things to verify

- **Chrome as non-root**: confirm Chrome launches under `USER app` with the
  existing caps; fall back to running Node as `app` while keeping current cap
  setup if needed.
- **Removing `.env`/`accessKeys.json` mounts** breaks current local workflow —
  hence the dev override file and example files.
- **External network removal** (`sg-network`): confirm nothing else relied on
  that shared network; if it did, reintroduce via Coolify network settings.
- **Redis auth/TLS**: ensure `REDIS_URL` supports the shared instance's auth
  scheme (password, and `rediss://` if TLS).
