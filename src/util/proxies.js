require('dotenv').config();

/**
 * Reads proxy configuration from environment variables and returns a list of available proxies.
 * 
 * Environment variables should follow the pattern: PROXY_<COUNTRY_CODE>
 * Example: PROXY_US, PROXY_UK, PROXY_CA, etc.
 * 
 * @returns {Array<{proxy: string, countryCode: string}>} Array of proxy objects
 */
const getAvailableProxies = () => {
  const proxies = [];
  
  // Map of country codes to check
  const countryCodes = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'];
  
  // Check for country-specific proxies
  for (const countryCode of countryCodes) {
    const envKey = `PROXY_${countryCode}`;
    const proxyUrl = process.env[envKey];
    
    if (proxyUrl) {
      proxies.push({
        proxy: proxyUrl,
        countryCode: countryCode
      });
    }
  }

   // Check for default proxy
  if (process.env.PROXY_DEFAULT) {
    proxies.push({
      proxy: process.env.PROXY_DEFAULT,
      countryCode: 'ANY'
    });
  }
  
  return proxies;
};

module.exports = {
  getAvailableProxies
};
