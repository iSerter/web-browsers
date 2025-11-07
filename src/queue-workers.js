require('dotenv').config();
const { startSession, stopSession } = require('./browser/puppeteer-chrome-xvfb/index.js');
const WebRequestsQueue = require('./web-requests-queue.js');
const { buildLogger } = require('./util/logger');
const { getAvailableProxies } = require('./util/proxies');
const Browsers = require('./util/browsers');
const { randomizePuppeteerPage, savePageDefaults, restorePageDefaults } = require('./util/puppeteer-randomizer');

// Initialize dedicated worker log file (can override via QUEUE_WORKERS_LOG_FILE)
const WORKER_LOG_FILE = process.env.QUEUE_WORKERS_LOG_FILE || '/tmp/queue-workers.log';
const workerLogger = buildLogger({ filePath: WORKER_LOG_FILE });
const log = (event, extra = {}) => workerLogger.write({ event, ...extra });

// Global error handlers to catch unhandled errors
process.on('uncaughtException', (error) => {
  log('uncaughtException', { message: error.message, stack: error.stack, name: error.name });
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log('unhandledRejection', { 
    reason: reason instanceof Error ? reason.message : String(reason), 
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const browserCount = process.env.BROWSER_COUNT || 2;
const queue = new WebRequestsQueue(browserCount);

const proxies = getAvailableProxies();
const browsersUtil = new Browsers();
const browsers = [];
let proxyPointer = 0;

let workerContexts = [];
const runQueueWorkers = async () => {
  await queue.start();
  log('queue.start', { queueCount: browserCount, availableProxies: proxies.length });
  
  for (let i = 1; i <= browserCount; i++) {
    try {
      // Pick proxy for this browser
      let proxy = process.env.PROXY_DEFAULT;
      let countryCode = '';
      
      if (proxies.length > 0) {
        const selectedProxy = proxies[proxyPointer];
        proxy = selectedProxy.proxy;
        countryCode = selectedProxy.countryCode;
        // Move proxy pointer for next iteration
        proxyPointer = (proxyPointer + 1) % proxies.length;
      }
      
      const { browser, xvfbSession } = await startSession({ proxy });
      log('worker.bootstrap.success', { 
        queueNumber: i, 
        wsEndpoint: browser.wsEndpoint(), 
        display: xvfbSession.display,
        countryCode: countryCode
      });
      
      startQueueWorker(i, browser);
      workerContexts.push({ queueNumber: i, browser, xvfbSession });
      
      // Add browser info to browsers array
      browsers.push({
        queueNumber: i,
        countryCode: countryCode,
        wsEndpoint: browser.wsEndpoint(),
        display: xvfbSession.display
      });
    } catch (err) {
      log('worker.bootstrap.error', { queueNumber: i, message: err.message, stack: err.stack });
    }
  }

  // Write browsers array to browsers.json using the Browsers utility
  const browsersJsonPath = browsersUtil.writeBrowsersFile(browsers);
  log('browsers.json.written', { path: browsersJsonPath, count: browsers.length });
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
    try {
      const requests = await queue.getRequests(queueNumber);
      for(let i=0; i<requests.length; i++) {
        let page = null;
        try {
          const request = requests[i];
          const { id, config } = request;
          const { url, headers, method, randomize, type = 'browse', viewport, waitMilliseconds } = config;
          log('request.start', { queueNumber, id, url, method, type, randomize: !!randomize });
          
          page = await browser.newPage();

          log('request.page.created', { queueNumber, id });
          
          // Set viewport if provided (for screenshot requests)
          if (viewport && viewport.width && viewport.height) {
            await page.setViewport({
              width: viewport.width,
              height: viewport.height
            });
            log('request.viewport.set', { queueNumber, id, viewport });
          }
          
          // Save defaults and apply randomization if requested
          if (randomize) {
            await randomizePuppeteerPage(page);
            log('request.randomized', { queueNumber, id });
          }
          
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

          let result;
          if (type === 'screenshot') {

            // Wait before taking screenshot (default 500ms if not specified)
            const waitTime = waitMilliseconds || 500;
            await new Promise((resolve) => setTimeout(resolve, waitTime));

            // Take screenshot and return as base64
            const screenshot = await page.screenshot({ 
              encoding: 'base64',
              fullPage: false
            });
            const pageTitle = await page.title();
            result = {
              title: pageTitle,
              screenshot: screenshot,
              imageType: 'base64-encoded-png',
              instructions: "The screenshot is returned as a base64-encoded PNG image in the 'screenshot' field. To view or save the image, decode the base64 string accordingly.",
              viewport: viewport || { width: 1920, height: 1080 }
            };
            log('request.screenshot.captured', { queueNumber, id, title: pageTitle, screenshotBytes: screenshot.length });
          } else {
            // wait 50ms
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Default browse behavior - return HTML
            result = await page.evaluate(() => {
              return {
                title: document.title,
                html: document.documentElement.outerHTML
              };
            });
            log('request.page.evaluated', { queueNumber, id, title: result.title, htmlBytes: result.html.length });
          }
          
          await queue.updateRequestResult(id, result);
          await queue.updateRequestStatus(id, 1);
          
          await page.close();
          log('request.complete', { queueNumber, id, type });
        } catch (requestError) {
          log('request.error', { 
            queueNumber, 
            id: request?.id, 
            url: request?.config?.url,
            message: requestError.message, 
            stack: requestError.stack,
            name: requestError.name
          });
          
          // Try to close the page if it exists
          try {
            if (page && !page.isClosed()) {
              await page.close();
            }
          } catch (closeError) {
            log('request.page.close.error', { queueNumber, message: closeError.message });
          }
          
          // Update request status to failed (-1)
          try {
            if (request?.id) {
              await queue.updateRequestStatus(request.id, -1);
              await queue.updateRequestResult(request.id, { 
                error: requestError.message,
                stack: requestError.stack 
              });
            }
          } catch (queueError) {
            log('request.queue.update.error', { queueNumber, message: queueError.message });
          }
        }
      }
    } catch (workerError) {
      log('worker.loop.error', { 
        queueNumber, 
        message: workerError.message, 
        stack: workerError.stack 
      });
      // Wait before retrying to avoid tight error loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    // wait 70ms before next iteration
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