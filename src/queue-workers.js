require('dotenv').config();
const { startSession, stopSession } = require('./browser/puppeteer-chrome-xvfb/index.js');
const WebRequestsQueue = require('./web-requests-queue.js');

const queueCount = process.env.QUEUE_COUNT || 2;
const queue = new WebRequestsQueue(queueCount);

const runQueueWorkers = async () => {
  await queue.start();
  const queues = [];

  proxy = process.env.PROXY_DEFAULT;
  
  for(let i=1; i<=queueCount; i++) {
    const { browser, xvfbSession } = await startSession({ proxy });
    console.log(JSON.stringify({ browser: browser.wsEndpoint(), display: xvfbSession.display }));
    startQueueWorker(i, browser);
    queues.push({ queueNumber: i, browser, xvfbSession });
  }
}
runQueueWorkers();
process.on('SIGINT', async () => {
  console.log('SIGINT signal received.');
  queues.forEach(async (queue) => {
    await queue.browser.close();
    await stopSession(queue.xvfbSession);
  });
  process.exit();
});

const startQueueWorker = async (queueNumber, browser) => {
  while(true) {
    const requests = await queue.getRequests(queueNumber);
    for(let i=0; i<requests.length; i++) {
      const request = requests[i];
      const { id, config } = request;
      const { url, headers, method } = config;
      console.log(`Processing request ${id}, URL: ${url}`);
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders(headers);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      // wait 50-250ms
      const waitTime = Math.floor(Math.random() * 200) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // scroll back up 
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForNavigation({ waitUntil: 'networkidle0' });

      const result = await page.evaluate(() => {
        return {
          title: document.title,
          html: document.documentElement.outerHTML
        };
      });
      await queue.updateRequestResult(id, result);
      await queue.updateRequestStatus(id, 1);
      await page.close();
      console.log(`Done processing request ${id}`);
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