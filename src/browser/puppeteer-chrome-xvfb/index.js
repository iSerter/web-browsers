const Xvfb = require("xvfb");
const puppeteer = require("puppeteer");

const stopSession = async (xvfbSession) => {
  try {
    xvfbSession && xvfbSession.stopSync();
  } catch (err) {}
  return true;
};

const startSession = ({ args = [], customConfig = {}, proxy = {} }) => {
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
          xvfb_args: ["-screen", "0", "1920x1080x24", "-ac"],
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
        "--window-size=1920,1080",
        `--crash-dumps-dir=${crashDumpsDir}`,
      ].concat(args);

      if (proxy && proxy.host && proxy.host.length > 0) {
        chromeFlags.push(`--proxy-server=${proxy.host}:${proxy.port}`);
      }

      console.log("Launching browser with the following configuration:");
      console.log(`chromePath: ${chromePath}`);
      console.log(`chromeFlags: ${chromeFlags.join(' ')}`);
      console.log(`DISPLAY: ${xvfbSession._display}`);    

      const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        args: chromeFlags,
        dumpio: true,
        timeout: 8000, // needed for strange bug. https://github.com/puppeteer/puppeteer/issues/10556#issuecomment-1681602191
        env: {
            DISPLAY: xvfbSession._display
        },
        // ignoreDefaultArgs: ['--disable-extensions'], // Disable file watcher
        ...customConfig,
      });

      browser.on("disconnected", () => {
        console.log("Browser disconnected");
        stopSession(xvfbSession);
      });

      return resolve({
        browser,
        xvfbSession,
      });
    } catch (err) {
      console.error(err);
      throw new Error(err.message);
    }
  });
};

module.exports = {
    stopSession,
    startSession,
};