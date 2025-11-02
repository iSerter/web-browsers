const Xvfb = require("xvfb");
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use(puppeteerStealth());
const proxyRouter = require("@extra/proxy-router");
const fs = require('fs');
const path = require('path');
const { buildLogger } = require('../../util/logger');

// Initialize structured logger (always under /tmp)
const LOG_FILE = process.env.PUPPETEER_LAUNCH_LOG || '/tmp/puppeteer-session.log';
const logger = buildLogger({ filePath: LOG_FILE });
const logLine = (o) => logger.write(o);


const stopSession = async (xvfbSession) => {
  try {
    xvfbSession && xvfbSession.stopSync();
  } catch (err) {}
  return true;
};

const startSession = ({ args = [], customConfig = {}, proxy = null }) => {
  return new Promise(async (resolve, reject) => {
    try {
      let xvfbSession = null;
      let chromePath =
        customConfig.executablePath ||
        customConfig.chromePath ||
        puppeteer.executablePath();

      // chromePath = '/usr/bin/google-chrome';

      // Set DBUS_SESSION_BUS_ADDRESS environment variable
      // process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/dbus/system_bus_socket";


      try {
        xvfbSession = new Xvfb({
          silent: true,
          xvfb_args: ["-screen", "0", "2560x1440x24", "-ac"],
        });
        xvfbSession.startSync();
      } catch (err) {
        console.error("Error starting Xvfb", err);
      }

        // Verify chromePath
      if (!chromePath) {
        throw new Error("Chrome path is not defined");
      }

      // Verify xvfbSession
      if (!xvfbSession || !xvfbSession._display) {
        throw new Error("xvfbSession is not properly configured");
      }

      const crashDumpsDir = "/tmp/chrome_crash_dumps";
      const chromeFlags = [
        "--no-first-run",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list",
        "--disable-extensions",
        "--window-size=2560,1440",
        `--crash-dumps-dir=${crashDumpsDir}`,
      ].concat(args);

      proxy = proxy || process.env.PROXY_DEFAULT;
      if (proxy) {
        console.log('Using proxy:', proxy);
        puppeteer.use(
          proxyRouter({
            proxies: { DEFAULT: proxy },
          }),
        );
      }

      const dbusEnv = process.env.DBUS_SESSION_BUS_ADDRESS || null;
      const dbusSocketGuess = dbusEnv && dbusEnv.startsWith('unix:path=') ? dbusEnv.replace('unix:path=','') : null;
      const dbusSocketExists = dbusSocketGuess ? fs.existsSync(dbusSocketGuess) : false;
      logLine({
        event: 'launch.pre',
        chromePath,
        chromeFlags,
        DISPLAY: xvfbSession._display,
        dbusEnv,
        dbusSocketGuess,
        dbusSocketExists,
        cwd: process.cwd(),
        pid: process.pid,
        proxy,
      });

      const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        args: chromeFlags,
        dumpio: true,
        ignoreHTTPSErrors: true,
        devtools: false,
        timeout: 8000, // needed for strange bug. https://github.com/puppeteer/puppeteer/issues/10556#issuecomment-1681602191
        // Merge existing env so we don't drop DBUS_SESSION_BUS_ADDRESS and others.
        env: {
          ...process.env,
          DISPLAY: xvfbSession._display,
        },
        // ignoreDefaultArgs: ['--disable-extensions'], // Disable file watcher
        ...customConfig,
      });

      browser.on("disconnected", () => {
        logLine({ event: 'browser.disconnected' });
        stopSession(xvfbSession);
      });

      try {
        logLine({ event: 'launch.post', wsEndpoint: browser.wsEndpoint() });
      } catch (e) {
        logLine({ event: 'launch.post.error', message: e.message });
      }

      return resolve({
        browser,
        xvfbSession,
      });
    } catch (err) {
  logLine({ event: 'launch.error', message: err.message, stack: err.stack });
      throw new Error(err.message);
    }
  });
};

module.exports = {
    stopSession,
    startSession,
};