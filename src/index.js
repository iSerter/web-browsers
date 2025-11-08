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
  'mobile':     { width: 375, height: 667 },
  'mobile-xs':  { width: 320, height: 568 },
  'mobile-sm':  { width: 360, height: 640 },
  'mobile-md':  { width: 375, height: 667 },
  'mobile-lg':  { width: 414, height: 896 },
  'mobile-xl':  { width: 430, height: 932 },

  // Tablet
  'tablet':     { width: 768, height: 1024 },
  'tablet-sm':  { width: 600, height: 960 },
  'tablet-md':  { width: 768, height: 1024 },
  'tablet-lg':  { width: 834, height: 1194 },
  'tablet-xl':  { width: 1024, height: 1366 },

  // Laptop / small desktop
  'desktop':    { width: 1920, height: 1080 },
  'desktop-sm': { width: 1280, height: 800 },
  'desktop-md': { width: 1366, height: 768 },
  'desktop-lg': { width: 1440, height: 900 },
  // Large desktop / ultra-wide
  'desktop-xl': { width: 1920, height: 1080 },
  'desktop-2xl':{ width: 2560, height: 1440 },
  'desktop-4k': { width: 3840, height: 2160 },

  // Specific Mobile Devices
  'iphone-15':          { width: 393, height: 852 },  // confirmed by table for iPhone 15. :contentReference[oaicite:4]{index=4}
  'iphone-15-plus':     { width: 430, height: 932 },  // matched logic for “Plus” size. :contentReference[oaicite:5]{index=5}
  'iphone-16':          { width: 393, height: 852 },  // verified from iOS-Resolution table. :contentReference[oaicite:6]{index=6}
  'iphone-16-plus':     { width: 430, height: 932 },  // verified from iOS-Resolution table. :contentReference[oaicite:7]{index=7}
  'iphone-16-pro':      { width: 402, height: 874 },  // verified from iOS-Resolution. :contentReference[oaicite:8]{index=8}
  'iphone-16-pro-max':  { width: 440, height: 956 },  // verified from iOS-Resolution. :contentReference[oaicite:9]{index=9}
  'iphone-17':          { width: 402, height: 874 },  // **updated** based on logic & mapping from specs/resolution. Source: specs show 1206×2622 pixels for iPhone 17. :contentReference[oaicite:10]{index=10}
  'iphone-17-pro-max':  { width: 440, height: 956 },  // based on mapping from iPhone 17 Pro/Max specs. :contentReference[oaicite:11]{index=11}
  'pixel-8':            { width: 412, height: 915 },  // approximate for Google Pixel 8
  'samsung-s20': { width: 360, height: 800 },
  'samsung-s21': { width: 384, height: 854 },
  'samsung-s22': { width: 360, height: 780 },
  'samsung-s23': { width: 360, height: 780 },
  'samsung-s24': { width: 360, height: 780 },

  // Specific Tablet Devices
  'ipad-mini': { width: 768, height: 1024 },
  'ipad-air': { width: 820, height: 1180 },
  'ipad-pro-11': { width: 834, height: 1194 },
  'ipad-pro-12.9': { width: 1024, height: 1366 },
  'samsung-gtab-s7': { width: 800, height: 1280 },
  'surface-pro-7': { width: 912, height: 1368 },

  // Specific Laptop Devices
  'macbook-air': { width: 1440, height: 900 },
  'macbook-pro-13': { width: 2560, height: 1600 },
  'macbook-pro-16': { width: 3072, height: 1920 },
  'macbook-m1-13':   { width: 1280, height: 800 },   // for 13″ Air/Pro early M1, based on 1280×800 data  
  'macbook-m1-14':   { width: 1728, height: 1117 },  // for 14″ Pro, 2021 spec (estimated)  
  'macbook-m1-16':   { width: 1536, height: 960 },   // for 16″ Pro around that generation  
  'macbook-m5-14':   { width: 1512, height: 982 }    // your earlier estimate for 14″ M5 (to be verified)  
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

app.get("/status", authenticate, async (req, res) => {
  try {
    const stats = await queue.getQueueStats();
    return res.status(200).json({
      code: 200,
      ...stats
    });
  } catch (err) {
    console.error('Failed to get queue stats:', err);
    return res.status(500).json({ 
      code: 500, 
      message: 'Failed to retrieve queue status',
      error: err.message
    });
  }
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