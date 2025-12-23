/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is valid
 */
export function validateUrl(url) {
  if (!url || !url.startsWith('http')) {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Normalize URL to absolute URL
 * @param {string} urlString - URL to normalize
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {string} Normalized URL
 */
export function normalizeUrl(urlString, baseUrl) {
  try {
    const url = new URL(urlString, baseUrl);
    return url.href;
  } catch (e) {
    return urlString;
  }
}

/**
 * Extract filename from URL
 * @param {string} urlString - URL to extract filename from
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {string} Filename
 */
export function getFilename(urlString, baseUrl) {
  try {
    const url = new URL(urlString, baseUrl);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop() || '';
    return filename.split('?')[0];
  } catch (e) {
    const parts = urlString.split('/');
    const lastPart = parts[parts.length - 1] || '';
    return lastPart.split('?')[0];
  }
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename to extract extension from
 * @returns {string} File extension (lowercase)
 */
export function getExtension(filename) {
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Extract domain from URL
 * @param {string} urlString - URL to extract domain from
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {string} Domain name (without www)
 */
export function getDomain(urlString, baseUrl) {
  try {
    const url = new URL(urlString, baseUrl);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}


