const { startSession, stopSession } = require('./browser/puppeteer-chrome-xvfb');
const WebRequestsQueue = require('./web-requests-queue.js');

const handleRequests = async () => {
  const queue = new WebRequestsQueue();
  await queue.start();
  const { browser, xvfbSession } = await startSession({});
  console.log('New browser \w display session started: ', xvfbSession._display, browser.wsEndpoint());

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

//   return;

  while (true) {
    try {
      const requests = await queue.getRequests();
      console.log('Requests:', requests.length);
      for (const request of requests) {
        if (request.status == 0) {
          console.log('Processing request:', request.id, request?.config?.url);
          // Process the request
          const page = await browser.newPage();
          await page.goto(request.data.url);
          const result = await page.content();
          await queue.updateRequestResult(request.id, result);
          await queue.updateRequestStatus(request.id, 1);
          await page.close();
        }
      }
    } catch (err) {
      console.error('Error handling requests:', err);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  await stopSession(xvfbSession);
};

handleRequests().catch(err => console.error('Error in handleRequests:', err));