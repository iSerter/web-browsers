require('dotenv').config();
const WebRequestsQueue = require('./src/web-requests-queue.js');

const queueCount = process.env.QUEUE_COUNT || 2;
const queue = new WebRequestsQueue(queueCount);

const debugQueue = async (queue) => {
    const requests = await queue.getRequests(1);
    console.log('Initial requests:', requests);
    const requests2 = await queue.getRequests(2);
    console.log('Initial requests for queue 2:', requests2);


    const reqId = await queue.pushRequest({url: "http://iserter.com"});
    console.log(reqId);
    console.log(await queue.getRequestStatus(reqId));
    console.log(await queue.updateRequestResult(reqId, 'wow'));
    console.log(await queue.updateRequestStatus(reqId, 1));
    console.log('result',await queue.getRequestResult(reqId));
    console.log(await queue.getRequestStatus(reqId));
    console.log('del',await queue.deleteRequest(reqId));
    console.log(await queue.getRequestStatus(reqId), await queue.getRequestResult(reqId));
    console.log(await queue.getRequests());
}

debugQueue(queue);