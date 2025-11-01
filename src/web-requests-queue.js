const redis = require('redis');
const crypto = require('crypto');

class WebRequestsQueue {

  constructor(queueCount = 3) {
    this.queueCount = queueCount;
    this.client = null; // lazy init to allow recreation on disconnect
    this.connectingPromise = null; // prevent duplicate concurrent connects
  }

  getRedisUrl() {
    return process.env.REDIS_URL || undefined; // allow override via env
  }

  createClient() {
    // Provide a reconnect strategy: exponential backoff capped at 5s
    const url = this.getRedisUrl();
    const client = redis.createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 100, 5000);
          console.warn(`[redis] Reconnect attempt #${retries}, delay ${delay}ms`);
          return delay; // return number triggers retry; return error stops
        }
      }
    });

    client.on('error', (err) => {
      console.error('[redis] Error:', err);
    });
    client.on('ready', () => {
      console.log('[redis] Client ready');
    });
    client.on('end', () => {
      console.warn('[redis] Connection ended');
    });
    client.on('reconnecting', () => {
      console.log('[redis] Reconnecting...');
    });
    return client;
  }

  async ensureClient() {
    // If an existing open client, return immediately
    if (this.client && this.client.isOpen) return this.client;

    // If a connection attempt is in progress, await it
    if (this.connectingPromise) {
      await this.connectingPromise;
      return this.client;
    }

    // Create a new client and connect
    this.client = this.createClient();
    this.connectingPromise = this.client.connect()
      .catch(err => {
        console.error('[redis] Failed to connect:', err);
        // Reset client so future ensureClient attempts can retry
        this.client = null;
        throw err;
      })
      .finally(() => {
        this.connectingPromise = null;
      });
    await this.connectingPromise;
    return this.client;
  }

  async start() {
    await this.ensureClient();
  }

  getQueueName(queueNo = 1) {
    return `requestsQueue${queueNo}`;
  }

  getQueueNumberForRequest(requestId) {
    const lastChar = requestId[requestId.length - 1];
    const lastCharNumber = parseInt(lastChar, 16);
    return lastCharNumber % this.queueCount + 1;
  }

  async pushRequest(request, specificQueueNumber = null) {
    const reqHashId = crypto.createHash('md5').update(JSON.stringify(request)).digest('hex');
    const requestId = `request:${Date.now()}:${reqHashId}`;
    
    // Use specific queue number if provided, otherwise calculate from requestId
    const queueNumber = specificQueueNumber !== null 
      ? specificQueueNumber 
      : this.getQueueNumberForRequest(requestId);
  
    try {
      const client = await this.ensureClient();
      await client.lPush(this.getQueueName(queueNumber), requestId);
  
      console.log('pushing request config to queue', JSON.stringify(request));
      await client.hSet(requestId, 'config', JSON.stringify(request));
      await client.hSet(requestId, 'status', 0);
      await client.hSet(requestId, 'queueNumber', queueNumber);
  
      return requestId;
    } catch (err) {
        console.error(err);
      throw err;
    }
  }

  async updateRequestStatus(requestId, status) {
    const client = await this.ensureClient();
    return client.hSet(requestId, 'status', status);
  }

  async updateRequestResult(requestId, result) {
    const client = await this.ensureClient();
    return client.hSet(requestId, 'result', JSON.stringify(result));
  }

  async getRequests(queueNumber = 1) {
    try {
      const client = await this.ensureClient();
      const requestIds = await client.lRange(this.getQueueName(queueNumber), 0, -1);

      // console.log('read requestIds with lRange', requestIds);
  
      const requests = await Promise.all(requestIds.map(async (requestId) => {
        const config = await client.hGet(requestId, 'config');
        // console.log(`read ${requestId} config from redis`, config);
        const status = await client.hGet(requestId, 'status');
        // console.log(`read ${requestId} status from redis`, status);
        return { id: requestId, config: JSON.parse(config), status };
      }));

      // console.log('final requests array', requests);
  
      return requests;
    } catch (err) {
      throw err;
    }
  }

  async getRequestStatus(requestId) {
    const client = await this.ensureClient();
    return client.hGet(requestId, 'status');
  }

  async getRequestResult(requestId) {
    const client = await this.ensureClient();
    return client.hGet(requestId, 'result');
  }

  async deleteRequest(requestId) {
    const client = await this.ensureClient();
    
    // Try to get the stored queue number, fallback to calculated
    let queueNumber = await client.hGet(requestId, 'queueNumber');
    if (!queueNumber) {
      queueNumber = this.getQueueNumberForRequest(requestId);
    }
    
    await client.hDel(requestId, 'config');
    await client.hDel(requestId, 'status');
    await client.hDel(requestId, 'result');
    await client.hDel(requestId, 'queueNumber');
    await client.lRem(this.getQueueName(queueNumber), 0, requestId); 
    return true;
  }
}

module.exports = WebRequestsQueue;