import { getSiteName } from './siteHelpers.js';
import { SOURCE_PRIORITY } from './constants.js';

/**
 * Find the top logo from extracted images
 * @param {Array} images - Array of image objects with logoScore
 * @param {string} siteName - Site name for prioritization
 * @returns {Object|null} Top logo image object or null
 */
export function findTopLogo(images, siteName) {
  const scoredImages = images.filter(img => img.logoScore !== undefined && img.logoScore > 0);
  
  if (scoredImages.length === 0) {
    return null;
  }
  
  // Sort by score (highest first) to ensure we check in order
  scoredImages.sort((a, b) => b.logoScore - a.logoScore);
  
  // First, prioritize CSS background SVG data URIs with "logo" in className (very strong indicator)
  for (const img of scoredImages) {
    const isSvgDataUri = img.url && img.url.startsWith('data:image/svg+xml');
    const hasLogoClass = img.className && img.className.toLowerCase().includes('logo');
    if (img.source === 'css-background' && isSvgDataUri && hasLogoClass && img.isInHeader) {
      return img; // This is almost certainly the main logo
    }
  }
  
  // Then prioritize logos with site name in filename/URL
  if (siteName && siteName.length > 2) {
    const siteNameLower = siteName.toLowerCase();
    for (const img of scoredImages) {
      const filenameLower = (img.filename || '').toLowerCase();
      const urlLower = (img.url || '').toLowerCase();
      if (filenameLower.includes(siteNameLower) || urlLower.includes(siteNameLower)) {
        return img; // Return first logo with site name (already sorted to top)
      }
    }
  }
  
  // If no site name logos found, return highest scoring overall
  return scoredImages[0]; // Already sorted, so first is highest
}

/**
 * Prepare images data for JSON output (for debugging)
 * @param {Array} images - Array of image objects
 * @returns {Array} Prepared image data array
 */
export function prepareImagesData(images) {
  return images.map(img => {
    const imageData = {
      filename: img.filename || 'unnamed',
      url: img.url,
      extension: img.extension || 'unknown',
      source: img.source || 'unknown',
      logoScore: img.logoScore !== undefined ? img.logoScore : 0
    };
    
    // Add optional fields if they exist
    if (img.alt) imageData.alt = img.alt;
    if (img.className) imageData.className = img.className;
    if (img.id) imageData.id = img.id;
    if (img.width) imageData.width = img.width;
    if (img.height) imageData.height = img.height;
    if (img.position) imageData.position = img.position;
    if (img.isInHeader) imageData.isInHeader = img.isInHeader;
    if (img.isInNav) imageData.isInNav = img.isInNav;
    if (img.isInHomepageLink) imageData.isInHomepageLink = img.isInHomepageLink;
    
    return imageData;
  }).sort((a, b) => {
    // Sort by score descending, then by source priority
    if (b.logoScore !== a.logoScore) {
      return b.logoScore - a.logoScore;
    }
    const aPriority = SOURCE_PRIORITY[a.source] || 99;
    const bPriority = SOURCE_PRIORITY[b.source] || 99;
    return aPriority - bPriority;
  });
}

