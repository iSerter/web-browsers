require('dotenv').config();
const { startSession, stopSession } = require('./browser/puppeteer-chrome-xvfb/index.js');
const WebRequestsQueue = require('./web-requests-queue.js');
const { buildLogger } = require('./util/logger');

// Initialize dedicated worker log file (can override via QUEUE_WORKERS_LOG_FILE)
const WORKER_LOG_FILE = process.env.QUEUE_WORKERS_LOG_FILE || '/tmp/queue-workers.log';
const workerLogger = buildLogger({ filePath: WORKER_LOG_FILE });
const log = (event, extra = {}) => workerLogger.write({ event, ...extra });

const queueCount = process.env.BROWSER_COUNT || 2;
const queue = new WebRequestsQueue(queueCount);

let workerContexts = [];
const runQueueWorkers = async () => {
  await queue.start();
  log('queue.start', { queueCount });
  const proxy = process.env.PROXY_DEFAULT;
  for (let i = 1; i <= queueCount; i++) {
    try {
      const { browser, xvfbSession } = await startSession({ proxy });
      log('worker.bootstrap.success', { queueNumber: i, wsEndpoint: browser.wsEndpoint(), display: xvfbSession.display });
      startQueueWorker(i, browser);
      workerContexts.push({ queueNumber: i, browser, xvfbSession });
    } catch (err) {
      log('worker.bootstrap.error', { queueNumber: i, message: err.message, stack: err.stack });
    }
  }
};
runQueueWorkers();

const shutdownWorkers = async (signal) => {
  log('shutdown.begin', { signal, workers: workerContexts.length });
  for (const ctx of workerContexts) {
    try {
      await ctx.browser.close();
    } catch (e) {
      log('shutdown.browser.error', { queueNumber: ctx.queueNumber, message: e.message });
    }
    try {
      await stopSession(ctx.xvfbSession);
    } catch (e) {
      log('shutdown.xvfb.error', { queueNumber: ctx.queueNumber, message: e.message });
    }
  }
  log('shutdown.complete');
  process.exit(0);
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdownWorkers(sig)));

const startQueueWorker = async (queueNumber, browser) => {
  while(true) {
    const requests = await queue.getRequests(queueNumber);
    for(let i=0; i<requests.length; i++) {
      const request = requests[i];
      const { id, config } = request;
      const { url, headers, method } = config;
      log('request.start', { queueNumber, id, url, method });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders(headers);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      // wait 50-250ms
      const waitTime = Math.floor(Math.random() * 200) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // scroll back up 
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      // wait 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await page.evaluate(() => {
        return {
          title: document.title,
          html: document.documentElement.outerHTML
        };
      });
      await queue.updateRequestResult(id, result);
      await queue.updateRequestStatus(id, 1);
      await page.close();
      log('request.complete', { queueNumber, id, title: result.title, htmlBytes: result.html.length });
    }
    // wait 70ms 
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
};

const debugQueue = (queue) => {
  //   const reqId = await queue.pushRequest({url: "http://iserter.com"});
  //   console.log(reqId);
  //   console.log(await queue.getRequestStatus(reqId));
  //   console.log(await queue.updateRequestResult(reqId, 'wow'));
  //   console.log(await queue.updateRequestStatus(reqId, 1));
  //   console.log('result',await queue.getRequestResult(reqId));
  //   console.log(await queue.getRequestStatus(reqId));
  //   console.log('del',await queue.deleteRequest(reqId));
  //   console.log(await queue.getRequestStatus(reqId), await queue.getRequestResult(reqId));
  //   console.log(await queue.getRequests());
}