/**
 * Extract site name from URL domain
 * @param {string} url - The URL to extract site name from
 * @returns {string} The extracted site name
 */
export function getSiteName(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    const parts = domain.split('.');
    
    if (parts.length >= 3) {
      const commonSubdomains = ['www', 'www2', 'www3', 'invest', 'admin', 'app', 'api', 'blog', 'mail', 'ftp', 'cdn', 'static', 'assets', 'media', 'images', 'img'];
      const mainPart = parts[parts.length - 2];
      const subdomainPart = parts[parts.length - 3];
      
      if (commonSubdomains.includes(subdomainPart.toLowerCase())) {
        return mainPart;
      } else if (mainPart.length <= 2 || /^\d+$/.test(mainPart)) {
        return subdomainPart;
      } else {
        return mainPart;
      }
    } else if (parts.length >= 2) {
      return parts[0];
    }
    
    return domain;
  } catch (e) {
    return '';
  }
}

