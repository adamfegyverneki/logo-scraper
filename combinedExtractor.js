import { extractAllImages } from './logoExtractor.js';
import { extractFaviconColors, extractColorsFromImageUrl } from './colorExtractor.js';
import { writeFileSync } from 'fs';

/**
 * Extract site name from URL for prioritization
 */
function getSiteName(url) {
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
  } catch (e) {
    // Ignore
  }
  return '';
}

/**
 * Validate if a URL is a proper image URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Must start with http:// or https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }
  
  // Check for common malformed patterns (HTML entities, JSON data, etc.)
  const invalidPatterns = [
    /&quot;/i,           // HTML entity quotes
    /%7B.*%7D/i,         // URL-encoded JSON braces
    /\[0,.*\]/i,         // JSON array notation
    /site-meta/i,        // Common JSON metadata keys
    /ecommerceType/i     // Common JSON metadata keys
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(url)) {
      return false;
    }
  }
  
  // Try to construct a URL object to validate format
  try {
    const urlObj = new URL(url);
    // Check if it has a valid hostname and pathname
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return false;
    }
    // Reject URLs that are just the base domain with query/fragment
    if (urlObj.pathname === '/' && (urlObj.search || urlObj.hash)) {
      // Check if search/hash contains JSON-like patterns
      if (/&quot;|%7B|\[0,/.test(urlObj.search + urlObj.hash)) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Find the top logo from extracted images
 */
function findTopLogo(images, siteName) {
  // Filter for valid URLs and scored images
  const validScoredImages = images.filter(img => 
    img.logoScore !== undefined && 
    img.logoScore > 0 && 
    isValidImageUrl(img.url)
  );
  
  if (validScoredImages.length === 0) {
    return null;
  }
  
  // Prioritize logos with site name in filename (not URL domain)
  if (siteName && siteName.length > 2) {
    const siteNameLower = siteName.toLowerCase();
    for (const img of validScoredImages) {
      const filenameLower = (img.filename || '').toLowerCase();
      // Only check filename, not the full URL (to avoid matching domain names)
      if (filenameLower.includes(siteNameLower)) {
        return img;
      }
    }
  }
  
  // If no site name logos found, return highest scoring overall
  return validScoredImages.reduce((prev, current) => 
    (prev.logoScore > current.logoScore) ? prev : current
  );
}

/**
 * Prepare images data for JSON output (for debugging)
 */
function prepareImagesData(images) {
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
    const sourcePriority = {
      'inline-svg': 1,
      'svg-sprite': 1,
      'img-tag': 2,
      'css-background': 3,
      'inline-style': 4,
      'html-source': 5,
      'html-source-sprite': 5,
      'data-attribute': 6,
      'favicon': 7
    };
    const aPriority = sourcePriority[a.source] || 99;
    const bPriority = sourcePriority[b.source] || 99;
    return aPriority - bPriority;
  });
}

/**
 * Main execution
 */
async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: node combinedExtractor.js <URL>');
    console.error('Example: node combinedExtractor.js https://example.com');
    process.exit(1);
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    console.error('Invalid URL provided');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  try {
    console.log(`\n=== Extracting logo and colors from ${url} ===\n`);
    
    // Extract colors first (this also gets the favicon URL)
    console.log('Step 1: Extracting colors from favicon...');
    let colors = null;
    let faviconUrl = null;
    try {
      const colorResult = await extractFaviconColors(url);
      colors = { primary: colorResult.primary, secondary: colorResult.secondary };
      faviconUrl = colorResult.faviconUrl;
      console.log(`  ✓ Primary color: ${colors.primary}`);
      console.log(`  ✓ Secondary color: ${colors.secondary || 'N/A'}`);
      console.log(`  ✓ Favicon URL: ${faviconUrl}`);
    } catch (error) {
      console.log(`  ⚠ Could not extract colors from favicon: ${error.message}`);
      colors = { primary: null, secondary: null };
    }
    
    // Extract logo (pass favicon URL if we found it)
    console.log('\nStep 2: Extracting logo...');
    const images = await extractAllImages(url, faviconUrl);
    const siteName = getSiteName(url);
    const topLogo = findTopLogo(images, siteName);
    const logoUrl = topLogo ? topLogo.url : null;
    
    if (topLogo) {
      console.log(`  ✓ Found logo: ${topLogo.filename}`);
      console.log(`  URL: ${logoUrl}`);
    } else {
      console.log('  ⚠ No logo candidate found');
    }
    
    // Fallback: try extracting colors from the logo image if we didn't get colors from favicon
    if (!colors.primary && logoUrl) {
      console.log('\n  Trying to extract colors from logo image...');
      try {
        colors = await extractColorsFromImageUrl(logoUrl);
        console.log(`  ✓ Primary color (from logo): ${colors.primary}`);
        console.log(`  ✓ Secondary color (from logo): ${colors.secondary || 'N/A'}`);
      } catch (logoError) {
        console.log(`  ⚠ Could not extract colors from logo: ${logoError.message}`);
        colors = { primary: null, secondary: null };
      }
    }
    
    // Prepare result
    const result = {
      url: url,
      logo_url: logoUrl,
      colors: {
        primary: colors.primary,
        secondary: colors.secondary
      }
    };
    
    // Save result.json
    writeFileSync('result.json', JSON.stringify(result, null, 2));
    console.log('\n✓ Result saved to result.json');
    
    // Save images.json for debugging
    const imagesData = prepareImagesData(images);
    const debugResult = {
      url: url,
      total_images: images.length,
      logo_url: logoUrl,
      images: imagesData
    };
    writeFileSync('images.json', JSON.stringify(debugResult, null, 2));
    console.log(`✓ Debug data saved to images.json (${images.length} images)`);
    
    // Calculate execution time
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // Output summary
    console.log('\n=== Summary ===');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n⏱️  Execution time: ${executionTime} seconds`);
    
  } catch (error) {
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    console.error(`\n✗ Failed to extract data: ${error.message}`);
    console.error(`⏱️  Execution time: ${executionTime} seconds`);
    
    // Save error result
    const errorResult = {
      url: url,
      logo_url: null,
      colors: {
        primary: null,
        secondary: null
      },
      error: error.message
    };
    writeFileSync('result.json', JSON.stringify(errorResult, null, 2));
    
    // Save error debug data
    const errorDebugResult = {
      url: url,
      total_images: 0,
      images: [],
      error: error.message
    };
    writeFileSync('images.json', JSON.stringify(errorDebugResult, null, 2));
    
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('combinedExtractor.js');

if (isMainModule) {
  main();
}

