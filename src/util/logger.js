const fs = require('fs');
const path = require('path');

// Build a logger bound to a specific file. Ensures directory exists.
function buildLogger({ filePath, echo = true }) {
  if (!filePath) throw new Error('Logger requires a filePath');
  // Force absolute path under /tmp unless absolute provided but not under /tmp.
  if (!path.isAbsolute(filePath)) {
    filePath = path.join('/tmp', filePath);
  }
  if (!filePath.startsWith('/tmp/')) {
    // Always keep logs within /tmp
    filePath = path.join('/tmp', path.basename(filePath));
  }
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}

  function write(obj) {
    const lineObj = { ts: new Date().toISOString(), ...obj };
    const line = JSON.stringify(lineObj) + '\n';
    try {
      fs.appendFileSync(filePath, line, { encoding: 'utf8' });
    } catch (e) {
      // Attempt fallback if original path fails
      try {
        const fallback = '/tmp/fallback.log';
        fs.appendFileSync(fallback, JSON.stringify({ ts: new Date().toISOString(), loggerError: e.message, originalPath: filePath, originalLine: lineObj }) + '\n');
      } catch (_) {}
    }
    if (echo) {
      // Keep console output compact if large html bodies included
      const echoObj = { ...lineObj };
      if (echoObj.html && echoObj.html.length > 500) {
        echoObj.html = echoObj.html.slice(0, 500) + '...[truncated]';
      }
      console.log(JSON.stringify(echoObj));
    }
  }

  return {
    filePath,
    write,
  };
}

module.exports = { buildLogger };