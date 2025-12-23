import sharp from 'sharp';
import { createBrowserContext } from './utils/browser.js';
import { getFaviconUrl } from './utils/faviconHelpers.js';
import { validateUrl } from './utils/urlHelpers.js';

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
      
      // Wait for image to load with fewer retries (optimized)
      let imgElement = null;
      for (let i = 0; i < 3; i++) { // Reduced from 5 to 3
        await page.waitForTimeout(300); // Reduced from 500ms
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
      
      // Fallback: try loading via data URL or fetch (use 'load' for faster response)
      try {
        const response = await page.goto(imageUrl, { waitUntil: 'load', timeout: 10000 });
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
            await page.waitForTimeout(500); // Reduced from 1000ms
            
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
    
    // For other formats, download normally (use 'load' for faster response)
    const response = await page.goto(imageUrl, { waitUntil: 'load', timeout: 10000 });
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
 * Convert RGB array to hex string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Extract dominant colors from image using optimized quantization
 * Uses pixel sampling and quantized color buckets for better performance
 */
function extractDominantColors(pixels, colorCount = 5) {
  const colorMap = new Map();
  const threshold = 30; // Color similarity threshold
  const quantizeStep = 10; // Quantize colors to reduce comparisons
  
  // Sample pixels for better performance (process every 2nd pixel)
  // This reduces processing time by ~50% with minimal quality loss
  const sampleRate = 2;
  const maxPixels = 15000; // Limit processing for very large images
  
  let processedCount = 0;
  const totalPixels = pixels.length / 4;
  const pixelLimit = Math.min(totalPixels, maxPixels);
  
  for (let i = 0; i < pixels.length && processedCount < pixelLimit; i += 4 * sampleRate) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    processedCount++;
    
    // Quantize color to reduce number of comparisons
    const quantizedR = Math.floor(r / quantizeStep) * quantizeStep;
    const quantizedG = Math.floor(g / quantizeStep) * quantizeStep;
    const quantizedB = Math.floor(b / quantizeStep) * quantizeStep;
    const quantizedKey = `${quantizedR},${quantizedG},${quantizedB}`;
    
    // Check if quantized color exists (much faster than checking all colors)
    if (colorMap.has(quantizedKey)) {
      colorMap.set(quantizedKey, colorMap.get(quantizedKey) + 1);
    } else {
      // Check if similar color exists (only check nearby quantized buckets)
      let found = false;
      for (const [key, count] of colorMap.entries()) {
        const [keyR, keyG, keyB] = key.split(',').map(Number);
        const diff = Math.abs(r - keyR) + Math.abs(g - keyG) + Math.abs(b - keyB);
        
        if (diff < threshold) {
          colorMap.set(key, count + 1);
          found = true;
          break;
        }
      }
      
      if (!found) {
        colorMap.set(quantizedKey, 1);
      }
    }
    
    // Early exit: if we have enough color candidates and processed enough pixels
    if (colorMap.size >= colorCount * 2 && processedCount > pixelLimit * 0.5) {
      // We have enough candidates, continue to get accurate frequencies but can exit early if needed
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
 * Add secondary color fallback if only primary color found
 */
function addSecondaryColorFallback(colors) {
  if (colors.primary && !colors.secondary) {
    const isLight = isLightColor(colors.primary);
    colors.secondary = isLight ? '#000000' : '#FFFFFF';
    console.log(`Only one color found. Using ${colors.secondary} as secondary (${isLight ? 'light' : 'dark'} primary color)`);
  }
  return colors;
}

/**
 * Main function to extract colors from website favicon
 */
async function extractFaviconColors(url) {
  let browser;
  
  try {
    // Validate URL
    if (!validateUrl(url)) {
      throw new Error('Invalid URL. Please provide a valid HTTP/HTTPS URL.');
    }

    // Create browser context
    const { browser: browserInstance, page } = await createBrowserContext();
    browser = browserInstance;

    // Navigate to the URL (use faster 'load' strategy first)
    console.log(`Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (error) {
      // Fallback to networkidle if load fails
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    }

    // Get favicon URL
    console.log('Finding favicon...');
    const faviconUrl = await getFaviconUrl(page, url);
    
    if (!faviconUrl) {
      throw new Error('Could not find favicon for this website');
    }

    console.log(`Found favicon at: ${faviconUrl}`);

    // Download favicon
    console.log('Downloading favicon...');
    const imageBuffer = await downloadImage(page, faviconUrl);

    // Extract colors
    console.log('Extracting colors...');
    let colors = await extractColors(imageBuffer);

    // Add secondary color fallback if needed
    colors = addSecondaryColorFallback(colors);

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
    if (!validateUrl(imageUrl)) {
      throw new Error('Invalid URL. Please provide a valid HTTP/HTTPS URL.');
    }

    // Create browser context
    const { browser: browserInstance, page } = await createBrowserContext();
    browser = browserInstance;

    // Download image
    console.log(`Downloading image from ${imageUrl}...`);
    const imageBuffer = await downloadImage(page, imageUrl);

    // Extract colors
    console.log('Extracting colors...');
    let colors = await extractColors(imageBuffer);

    // Add secondary color fallback if needed
    colors = addSecondaryColorFallback(colors);

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
