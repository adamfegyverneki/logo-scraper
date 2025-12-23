import { chromium } from 'playwright';
import sharp from 'sharp';
import { URL } from 'url';

/**
 * Get favicon URL from a website
 */
async function getFaviconUrl(page, baseUrl) {
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
      const response = await page.goto(faviconUrl, { waitUntil: 'networkidle', timeout: 5000 });
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
 * Download image as buffer, converting ICO to PNG if needed
 */
async function downloadImage(page, imageUrl) {
  try {
    // For ICO files, always use Playwright screenshot method for reliable conversion
    // Check if URL contains .ico (before query parameters)
    const urlWithoutQuery = imageUrl.toLowerCase().split('?')[0];
    const isIcoFile = urlWithoutQuery.endsWith('.ico') || imageUrl.toLowerCase().includes('/favicon.ico');
    
    if (isIcoFile) {
      // Create a simple HTML page with the image
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { margin: 0; padding: 0; background: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
              img { display: block; max-width: 256px; max-height: 256px; image-rendering: -webkit-optimize-contrast; }
            </style>
          </head>
          <body>
            <img src="${imageUrl}" alt="image" onerror="this.style.display='none'" />
          </body>
        </html>
      `;
      
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      
      // Wait for image to load with multiple retries
      let imgElement = null;
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(500);
        imgElement = await page.$('img');
        if (imgElement) {
          // Check if image is actually loaded
          const isLoaded = await page.evaluate((img) => {
            return img.complete && img.naturalWidth > 0;
          }, imgElement);
          if (isLoaded) {
            break;
          }
        }
      }
      
      if (imgElement) {
        try {
          const screenshot = await imgElement.screenshot({ type: 'png' });
          if (screenshot && screenshot.length > 0) {
            return screenshot;
          }
        } catch (screenshotError) {
          console.log('  Screenshot conversion failed, trying alternative method...');
        }
      }
      
      // Fallback: try loading via data URL or fetch
      try {
        const response = await page.goto(imageUrl, { waitUntil: 'networkidle', timeout: 10000 });
        if (response && response.status() === 200) {
          const buffer = await response.body();
          const contentType = response.headers()['content-type'] || '';
          
          // If it's actually an ICO file, try to load it in browser and screenshot
          if (contentType.includes('x-icon') || contentType.includes('vnd.microsoft.icon') || isIcoFile) {
            // Try loading the ICO as a data URL and screenshotting
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/x-icon;base64,${base64}`;
            
            const htmlWithDataUrl = `
              <!DOCTYPE html>
              <html>
                <head>
                  <style>
                    body { margin: 0; padding: 0; background: white; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                    img { display: block; max-width: 256px; max-height: 256px; }
                  </style>
                </head>
                <body>
                  <img src="${dataUrl}" alt="favicon" />
                </body>
              </html>
            `;
            
            await page.setContent(htmlWithDataUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);
            
            const imgEl = await page.$('img');
            if (imgEl) {
              const screenshot = await imgEl.screenshot({ type: 'png' });
              if (screenshot && screenshot.length > 0) {
                return screenshot;
              }
            }
          }
          
          // Try to convert with sharp as last resort (sharp doesn't support ICO natively)
          try {
            return await sharp(buffer, { failOn: 'none' }).png().toBuffer();
          } catch (e) {
            throw new Error('ICO format not supported by image processor');
          }
        }
      } catch (fallbackError) {
        throw new Error('Failed to convert ICO file');
      }
    }
    
    // For other formats, download normally
    const response = await page.goto(imageUrl, { waitUntil: 'networkidle', timeout: 10000 });
    if (!response || response.status() !== 200) {
      throw new Error(`Failed to download image: ${response?.status()}`);
    }
    
    const buffer = await response.body();
    return buffer;
  } catch (error) {
    throw new Error(`Error downloading image: ${error.message}`);
  }
}

/**
 * Download favicon image as buffer, converting ICO to PNG if needed
 */
async function downloadFavicon(page, faviconUrl) {
  return downloadImage(page, faviconUrl);
}

/**
 * Convert RGB array to hex string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Extract dominant colors from image using quantization
 */
function extractDominantColors(pixels, colorCount = 5) {
  // Simple color quantization: group similar colors
  const colorMap = new Map();
  const threshold = 30; // Color similarity threshold
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    // Find existing similar color or create new one
    let found = false;
    for (const [key, value] of colorMap.entries()) {
      const [keyR, keyG, keyB] = key.split(',').map(Number);
      const diff = Math.abs(r - keyR) + Math.abs(g - keyG) + Math.abs(b - keyB);
      
      if (diff < threshold) {
        colorMap.set(key, value + 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      colorMap.set(`${r},${g},${b}`, 1);
    }
  }
  
  // Sort by frequency and get top colors
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, colorCount)
    .map(([rgb]) => {
      const [r, g, b] = rgb.split(',').map(Number);
      return { r, g, b };
    });
  
  return sortedColors;
}

