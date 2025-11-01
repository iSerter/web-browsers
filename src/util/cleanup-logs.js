#!/usr/bin/env node
/**
 * Periodically delete or truncate debug log files used for short-term diagnostics.
 * Defaults:
 *   LOG_CLEAN_INTERVAL_MS = 3600000 (1 hour)
 *   LOG_CLEAN_GLOB = comma-separated file paths under /tmp (exact paths, not wildcards) if LOG_FILES not set
 * Env vars:
 *   LOG_FILES: Comma separated absolute or relative paths (will be forced under /tmp if relative)
 *   LOG_CLEAN_INTERVAL_MS: Interval in ms (e.g. 600000 for 10 min)
 *   LOG_CLEAN_STRATEGY: 'delete' (remove file) or 'truncate' (empty contents). Default 'delete'.
 */

const fs = require('fs');
const path = require('path');

const INTERVAL = parseInt(process.env.LOG_CLEAN_INTERVAL_MS || '3600000', 10); // 1h
const STRATEGY = (process.env.LOG_CLEAN_STRATEGY || 'delete').toLowerCase();

function resolveLogFiles() {
  const envList = process.env.LOG_FILES;
  if (!envList) {
    // default known files
    return ['/tmp/puppeteer-session.log', '/tmp/queue-workers.log', '/tmp/web-requests-queue.log'];
  }
  return envList.split(',').map(f => {
    f = f.trim();
    if (!f) return null;
    if (!path.isAbsolute(f)) {
      f = path.join('/tmp', f);
    }
    if (!f.startsWith('/tmp/')) {
      f = path.join('/tmp', path.basename(f));
    }
    return f;
  }).filter(Boolean);
}

const files = resolveLogFiles();

function log(msg, extra = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event: 'log-cleanup', message: msg, ...extra });
  console.log(line);
}

function cleanOnce() {
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) {
        continue;
      }
      const size = fs.statSync(file).size;
      if (STRATEGY === 'truncate') {
        fs.truncateSync(file, 0);
        log('truncated', { file, prevBytes: size });
      } else {
        fs.unlinkSync(file);
        log('deleted', { file, prevBytes: size });
      }
    } catch (e) {
      log('error', { file, error: e.message });
    }
  }
}

log('started', { intervalMs: INTERVAL, strategy: STRATEGY, files });
cleanOnce(); // initial
setInterval(cleanOnce, INTERVAL);
