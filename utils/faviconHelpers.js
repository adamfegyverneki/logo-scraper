/**
 * Get favicon URL from a website
 * @param {Page} page - Playwright page object
 * @param {string} baseUrl - Base URL of the website
 * @returns {Promise<string|null>} Favicon URL or null if not found
 */
export async function getFaviconUrl(page, baseUrl) {
  try {
    // Try to find favicon link in HTML
    const faviconLink = await page.evaluate(() => {
      // Check for various favicon link formats
      const selectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]'
      ];
      
      for (const selector of selectors) {
        const link = document.querySelector(selector);
        if (link && link.href) {
          return link.href;
        }
      }
      return null;
    });

    if (faviconLink) {
      // Resolve relative URLs
      try {
        return new URL(faviconLink, baseUrl).href;
      } catch (e) {
        return faviconLink;
      }
    }
  } catch (error) {
    console.log('  Could not find favicon link in HTML');
  }

  // Fallback to common favicon locations
  const baseUrlObj = new URL(baseUrl);
  const commonPaths = [
    '/favicon.ico',
    '/favicon.png',
    '/apple-touch-icon.png'
  ];

  for (const path of commonPaths) {
    const faviconUrl = `${baseUrlObj.origin}${path}`;
    try {
      // Use 'load' instead of 'networkidle' for faster response
      const response = await page.goto(faviconUrl, { waitUntil: 'load', timeout: 3000 }); // Reduced timeout from 5000ms
      if (response && response.status() === 200) {
        return faviconUrl;
      }
    } catch (e) {
      // Continue to next path
    }
  }

  return null;
}

/**
 * Get favicon from the page (simpler version for logoExtractor)
 * @param {Page} page - Playwright page object
 * @param {string} url - Base URL of the website
 * @returns {Promise<string|null>} Favicon URL or null if not found
 */
export async function getFavicon(page, url) {
  try {
    const faviconUrl = await page.evaluate(({ baseUrl }) => {
      // Check for link rel="icon" or rel="shortcut icon"
      const faviconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
      if (faviconLink) {
        const href = faviconLink.getAttribute('href');
        if (href) {
          try {
            return new URL(href, baseUrl).href;
          } catch (e) {
            return href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
          }
        }
      }
      return null;
    }, { baseUrl: url });
    
    if (faviconUrl) {
      return faviconUrl;
    }
    
    // Fallback to /favicon.ico
    try {
      const urlObj = new URL(url);
      const faviconFallback = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
      return faviconFallback;
    } catch (e) {
      return null;
    }
  } catch (error) {
    console.error(`Error getting favicon: ${error.message}`);
    return null;
  }
}

