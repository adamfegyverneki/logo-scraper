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
 * Find the top logo from extracted images
 */
function findTopLogo(images, siteName) {
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
  
  try {
    console.log(`\n=== Extracting logo and colors from ${url} ===\n`);
    
    // Extract logo
    console.log('Step 1: Extracting logo...');
    const images = await extractAllImages(url);
    const siteName = getSiteName(url);
    const topLogo = findTopLogo(images, siteName);
    const logoUrl = topLogo ? topLogo.url : null;
    
    if (topLogo) {
      console.log(`  ✓ Found logo: ${topLogo.filename}`);
      console.log(`  URL: ${logoUrl}`);
    } else {
      console.log('  ⚠ No logo candidate found');
    }
    
    // Extract colors
    console.log('\nStep 2: Extracting colors from favicon...');
    let colors = null;
    try {
      colors = await extractFaviconColors(url);
      console.log(`  ✓ Primary color: ${colors.primary}`);
      console.log(`  ✓ Secondary color: ${colors.secondary || 'N/A'}`);
    } catch (error) {
      console.log(`  ⚠ Could not extract colors from favicon: ${error.message}`);
      
      // Fallback: try extracting colors from the logo image
      if (logoUrl) {
        console.log(`  Trying to extract colors from logo image...`);
        try {
          colors = await extractColorsFromImageUrl(logoUrl);
          console.log(`  ✓ Primary color (from logo): ${colors.primary}`);
          console.log(`  ✓ Secondary color (from logo): ${colors.secondary || 'N/A'}`);
        } catch (logoError) {
          console.log(`  ⚠ Could not extract colors from logo: ${logoError.message}`);
          colors = { primary: null, secondary: null };
        }
      } else {
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
    
    // Output summary
    console.log('\n=== Summary ===');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error(`\n✗ Failed to extract data: ${error.message}`);
    
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

