# Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please-action) (v4),
driven by [Conventional Commits](https://www.conventionalcommits.org/).

## How it works

1. Commits land on `main` using Conventional Commit messages
   (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE:`, etc.).
2. The `release-please` workflow (`.github/workflows/release-please.yml`) opens
   and maintains a **Release PR** that bumps the version, updates
   `package.json`, and writes `CHANGELOG.md`.
3. Merging that PR creates a git tag (`vX.Y.Z`) and a GitHub Release.

Version state is tracked in `.release-please-manifest.json`; behaviour is
configured in `release-please-config.json`.

## First release is pinned to 1.0.0

`release-please-config.json` contains `"release-as": "1.0.0"` so the next
release is **1.0.0** regardless of commit history (the manifest is seeded at the
last tag, `0.0.1`).

> **Important:** `release-as` is "sticky" — it will keep proposing `1.0.0` until
> removed. **After the 1.0.0 Release PR is merged, delete the `"release-as":
> "1.0.0"` line** from `release-please-config.json` so subsequent versions are
> computed from Conventional Commits again.

Alternatively, the one-time equivalent is a commit footer `Release-As: 1.0.0`
instead of the config key.

## Repository settings required

- Settings → Actions → General → **Allow GitHub Actions to create and approve
  pull requests** must be enabled.
- The workflow uses the default `GITHUB_TOKEN`. PRs it opens will **not** trigger
  other workflows (e.g. CI). If you need that, create a PAT, store it as a
  secret, and set `token:` in the workflow to it.

## Conventional Commit quick reference

| Prefix | Bump | Changelog section |
|--------|------|-------------------|
| `fix:` | patch | Bug Fixes |
| `feat:` | minor | Features |
| `feat!:` / `BREAKING CHANGE:` | major | (breaking) |
| `perf:` | patch | Performance Improvements |
| `docs:`, `build:`, `deps:` | patch | shown |
| `chore:`, `ci:`, `refactor:`, `test:` | none/patch | hidden |
