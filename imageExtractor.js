import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Navigate to a URL with fallback strategies for timeout handling
 */
async function navigateWithFallback(page, url, options = {}) {
  const timeout = options.timeout || 30000;
  const waitAfter = options.waitAfter || 2000;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeout });
  } catch (error) {
    try {
      console.log('  networkidle timeout, trying load...');
      await page.goto(url, { waitUntil: 'load', timeout: timeout });
      if (waitAfter > 0) {
        await page.waitForTimeout(waitAfter);
      }
    } catch (error2) {
      console.log('  load timeout, trying domcontentloaded...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
      if (waitAfter > 0) {
        await page.waitForTimeout(waitAfter * 2);
      }
    }
  }
}

/**
 * Extract all image files from a website
 */
async function extractAllImages(url) {
  let browser;
  
  try {
    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    await navigateWithFallback(page, url, { waitAfter: 2000 });
    
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);
    
    // Extract all images with metadata and scoring
    console.log('Extracting images with metadata...');
    const images = await page.evaluate((baseUrl) => {
      const imageList = [];
      const seenUrls = new Set(); // To avoid duplicates
      
      // Helper function to extract filename from URL
      function getFilename(urlString) {
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
      
      // Helper function to get file extension
      function getExtension(filename) {
        const match = filename.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : '';
      }
      
      // Helper function to normalize URL
      function normalizeUrl(urlString) {
        try {
          const url = new URL(urlString, baseUrl);
          return url.href;
        } catch (e) {
          return urlString;
        }
      }
      
      // Helper function to score an image based on logo indicators
      function scoreImage(imgData) {
        let score = 0;
        const urlLower = imgData.url.toLowerCase();
        const filenameLower = imgData.filename.toLowerCase();
        const pathLower = imgData.pathname?.toLowerCase() || '';
        
        // URL/Filename keywords (+10 for "logo", +5 for others)
        if (filenameLower.includes('logo') || pathLower.includes('logo')) {
          score += 10;
        }
        if (filenameLower.includes('brand') || pathLower.includes('brand')) {
          score += 5;
        }
        if (filenameLower.includes('header') || pathLower.includes('header')) {
          score += 5;
        }
        if (filenameLower.includes('site') || pathLower.includes('site')) {
          score += 5;
        }
        if (filenameLower.includes('company') || pathLower.includes('company')) {
          score += 5;
        }
        
        // Alt attribute checks (higher weight for logo/company name)
        if (imgData.alt) {
          const altLower = imgData.alt.toLowerCase();
          if (altLower.includes('logo')) {
            score += 15; // Strong indicator
          }
          // Company name in alt is also a strong indicator (e.g., "Facebook", "Google")
          if (altLower.length > 0 && altLower.length < 50 && !altLower.includes(' ')) {
            // Likely a company name (single word, reasonable length)
            score += 8;
          }
          if (altLower.includes('company') || altLower.includes('home')) {
            score += 5;
          }
        }
        
        // Class/ID checks (much higher weight for logo - strongest indicator)
        let hasLogoInClassId = false;
        if (imgData.className) {
          const classLower = imgData.className.toLowerCase();
          if (classLower.includes('logo')) {
            score += 20; // Very strong indicator
            hasLogoInClassId = true;
          } else if (classLower.includes('brand') || classLower.includes('site-identity')) {
            score += 10;
          } else if (classLower.includes('header') || classLower.includes('nav')) {
            score += 5;
          }
        }
        if (imgData.id) {
          const idLower = imgData.id.toLowerCase();
          if (idLower.includes('logo')) {
            score += 20; // Very strong indicator
            hasLogoInClassId = true;
          } else if (idLower.includes('brand') || idLower.includes('site-identity')) {
            score += 10;
          } else if (idLower.includes('header') || idLower.includes('nav')) {
            score += 5;
          }
        }
        
        // Parent element checks
        if (imgData.parentClassName) {
          const parentClassLower = imgData.parentClassName.toLowerCase();
          if (parentClassLower.includes('logo') || parentClassLower.includes('brand') || 
              parentClassLower.includes('header') || parentClassLower.includes('nav') || 
              parentClassLower.includes('site-identity')) {
            score += 5;
          }
        }
        if (imgData.parentId) {
          const parentIdLower = imgData.parentId.toLowerCase();
          if (parentIdLower.includes('logo') || parentIdLower.includes('brand') || 
              parentIdLower.includes('header') || parentIdLower.includes('nav') || 
              parentIdLower.includes('site-identity')) {
            score += 5;
          }
        }
        
        // Position checks (top < 200px) - logos are usually at the top
        if (imgData.position && imgData.position.top !== undefined) {
          if (imgData.position.top < 200) {
            score += 8; // Increased weight for top position
          }
          if (imgData.position.top < 100) {
            score += 5; // Extra bonus for very top
          }
          // Left alignment bonus (logos often left-aligned)
          if (imgData.position.left < 100) {
            score += 5; // Increased weight
          }
          // If it's in top-left quadrant and has logo indicators, extra bonus
          if (imgData.position.top < 200 && imgData.position.left < 200 && hasLogoInClassId) {
            score += 5;
          }
        }
        
        // Size checks (100-400px wide, aspect ratio ~1-3:1)
        if (imgData.width && imgData.height) {
          const aspectRatio = imgData.width / imgData.height;
          
          // Medium size (100-400px wide) - ideal for logos
          if (imgData.width >= 100 && imgData.width <= 400) {
            score += 5;
          }
          if (imgData.height >= 100 && imgData.height <= 400) {
            score += 3;
          }
          
          // Good aspect ratio for logos (1:1 to 3:1)
          if (aspectRatio >= 1 && aspectRatio <= 3) {
            score += 5;
          }
          
          // Penalize very small (icons) or very large (banners/photos)
          // BUT reduce penalty if we have strong logo indicators
          if (imgData.width < 50 || imgData.height < 50) {
            score -= 3;
          }
          if (imgData.width > 800 || imgData.height > 800) {
            // Only penalize if we don't have strong logo indicators
            if (!hasLogoInClassId && !imgData.alt) {
              score -= 3;
            } else {
              // Large but has logo indicators - might be a large logo, reduce penalty
              score -= 1;
            }
          }
        }
        
        // Context checks
        if (imgData.isInHeader) {
          score += 10;
        }
        if (imgData.isInNav) {
          score += 8;
        }
        if (imgData.isInHomepageLink) {
          score += 10;
        }
        if (imgData.isOnlyImageInLink) {
          score += 5;
        }
        
        return score;
      }
      
      // 1. Get all <img> tags with full metadata
      const imgElements = document.querySelectorAll('img');
      imgElements.forEach(img => {
        // Check multiple possible src attributes
        const possibleSrcs = [
          img.src,
          img.getAttribute('data-src'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-image'),
          img.getAttribute('data-img'),
          img.getAttribute('data-logo'),
          img.getAttribute('srcset')?.split(' ')[0]
        ];
        
        possibleSrcs.forEach(src => {
          if (src && (src.startsWith('http') || src.startsWith('data:image'))) {
            const normalizedUrl = normalizeUrl(src);
            if (!seenUrls.has(normalizedUrl)) {
              seenUrls.add(normalizedUrl);
              const filename = getFilename(normalizedUrl);
              const extension = getExtension(filename);
              
              // Only include if it's a valid image URL
              if (normalizedUrl.startsWith('data:image') || 
                  ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(extension) ||
                  normalizedUrl.toLowerCase().includes('/images/') ||
                  normalizedUrl.toLowerCase().includes('/img/') ||
                  normalizedUrl.toLowerCase().includes('/assets/') ||
                  normalizedUrl.toLowerCase().includes('/static/')) {
                
                // Get metadata
                const rect = img.getBoundingClientRect();
                const parent = img.parentElement;
                const parentLink = img.closest('a');
                
                // Extract pathname from URL
                let pathname = '';
                try {
                  const urlObj = new URL(normalizedUrl, baseUrl);
                  pathname = urlObj.pathname;
                } catch (e) {
                  // Ignore
                }
                
                // Check if in header/nav
                const isInHeader = img.closest('header') !== null || 
                                  img.closest('[class*="header"]') !== null ||
                                  img.closest('[id*="header"]') !== null;
                const isInNav = img.closest('nav') !== null || 
                               img.closest('[class*="nav"]') !== null ||
                               img.closest('[id*="nav"]') !== null;
                
                // Check if in homepage link
                let isInHomepageLink = false;
                let isOnlyImageInLink = false;
                if (parentLink) {
                  const linkHref = parentLink.href || '';
                  isInHomepageLink = linkHref === window.location.origin + '/' || 
                                    linkHref === window.location.origin ||
                                    linkHref.endsWith('/');
                  
                  // Check if link only contains this image
                  const linkChildren = Array.from(parentLink.children);
                  isOnlyImageInLink = linkChildren.length === 1 && linkChildren[0] === img;
                }
                
                const imageData = {
                  filename: filename || 'unnamed',
                  url: normalizedUrl,
                  extension: extension || (normalizedUrl.startsWith('data:image') ? 'data-uri' : 'unknown'),
                  source: 'img-tag',
                  pathname: pathname,
                  alt: img.alt || null,
                  className: img.className || null,
                  id: img.id || null,
                  parentTag: parent ? parent.tagName.toLowerCase() : null,
                  parentClassName: parent ? (parent.className || null) : null,
                  parentId: parent ? (parent.id || null) : null,
                  width: img.naturalWidth || img.width || 0,
                  height: img.naturalHeight || img.height || 0,
                  position: {
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom
                  },
                  isInHeader: isInHeader,
                  isInNav: isInNav,
                  isInHomepageLink: isInHomepageLink,
                  isOnlyImageInLink: isOnlyImageInLink
                };
                
                // Score the image
                imageData.logoScore = scoreImage(imageData);
                
                imageList.push(imageData);
              }
            }
          }
        });
      });
      
      // 2. Get CSS background images with metadata
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
          const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (match && match[1]) {
            const src = match[1];
            if (src && (src.startsWith('http') || src.startsWith('data:image'))) {
              const normalizedUrl = normalizeUrl(src);
              if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                const filename = getFilename(normalizedUrl);
                const extension = getExtension(filename);
                
                if (normalizedUrl.startsWith('data:image') || 
                    ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(extension) ||
                    normalizedUrl.toLowerCase().includes('/images/') ||
                    normalizedUrl.toLowerCase().includes('/img/')) {
                  
                  const rect = el.getBoundingClientRect();
                  let pathname = '';
                  try {
                    const urlObj = new URL(normalizedUrl, baseUrl);
                    pathname = urlObj.pathname;
                  } catch (e) {}
                  
                  const isInHeader = el.closest('header') !== null || 
                                    el.closest('[class*="header"]') !== null ||
                                    el.closest('[id*="header"]') !== null;
                  const isInNav = el.closest('nav') !== null || 
                                 el.closest('[class*="nav"]') !== null ||
                                 el.closest('[id*="nav"]') !== null;
                  
                  const imageData = {
                    filename: filename || 'unnamed',
                    url: normalizedUrl,
                    extension: extension || (normalizedUrl.startsWith('data:image') ? 'data-uri' : 'unknown'),
                    source: 'css-background',
                    pathname: pathname,
                    className: el.className || null,
                    id: el.id || null,
                    tagName: el.tagName.toLowerCase(),
                    position: {
                      top: rect.top,
                      left: rect.left,
                      right: rect.right,
                      bottom: rect.bottom
                    },
                    isInHeader: isInHeader,
                    isInNav: isInNav,
                    width: rect.width || 0,
                    height: rect.height || 0
                  };
                  
                  imageData.logoScore = scoreImage(imageData);
                  imageList.push(imageData);
                }
              }
            }
          }
        }
        
        // Check inline style attribute
        const styleAttr = el.getAttribute('style');
        if (styleAttr) {
          const bgMatch = styleAttr.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i);
          if (bgMatch && bgMatch[1]) {
            const src = bgMatch[1];
            if (src && (src.startsWith('http') || src.startsWith('data:image'))) {
              const normalizedUrl = normalizeUrl(src);
              if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                const filename = getFilename(normalizedUrl);
                const extension = getExtension(filename);
                
                if (normalizedUrl.startsWith('data:image') || 
                    ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(extension)) {
                  
                  const rect = el.getBoundingClientRect();
                  let pathname = '';
                  try {
                    const urlObj = new URL(normalizedUrl, baseUrl);
                    pathname = urlObj.pathname;
                  } catch (e) {}
                  
                  const imageData = {
                    filename: filename || 'unnamed',
                    url: normalizedUrl,
                    extension: extension || (normalizedUrl.startsWith('data:image') ? 'data-uri' : 'unknown'),
                    source: 'inline-style',
                    pathname: pathname,
                    className: el.className || null,
                    id: el.id || null,
                    tagName: el.tagName.toLowerCase(),
                    position: {
                      top: rect.top,
                      left: rect.left,
                      right: rect.right,
                      bottom: rect.bottom
                    },
                    width: rect.width || 0,
                    height: rect.height || 0
                  };
                  
                  imageData.logoScore = scoreImage(imageData);
                  imageList.push(imageData);
                }
              }
            }
          }
        }
      });
      
      // 3. Extract from page source/HTML for image URLs
      const htmlContent = document.documentElement.outerHTML;
      const imageUrlPattern = /(https?:\/\/[^\s"'<>]*\.(png|jpg|jpeg|svg|webp|gif|ico|bmp|tiff)[^\s"'<>]*)/gi;
      const matches = htmlContent.matchAll(imageUrlPattern);
      
      for (const match of matches) {
        if (match[1]) {
          const normalizedUrl = normalizeUrl(match[1]);
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            const filename = getFilename(normalizedUrl);
            const extension = getExtension(filename);
            
            let pathname = '';
            try {
              const urlObj = new URL(normalizedUrl, baseUrl);
              pathname = urlObj.pathname;
            } catch (e) {}
            
            const imageData = {
              filename: filename || 'unnamed',
              url: normalizedUrl,
              extension: extension || 'unknown',
              source: 'html-source',
              pathname: pathname
            };
            
            imageData.logoScore = scoreImage(imageData);
            imageList.push(imageData);
          }
        }
      }
      
      // 4. Check data attributes for image URLs
      const dataElements = document.querySelectorAll('*');
      dataElements.forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('data-') && attr.value) {
            // Check if value contains an image URL
            const urlMatch = attr.value.match(/(https?:\/\/[^\s"'<>]*\.(png|jpg|jpeg|svg|webp|gif|ico|bmp|tiff)[^\s"'<>]*)/i);
            if (urlMatch && urlMatch[1]) {
              const normalizedUrl = normalizeUrl(urlMatch[1]);
              if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                const filename = getFilename(normalizedUrl);
                const extension = getExtension(filename);
                
                imageList.push({
                  filename: filename || 'unnamed',
                  url: normalizedUrl,
                  extension: extension || 'unknown',
                  source: `data-attribute-${attr.name}`
                });
              }
            }
          }
        });
      });
      
      // Sort by logo score (highest first), then by source priority
      const sourcePriority = {
        'img-tag': 1,
        'css-background': 2,
        'inline-style': 3,
        'html-source': 4,
        'data-attribute': 5
      };
      
      imageList.sort((a, b) => {
        // First sort by logo score (if available)
        if (a.logoScore !== undefined && b.logoScore !== undefined) {
          if (b.logoScore !== a.logoScore) {
            return b.logoScore - a.logoScore;
          }
        }
        // Then by source priority
        const aPriority = sourcePriority[a.source.split('-')[0]] || 99;
        const bPriority = sourcePriority[b.source.split('-')[0]] || 99;
        return aPriority - bPriority;
      });
      
      return imageList;
    }, url);
    
    // Get favicon as fallback
    console.log('Checking for favicon...');
    const favicon = await getFavicon(page, url);
    
    await browser.close();
    
    // Add favicon to results if found and not already in list
    if (favicon) {
      const faviconInList = images.some(img => img.url === favicon);
      if (!faviconInList) {
        images.push({
          filename: 'favicon.ico',
          url: favicon,
          extension: 'ico',
          source: 'favicon',
          logoScore: 0,
          isFavicon: true
        });
      }
    }
    
    return images;
    
  } catch (error) {
    console.error(`Error extracting images: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: node imageExtractor.js <URL>');
    console.error('Example: node imageExtractor.js https://example.com');
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
    const images = await extractAllImages(url);
    
    // Process base64 images - save them to files
    const base64Images = images.filter(img => img.url && img.url.startsWith('data:image'));
    const savedImages = [];
    
    if (base64Images.length > 0) {
      console.log(`\nFound ${base64Images.length} base64 image(s). Saving to files...`);
      const outputDir = 'extracted_images';
      
      base64Images.forEach((img, index) => {
        const saveResult = saveBase64Image(img.url, img.filename || `base64_image_${index}`, outputDir);
        if (saveResult) {
          savedImages.push({
            originalUrl: img.url.substring(0, 50) + '...', // Truncate for display
            savedPath: saveResult.savedPath,
            filename: saveResult.filename,
            size: saveResult.size,
            format: saveResult.format
          });
          
          // Update the image object with saved file info
          img.savedAsFile = saveResult.savedPath;
          img.fileSize = saveResult.size;
          img.imageFormat = saveResult.format;
          img.isBase64 = true;
        }
      });
      
      if (savedImages.length > 0) {
        console.log(`Saved ${savedImages.length} base64 image(s) to ${outputDir}/ directory`);
      }
    }
    
    // Find the highest scoring logo candidate
    const scoredImages = images.filter(img => img.logoScore !== undefined && img.logoScore > 0);
    const topLogo = scoredImages.length > 0 
      ? scoredImages.reduce((prev, current) => (prev.logoScore > current.logoScore) ? prev : current)
      : null;
    
    // Only return top logo candidate URL in JSON
    const result = {
      url: url,
      logo_url: topLogo ? topLogo.url : null
    };
    
    // Output only top logo candidate to terminal
    if (topLogo) {
      console.log(`\nTop logo candidate (score: ${topLogo.logoScore}):`);
      console.log(`  Filename: ${topLogo.filename}`);
      if (topLogo.savedAsFile) {
        console.log(`  Saved as: ${topLogo.savedAsFile}`);
      } else {
        const displayUrl = topLogo.url.length > 100 ? topLogo.url.substring(0, 100) + '...' : topLogo.url;
        console.log(`  URL: ${displayUrl}`);
      }
      if (topLogo.alt) {
        console.log(`  Alt text: ${topLogo.alt}`);
      }
      if (topLogo.className) {
        console.log(`  Class: ${topLogo.className}`);
      }
    } else {
      console.log('\nNo logo candidate found with score > 0');
    }
    
    // Save full result to images.json (no console output)
    writeFileSync('images.json', JSON.stringify(result, null, 2));
    console.log(`\nFull results saved to images.json (${images.length} images)`);
    
  } catch (error) {
    console.error(`Failed to extract images: ${error.message}`);
    const errorResult = { 
      url: url,
      total_images: 0,
      images: [],
      error: error.message 
    };
    console.log(JSON.stringify(errorResult, null, 2));
    writeFileSync('images.json', JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('imageExtractor.js');

if (isMainModule) {
  main();
}

/**
 * Save base64 image data to file
 */
function saveBase64Image(base64Data, filename, outputDir = 'extracted_images') {
  try {
    // Create output directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // Extract base64 data (remove data:image/type;base64, prefix)
    const base64Match = base64Data.match(/^data:image\/([a-z]+);base64,(.+)$/i);
    if (!base64Match) {
      console.warn(`Invalid base64 format for ${filename}`);
      return null;
    }
    
    const imageType = base64Match[1];
    const base64Content = base64Match[2];
    
    // Determine file extension from image type
    const extensionMap = {
      'jpeg': 'jpg',
      'jpg': 'jpg',
      'png': 'png',
      'gif': 'gif',
      'svg+xml': 'svg',
      'webp': 'webp',
      'ico': 'ico',
      'bmp': 'bmp'
    };
    
    const extension = extensionMap[imageType] || imageType;
    
    // Generate filename if not provided or if it's "unnamed"
    let finalFilename = filename;
    if (!finalFilename || finalFilename === 'unnamed' || !finalFilename.includes('.')) {
      const timestamp = Date.now();
      finalFilename = `image_${timestamp}.${extension}`;
    } else {
      // Ensure filename has correct extension
      const currentExt = finalFilename.split('.').pop();
      if (currentExt !== extension) {
        finalFilename = `${finalFilename.split('.')[0]}.${extension}`;
      }
    }
    
    // Decode base64 and save
    const buffer = Buffer.from(base64Content, 'base64');
    const filePath = join(outputDir, finalFilename);
    writeFileSync(filePath, buffer);
    
    return {
      savedPath: filePath,
      filename: finalFilename,
      size: buffer.length,
      format: imageType
    };
  } catch (error) {
    console.error(`Error saving base64 image ${filename}: ${error.message}`);
    return null;
  }
}

/**
 * Get favicon from the page
 */
async function getFavicon(page, url) {
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

export { extractAllImages };

