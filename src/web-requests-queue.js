const redis = require('redis');
const crypto = require('crypto');

class WebRequestsQueue {

  constructor(queueCount = 3) {
    this.queueCount = queueCount;
    this.client = redis.createClient();
    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });


    this.client.on('ready', () => {
      console.log('Redis client connected');
    });
  }

  async start() {
    await this.client.connect();
  }

  getQueueName(queueNo = 1) {
    return `requestsQueue${queueNo}`;
  }

  getQueueNumberForRequest(requestId) {
    const lastChar = requestId[requestId.length - 1];
    const lastCharNumber = parseInt(lastChar, 16);
    return lastCharNumber % this.queueCount + 1;
  }

  async pushRequest(request) {
    const reqHashId = crypto.createHash('md5').update(JSON.stringify(request)).digest('hex');
    const requestId = `request:${Date.now()}:${reqHashId}`;
    const queueNumber = this.getQueueNumberForRequest(requestId);
  
    try {
      await this.client.lPush(this.getQueueName(queueNumber), requestId);
  
      console.log('pushing request config to queue', JSON.stringify(request));
      await this.client.hSet(requestId, 'config', JSON.stringify(request));
      await this.client.hSet(requestId, 'status', 0);
  
      return requestId;
    } catch (err) {
        console.error(err);
      throw err;
    }
  }

  async updateRequestStatus(requestId, status) {
    return this.client.hSet(requestId, 'status', status);
  }

  async updateRequestResult(requestId, result) {
    return this.client.hSet(requestId, 'result', JSON.stringify(result));
  }

  async getRequests(queueNumber = 1) {
    try {
      const requestIds = await this.client.lRange(this.getQueueName(queueNumber), 0, -1);
  
      const requests = requestIds.map(async (requestId) => {
        const config = await this.client.hGet(requestId, 'config');
        console.log('read config from redis', config);
        const status = await this.client.hGet(requestId, 'status');
        return { id: requestId, config: JSON.parse(config), status };
      });
  
      return requests;
    } catch (err) {
      throw err;
    }
  }

  async getRequestStatus(requestId) {
    return this.client.hGet(requestId, 'status');
  }

  async getRequestResult(requestId) {
    return this.client.hGet(requestId, 'result');
  }

  async deleteRequest(requestId) {
    await this.client.hDel(requestId, 'config');
    await this.client.hDel(requestId, 'status');
    await this.client.hDel(requestId, 'result');
    await this.client.lRem(this.getQueueName(this.getQueueNumberForRequest(requestId)), 0, requestId); 
    return true;
  }
}

module.exports = WebRequestsQueue;