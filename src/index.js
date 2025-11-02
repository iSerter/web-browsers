require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const WebRequestsQueue = require('./web-requests-queue');
const Browsers = require('./util/browsers');

const app = express();

// Common viewport presets
const VIEWPORT_PRESETS = {
  // Mobile
  'iphone-se': { width: 375, height: 667 },
  'iphone-12': { width: 390, height: 844 },
  'iphone-14-pro': { width: 393, height: 852 },
  'iphone-14-pro-max': { width: 430, height: 932 },
  'pixel-5': { width: 393, height: 851 },
  'samsung-s20': { width: 360, height: 800 },
  'samsung-s21': { width: 384, height: 854 },

  // Tablet
  'ipad-mini': { width: 768, height: 1024 },
  'ipad-air': { width: 820, height: 1180 },
  'ipad-pro-11': { width: 834, height: 1194 },
  'ipad-pro-12.9': { width: 1024, height: 1366 },
  'samsung-gtab-s7': { width: 800, height: 1280 },
  'surface-pro-7': { width: 912, height: 1368 },

  // Desktop
  'laptop': { width: 1366, height: 768 },
  'desktop': { width: 1920, height: 1080 },
  'desktop-4k': { width: 3840, height: 2160 },
  'macbook-air': { width: 1440, height: 900 },
  'macbook-pro-13': { width: 2560, height: 1600 },
  'macbook-pro-16': { width: 3072, height: 1920 },
};

// Load access keys
const accessKeysPath = path.join(__dirname, '..', 'accessKeys.json');
const accessKeys = JSON.parse(fs.readFileSync(accessKeysPath, 'utf8'));

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ code: 401, message: 'Authorization header required' });
  }
  
  // Support both "Bearer <token>" and "<token>" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;
  
  if (!accessKeys.validKeys.includes(token)) {
    return res.status(403).json({ code: 403, message: 'Invalid access key' });
  }
  
  next();
};
const port = Number(process.env.API_PORT) || 3030;
const queue = new WebRequestsQueue(process.env.BROWSER_COUNT || 2);
const browsers = new Browsers();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

let server;
const start = async () => {
  try {
    await queue.start();
    server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} already in use. Another process is likely still running. Exiting.`);
        process.exit(1);
      } else {
        console.error('Server error', err);
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};
start();

const graceful = (signal) => {
  console.log(`[graceful] ${signal} received. Shutting down.`);
  if (server) {
    server.close(() => {
      console.log('[graceful] HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  // Force exit if still not closed after 5s
  setTimeout(() => {
    console.warn('[graceful] Forcing exit after timeout');
    process.exit(1);
  }, 5000).unref();
};
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => graceful(sig)));

app.get("/", (req, res) => {
  res.send("API server is running");
});

app.post("/browse", authenticate, async (req, res) => {
  console.log(req.body);
  const url = req.body.url;
  const headers = req.body.headers || [];
  const method = req.body.method || 'GET';
  const proxyCountryCode = req.body.proxy_country_code;
  const randomize = req.body.randomize === 1 || req.body.randomize === '1' || req.body.randomize === true;

  // If proxy_country_code is specified, validate that a browser is available
  let queueNumber = null;
  if (proxyCountryCode) {
    try {
      queueNumber = browsers.getQueueNumberByCountryCode(proxyCountryCode);
      
      if (queueNumber === null) {
        const availableCodes = browsers.getAvailableCountryCodes();
        return res.status(400).json({ 
          code: 400, 
          message: `No browser available for country code: ${proxyCountryCode}`,
          availableCountryCodes: availableCodes
        });
      }
    } catch (err) {
      return res.status(500).json({ 
        code: 500, 
        message: err.message
      });
    }
  }

  const request = { url, headers, method, randomize, type: 'browse' };
  const requestId = await queue.pushRequest(request, queueNumber);

  // wait 30 seconds for the request to be processed, check every 70ms
  let status = 0;
  let result = null;
  const startTime = new Date();
  while(status == 0 && (new Date() - startTime) < 30000) {
    await new Promise((resolve) => setTimeout(resolve, 70));
    status = await queue.getRequestStatus(requestId);
    if (status == 1) {
      result = await queue.getRequestResult(requestId);
    }
  }

  await queue.deleteRequest(requestId);

  if (status == 0) {
    return res.status(504).json({ code: 504, message: 'Request timeout' });
  }

  if (status == 1) {
    return res.status(200).json(result);
  }
});

app.post("/screenshot", authenticate, async (req, res) => {
  console.log(req.body);
  const url = req.body.url;
  const headers = req.body.headers || [];
  const method = req.body.method || 'GET';
  const proxyCountryCode = req.body.proxy_country_code;
  const randomize = req.body.randomize === 1 || req.body.randomize === '1' || req.body.randomize === true;
  const waitMilliseconds = parseInt(req.body.wait_ms) || 500;
  
  // Parse viewport/windowsize options
  let viewportInput = req.body.viewport || req.body.windowsize;
  let width = 1920;
  let height = 1080;
  
  if (typeof viewportInput === 'string') {
    // Check if it's a preset name
    const preset = VIEWPORT_PRESETS[viewportInput.toLowerCase()];
    if (preset) {
      width = preset.width;
      height = preset.height;
    } else {
      return res.status(400).json({ 
        code: 400, 
        message: `Unknown viewport preset: ${viewportInput}`,
        availablePresets: Object.keys(VIEWPORT_PRESETS)
      });
    }
  } else if (viewportInput && typeof viewportInput === 'object') {
    // Custom viewport object
    width = parseInt(viewportInput.width) || 1920;
    height = parseInt(viewportInput.height) || 1080;
  }

  // If proxy_country_code is specified, validate that a browser is available
  let queueNumber = null;
  if (proxyCountryCode) {
    try {
      queueNumber = browsers.getQueueNumberByCountryCode(proxyCountryCode);
      
      if (queueNumber === null) {
        const availableCodes = browsers.getAvailableCountryCodes();
        return res.status(400).json({ 
          code: 400, 
          message: `No browser available for country code: ${proxyCountryCode}`,
          availableCountryCodes: availableCodes
        });
      }
    } catch (err) {
      return res.status(500).json({ 
        code: 500, 
        message: err.message
      });
    }
  }

  const request = { 
    url, 
    headers, 
    method, 
    randomize, 
    type: 'screenshot',
    viewport: { width, height },
    waitMilliseconds
  };
  const requestId = await queue.pushRequest(request, queueNumber);

  // wait 30 seconds for the request to be processed, check every 70ms
  let status = 0;
  let result = null;
  const startTime = new Date();
  while(status == 0 && (new Date() - startTime) < 30000) {
    await new Promise((resolve) => setTimeout(resolve, 70));
    status = await queue.getRequestStatus(requestId);
    if (status == 1) {
      result = await queue.getRequestResult(requestId);
    }
  }

  await queue.deleteRequest(requestId);

  if (status == 0) {
    return res.status(504).json({ code: 504, message: 'Request timeout' });
  }

  if (status == 1) {
    return res.status(200).json(result);
  }
});

app.use((req, res) => { res.status(404).json({ code: 404, message: 'Not Found' }) })