const fs = require('fs');
const path = require('path');

/**
 * Browsers utility class for managing browser queue information
 * Provides cached access to browser configurations with automatic refresh
 */
class Browsers {
  constructor(browsersJsonPath = null) {
    this.browsersJsonPath = browsersJsonPath || path.join(__dirname, '..', '..', 'runtime', 'browsers.json');
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
  }

  /**
   * Loads browser data from file
   * @returns {Array} Array of browser objects
   * @private
   */
  _loadBrowsersFromFile() {
    try {
      const data = fs.readFileSync(this.browsersJsonPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error('Browsers configuration file not found. Ensure queue workers are running.');
      }
      throw new Error(`Failed to load browsers configuration: ${err.message}`);
    }
  }

  /**
   * Checks if cache is still valid
   * @returns {boolean} True if cache is valid, false otherwise
   * @private
   */
  _isCacheValid() {
    if (!this.cache || !this.cacheTimestamp) {
      return false;
    }
    const now = Date.now();
    return (now - this.cacheTimestamp) < this.cacheDuration;
  }

  /**
   * Gets all browsers, using cache if valid or refreshing from file
   * @returns {Array} Array of browser objects
   */
  getBrowsers() {
    if (!this._isCacheValid()) {
      this.cache = this._loadBrowsersFromFile();
      this.cacheTimestamp = Date.now();
    }
    return this.cache;
  }

  /**
   * Finds a browser by country code
   * @param {string} countryCode - The country code to search for (e.g., 'US', 'UK', 'DEFAULT')
   * @returns {Object|null} Browser object if found, null otherwise
   */
  getBrowserByCountryCode(countryCode) {
    const browsers = this.getBrowsers();
    return browsers.find(browser => browser.countryCode === countryCode.toUpperCase()) || null;
  }

  /**
   * Gets all available country codes
   * @returns {Array<string>} Array of country codes
   */
  getAvailableCountryCodes() {
    const browsers = this.getBrowsers();
    return browsers.map(browser => browser.countryCode);
  }

  /**
   * Gets the queue number for a specific country code
   * @param {string} countryCode - The country code
   * @returns {number|null} Queue number if found, null otherwise
   */
  getQueueNumberByCountryCode(countryCode) {
    const browser = this.getBrowserByCountryCode(countryCode);
    return browser ? browser.queueNumber : null;
  }

  /**
   * Checks if a browser is available for the specified country code
   * @param {string} countryCode - The country code to check
   * @returns {boolean} True if available, false otherwise
   */
  isBrowserAvailable(countryCode) {
    return this.getBrowserByCountryCode(countryCode) !== null;
  }

  /**
   * Forces a refresh of the browser cache
   * @returns {Array} Freshly loaded browser data
   */
  refreshCache() {
    this.cache = this._loadBrowsersFromFile();
    this.cacheTimestamp = Date.now();
    return this.cache;
  }

  /**
   * Writes browser configurations to the browsers.json file
   * Creates the directory if it doesn't exist
   * @param {Array} browsers - Array of browser objects to write
   * @returns {string} Path to the written file
   */
  writeBrowsersFile(browsers) {
    const dir = path.dirname(this.browsersJsonPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(this.browsersJsonPath, JSON.stringify(browsers, null, 2));
    
    // Update cache with the new data
    this.cache = browsers;
    this.cacheTimestamp = Date.now();
    
    return this.browsersJsonPath;
  }
}

module.exports = Browsers;