/**
 * Extract colors from image buffer
 */
async function extractColors(imageBuffer) {
  try {
    // Process image with sharp: resize for performance and get raw pixel data
    // Sharp should handle PNG, JPEG, WebP, etc. If it's ICO, it should already be converted to PNG
    const { data, info } = await sharp(imageBuffer, { failOn: 'none' })
      .resize(100, 100, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Extract dominant colors
    const colors = extractDominantColors(data, 5);
    
    if (!colors || colors.length === 0) {
      throw new Error('No colors found in image');
    }

    // Primary color is the first (most dominant) color
    const primary = colors[0];
    const primaryHex = rgbToHex(primary.r, primary.g, primary.b);

    // Secondary color - find the most different color from primary
    let secondaryHex = null;
    if (colors.length > 1) {
      let maxDiff = 0;
      let bestSecondary = null;
      
      for (let i = 1; i < colors.length; i++) {
        const color = colors[i];
        // Calculate color difference (Euclidean distance in RGB space)
        const diff = Math.sqrt(
          Math.pow(color.r - primary.r, 2) +
          Math.pow(color.g - primary.g, 2) +
          Math.pow(color.b - primary.b, 2)
        );
        
        if (diff > maxDiff) {
          maxDiff = diff;
          bestSecondary = color;
        }
      }
      
      if (bestSecondary) {
        secondaryHex = rgbToHex(bestSecondary.r, bestSecondary.g, bestSecondary.b);
      }
    }

    return { primary: primaryHex, secondary: secondaryHex };
  } catch (error) {
    throw new Error(`Error extracting colors: ${error.message}`);
  }
}

/**
 * Determine if a color is light or dark
 */
function isLightColor(hex) {
  if (!hex) return false;
  // Remove # if present
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/**
 * Main function to extract colors from website favicon
 */
async function extractFaviconColors(url) {
  let browser;
  
  try {
    // Validate URL
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL. Please provide a valid HTTP/HTTPS URL.');
    }

    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      return page.goto(url, { waitUntil: 'load', timeout: 30000 });
    });

    // Get favicon URL
    console.log('Finding favicon...');
    const faviconUrl = await getFaviconUrl(page, url);
    
    if (!faviconUrl) {
      throw new Error('Could not find favicon for this website');
    }

    console.log(`Found favicon at: ${faviconUrl}`);

    // Download favicon
    console.log('Downloading favicon...');
    const imageBuffer = await downloadFavicon(page, faviconUrl);

    // Extract colors
    console.log('Extracting colors...');
    let colors = await extractColors(imageBuffer);

    // If only one color found, use black or white as secondary
    if (colors.primary && !colors.secondary) {
      const isLight = isLightColor(colors.primary);
      colors.secondary = isLight ? '#000000' : '#FFFFFF';
      console.log(`Only one color found. Using ${colors.secondary} as secondary (${isLight ? 'light' : 'dark'} primary color)`);
    }

    // If no colors found at all, return error
    if (!colors.primary) {
      throw new Error('Could not extract colors from favicon');
    }

    return colors;

  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Extract colors from any image URL (not just favicon)
 */
async function extractColorsFromImageUrl(imageUrl) {
  let browser;
  
  try {
    // Validate URL
    if (!imageUrl || !imageUrl.startsWith('http')) {
      throw new Error('Invalid URL. Please provide a valid HTTP/HTTPS URL.');
    }

    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Download image
    console.log(`Downloading image from ${imageUrl}...`);
    const imageBuffer = await downloadImage(page, imageUrl);

    // Extract colors
    console.log('Extracting colors...');
    let colors = await extractColors(imageBuffer);

    // If only one color found, use black or white as secondary
    if (colors.primary && !colors.secondary) {
      const isLight = isLightColor(colors.primary);
      colors.secondary = isLight ? '#000000' : '#FFFFFF';
    }

    // If no colors found at all, return error
    if (!colors.primary) {
      throw new Error('Could not extract colors from image');
    }

    return colors;

  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export { extractFaviconColors, extractColorsFromImageUrl };

// Main execution
const url = process.argv[2];

if (!url) {
  console.error('Usage: node colorExtractor.js <website-url>');
  console.error('Example: node colorExtractor.js https://example.com');
  process.exit(1);
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('colorExtractor.js');

if (isMainModule) {
  extractFaviconColors(url)
    .then(colors => {
      const result = {
        url: url,
        primary: colors.primary,
        secondary: colors.secondary
      };
      console.log('\nResult:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
