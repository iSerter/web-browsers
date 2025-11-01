// User agents pool - common modern user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36'
];

/**
 * Get a random user agent from the pool
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Save the current page defaults before randomization
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} - Object containing the original defaults
 */
async function savePageDefaults(page) {
  const viewport = page.viewport();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  
  return {
    viewport: viewport || { width: 1920, height: 1080, deviceScaleFactor: 1 },
    userAgent: userAgent || USER_AGENTS[USER_AGENTS.length - 1]
  };
}

/**
 * Restore page to its original defaults
 * @param {Object} page - Puppeteer page object
 * @param {Object} defaults - Original defaults object from savePageDefaults
 */
async function restorePageDefaults(page, defaults) {
  if (!defaults) return;
  
  try {
    if (defaults.viewport) {
      await page.setViewport(defaults.viewport);
    }
    if (defaults.userAgent) {
      await page.setUserAgent(defaults.userAgent);
    }
  } catch (err) {
    console.error('Error restoring page defaults:', err);
  }
}

/**
 * Set a random user agent on the page
 * @param {Object} page - Puppeteer page object
 */
async function setRandomUserAgent(page) {
  const UA = getRandomUserAgent();
  await page.setUserAgent(UA);
}

/**
 * Apply randomization to a Puppeteer page to make it less detectable
 * @param {Object} page - Puppeteer page object
 */
async function randomizePuppeteerPage(page) {
  await new Promise((resolve) => setTimeout(resolve, 5)); // https://stackoverflow.com/a/78238081
  
  // Randomize viewport dimensions
  await page.setViewport({
    width: 1600 + Math.floor(Math.random() * 100),
    height: 900 + Math.floor(Math.random() * 100),
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: false,
    isMobile: false,
  });
  
  await new Promise((resolve) => setTimeout(resolve, 5));
  await setRandomUserAgent(page);
  
  await new Promise((resolve) => setTimeout(resolve, 5));
  await page.setJavaScriptEnabled(true);
  
  await new Promise((resolve) => setTimeout(resolve, 5));
  
  // Override webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });
  
  await new Promise((resolve) => setTimeout(resolve, 5));
  
  // Mock plugins
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for most cases,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5],
    });
  });
  
  // Set languages
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `languages` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

module.exports = {
  randomizePuppeteerPage,
  savePageDefaults,
  restorePageDefaults,
  getRandomUserAgent
};
