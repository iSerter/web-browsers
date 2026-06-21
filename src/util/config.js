require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Centralized runtime configuration.
 *
 * All config flows through environment variables so the app can be driven by a
 * platform (Coolify, Docker, etc.) without bind-mounting files into the
 * container. For local development a `.env` file and/or an `accessKeys.json`
 * file are still supported as fallbacks.
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Parse a comma- (or newline-) separated list of access keys.
 * @param {string} raw
 * @returns {string[]}
 */
const parseKeyList = (raw) =>
  (raw || '')
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter(Boolean);

/**
 * Resolve the list of valid access keys.
 *
 * Priority:
 *   1. ACCESS_KEYS env var (comma-separated) — the production path.
 *   2. accessKeys.json file (legacy / local dev fallback) — only if present.
 *
 * In production we refuse to start with zero keys to avoid an open API.
 * @returns {string[]}
 */
const loadAccessKeys = () => {
  const fromEnv = parseKeyList(process.env.ACCESS_KEYS);
  if (fromEnv.length > 0) {
    return fromEnv;
  }

  // Fallback: legacy accessKeys.json (local dev only).
  const accessKeysPath = path.join(__dirname, '..', '..', 'accessKeys.json');
  if (fs.existsSync(accessKeysPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(accessKeysPath, 'utf8'));
      const keys = Array.isArray(parsed?.validKeys) ? parsed.validKeys : [];
      if (keys.length > 0) {
        console.warn(
          '[config] Loaded access keys from accessKeys.json. ' +
            'Set ACCESS_KEYS env var for production deployments.'
        );
        return keys;
      }
    } catch (err) {
      console.error('[config] Failed to parse accessKeys.json:', err.message);
    }
  }

  if (isProduction) {
    throw new Error(
      '[config] No access keys configured. Set the ACCESS_KEYS environment ' +
        'variable (comma-separated) before starting in production.'
    );
  }

  console.warn(
    '[config] No access keys configured — API auth will reject every request. ' +
      'Set ACCESS_KEYS to enable access.'
  );
  return [];
};

const config = {
  isProduction,
  port: Number(process.env.API_PORT) || 3030,
  browserCount: Number(process.env.BROWSER_COUNT) || 2,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  accessKeys: loadAccessKeys(),
};

module.exports = config;
