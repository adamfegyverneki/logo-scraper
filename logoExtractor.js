import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

/**
 * Navigate to a URL with fallback strategies for timeout handling
 */
async function navigateWithFallback(page, url, options = {}) {
  const timeout = options.timeout || 30000;
  const waitAfter = options.waitAfter || 1000; // Reduced from 2000 to 1000
  
  try {
    // Try load first (faster than networkidle)
    await page.goto(url, { waitUntil: 'load', timeout: timeout });
    if (waitAfter > 0) {
      await page.waitForTimeout(waitAfter);
    }
  } catch (error) {
    try {
      console.log('  load timeout, trying domcontentloaded...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
      if (waitAfter > 0) {
        await page.waitForTimeout(waitAfter);
      }
    } catch (error2) {
      // Last resort - just wait a bit
      console.log('  Using domcontentloaded with extended wait...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
      if (waitAfter > 0) {
        await page.waitForTimeout(waitAfter);
      }
    }
  }
}

/**
 * Extract all image files from a website
 * @param {string} url - The URL to extract images from
 * @param {string} [faviconUrl] - Optional favicon URL to add to the images list
 */
async function extractAllImages(url, faviconUrl = null) {
  let browser;
  
  try {
    // Launch browser with realistic user agent to avoid bot detection
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    const page = await context.newPage();
    
    // Set additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    await navigateWithFallback(page, url, { waitAfter: 1000 });
    
    // Wait for dynamic content to load (reduced from 3000ms)
    await page.waitForTimeout(1500);
    
    // Wait for SVG elements to be present (they might load dynamically)
    // Reduced retries and wait times
    let svgFound = false;
    for (let i = 0; i < 3; i++) { // Reduced from 5 to 3
      try {
        await page.waitForSelector('svg', { timeout: 2000 }); // Reduced from 3000
        svgFound = true;
        break;
      } catch (e) {
        // Wait a bit and try again (reduced from 2000ms)
        if (i < 2) await page.waitForTimeout(1000);
      }
    }
    
    // Scroll the page to trigger any lazy-loaded content
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(1000); // Reduced from 2000
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000); // Reduced from 2000
      
      // Try waiting for SVG again after scrolling
      if (!svgFound) {
        try {
          await page.waitForSelector('svg', { timeout: 3000 }); // Reduced from 5000
          svgFound = true;
        } catch (e) {
          // Still not found
        }
      }
      
      // Wait for network activity to settle (reduced from 3000ms)
      await page.waitForTimeout(1500);
    } catch (e) {
      // Ignore scroll errors
    }
    
    // Final wait for any remaining dynamic content (reduced from 3000ms)
    await page.waitForTimeout(1500);
    
    return await extractAllImagesWithPage(page, url, faviconUrl);
    
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
 * Internal function to extract images using an existing page
 * @param {Page} page - Playwright page object (should already be navigated to the URL)
 * @param {string} url - Base URL
 * @param {string} [faviconUrl] - Optional favicon URL to add to the images list
 */
async function extractAllImagesWithPage(page, url, faviconUrl = null) {
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
      
      // Helper function to extract domain from URL
      function getDomain(urlString) {
        try {
          const url = new URL(urlString, baseUrl);
          return url.hostname.toLowerCase().replace(/^www\./, '');
        } catch (e) {
          return '';
        }
      }
      
      const siteDomain = getDomain(baseUrl);
      
      // Extract site name from domain (e.g., "appartman" from "appartman.hu", "debrecen" from "invest.debrecen.hu")
      function getSiteName(domain) {
        if (!domain) return '';
        const parts = domain.split('.');
        if (parts.length >= 3) {
          // For subdomains like "invest.debrecen.hu", return the main domain part ("debrecen")
          // Skip common subdomains like "www", "invest", "www2", etc.
          const commonSubdomains = ['www', 'www2', 'www3', 'invest', 'admin', 'app', 'api', 'blog', 'mail', 'ftp', 'cdn', 'static', 'assets', 'media', 'images', 'img'];
          const mainPart = parts[parts.length - 2]; // Second to last part (before TLD)
          const subdomainPart = parts[parts.length - 3]; // Third to last part
          
          // If the subdomain is common, use the main part; otherwise check if main part is more meaningful
          if (commonSubdomains.includes(subdomainPart.toLowerCase())) {
            return mainPart;
          }
          // If main part is very short (1-2 chars) or looks like a code, prefer subdomain
          if (mainPart.length <= 2 || /^\d+$/.test(mainPart)) {
            return subdomainPart;
          }
          return mainPart;
        } else if (parts.length >= 2) {
          return parts[0]; // Get the main part before the TLD
        }
        return domain;
      }
      
      const siteName = getSiteName(siteDomain);
      
      // Known third-party service names that should be penalized
      const thirdPartyServices = [
        'stripe', 'paypal', 'visa', 'mastercard', 'amex', 'discover',
        'google', 'facebook', 'twitter', 'linkedin', 'instagram', 'youtube',
        'microsoft', 'apple', 'amazon', 'aws', 'azure', 'github', 'gitlab',
        'slack', 'zoom', 'dropbox', 'salesforce', 'shopify', 'woocommerce',
        'wordpress', 'drupal', 'joomla', 'magento', 'prestashop'
      ];
      
      // Helper function to score an image based on logo indicators
      function scoreImage(imgData) {
        let score = 0;
        const urlLower = imgData.url.toLowerCase();
        const filenameLower = imgData.filename.toLowerCase();
        const pathLower = imgData.pathname?.toLowerCase() || '';
        const imageDomain = getDomain(imgData.url);
        
        // URL/Filename keywords - declare early for use in site name checks
        const hasLogoInFilename = filenameLower.includes('logo');
        const hasLogoInPath = pathLower.includes('logo');
        
        // Check if filename/URL contains site name (very strong indicator of main logo)
        let hasSiteName = false;
        if (siteName && siteName.length > 2) {
          const siteNameLower = siteName.toLowerCase();
          if (filenameLower.includes(siteNameLower) || urlLower.includes(siteNameLower) || pathLower.includes(siteNameLower)) {
            hasSiteName = true;
            score += 50; // Very strong bonus for site name in logo (increased from 40)
            
            // Extra bonus if site name is at the start of filename (e.g., "appartman-logo.png")
            if (filenameLower.startsWith(siteNameLower) || filenameLower.startsWith(siteNameLower + '-') || filenameLower.startsWith(siteNameLower + '_')) {
              score += 15; // Additional bonus for site name at start
            }
          }
        }
        
        // Penalize logos that don't have site name (unless they're clearly main logos by other indicators)
        // This helps prioritize site-name-containing logos over generic/partner logos
        if (!hasSiteName && siteName && siteName.length > 2 && hasLogoInFilename) {
          // If it's a logo but doesn't contain site name, it might be a partner/certification logo
          // Apply penalty, but heavier if it has other organization names (like "edc", "dif")
          const hasOtherOrgName = filenameLower.match(/\b(edc|dif|partner|sponsor|affiliate|certified|certification)\b/);
          const hasStrongLogoIndicators = imgData.alt && imgData.alt.toLowerCase().includes('logo') ||
                                         imgData.className && imgData.className.toLowerCase().includes('logo') ||
                                         imgData.id && imgData.id.toLowerCase().includes('logo');
          
          if (hasOtherOrgName) {
            score -= 30; // Heavy penalty for logos with other organization names (partner logos)
          } else if (!hasStrongLogoIndicators) {
            score -= 20; // Increased penalty for logo without site name and without strong indicators
          } else {
            score -= 10; // Smaller penalty if it has strong logo indicators
          }
        }
        
        // Penalize third-party service logos, BUT only if they don't match the site name
        // (e.g., if on stripe.com, "stripe" should be treated as site name, not penalized)
        const matchingThirdPartyService = thirdPartyServices.find(service => 
          (filenameLower.includes(service) || urlLower.includes('/' + service) || pathLower.includes('/' + service)) &&
          service.toLowerCase() === siteName.toLowerCase()
        );
        
        const hasThirdPartyName = thirdPartyServices.some(service => 
          (filenameLower.includes(service) || urlLower.includes('/' + service) || pathLower.includes('/' + service)) &&
          service.toLowerCase() !== siteName.toLowerCase() // Only if it's NOT the site's own name
        );
        
        // Only penalize if it's a third-party service that doesn't match the site name
        if (hasThirdPartyName && !matchingThirdPartyService) {
          score -= 40; // Heavy penalty for third-party service logos (that aren't the site itself)
        }
        
        // If the third-party service matches the site name, treat it as site name match
        if (matchingThirdPartyService && siteName && siteName.length > 2) {
          const siteNameLower = siteName.toLowerCase();
          if (filenameLower.includes(siteNameLower) || urlLower.includes(siteNameLower) || pathLower.includes(siteNameLower)) {
            // Already got the site name bonus above, but ensure we don't penalize
            score += 0; // No additional change needed, site name bonus already applied
          }
        }
        
        // Penalize partner/ad/sponsor logos - these are NOT the main site logo
        if (urlLower.includes('/partners/') || urlLower.includes('/partner/') ||
            urlLower.includes('/ads/') || urlLower.includes('/ad/') ||
            urlLower.includes('/sponsors/') || urlLower.includes('/sponsor/') ||
            urlLower.includes('/advertisements/') || urlLower.includes('/advertisement/') ||
            pathLower.includes('/partners/') || pathLower.includes('/partner/') ||
            pathLower.includes('/ads/') || pathLower.includes('/ad/')) {
          score -= 30; // Heavy penalty for partner/ad logos
        }
        
        // Penalize images with hash IDs in filename (often generated/partner logos)
        if (filenameLower.match(/[0-9a-f]{20,}/) || filenameLower.match(/\d{10,}/)) {
          score -= 10; // Penalty for hash-like filenames
        }
        
        // Bonus for inline SVGs and SVG sprites - they're very commonly used for logos
        // Give them a very high base score since inline SVGs are almost always logos
        if (imgData.source === 'inline-svg' || imgData.source === 'svg-sprite') {
          score += 30; // Very strong indicator that it's a logo
        }
        
        // Domain matching bonus - main site logos are usually on the same domain or CDN
        if (imageDomain && siteDomain) {
          // Check if image is on same domain or subdomain
          if (imageDomain === siteDomain || imageDomain.endsWith('.' + siteDomain)) {
            score += 15; // Bonus for same domain
          }
          // Check if image is on a CDN that includes the site domain (e.g., cdn.example.com)
          if (imageDomain.includes(siteDomain.replace('.', '')) || 
              urlLower.includes(siteDomain.replace('.', '-'))) {
            score += 10; // Bonus for CDN with site domain
          }
        }
        
        // URL/Filename keywords (+10 for "logo", +5 for others)
        // Note: hasLogoInFilename and hasLogoInPath are declared earlier
        if (hasLogoInFilename || hasLogoInPath) {
          score += 10;
          
          // Extra bonus for "logo" in filename - this is a very strong indicator
          // Especially if combined with common logo path patterns
          if (hasLogoInFilename) {
            score += 15; // Additional bonus for logo in filename
            
            // Check if it's in a common logo/assets directory (check both URL and pathname)
            const isInLogoDirectory = urlLower.includes('/assets/') || urlLower.includes('/images/') || 
                                     urlLower.includes('/logo') || urlLower.includes('/brand') ||
                                     pathLower.includes('/assets/') || pathLower.includes('/images/') ||
                                     pathLower.includes('/logo') || pathLower.includes('/brand');
            
            if (isInLogoDirectory) {
              score += 10; // Extra bonus for being in logo-related directories
            }
            
            // If filename contains "logo" and it's a simple, clean filename (not a hash)
            // This indicates it's likely the main site logo
            // Patterns like "logo-full-color.png", "logo.png", "site-logo.png"
            if (filenameLower.match(/^logo[-_]/) || filenameLower.match(/[-_]logo/) || 
                filenameLower === 'logo.png' || filenameLower === 'logo.svg') {
              score += 10; // Bonus for standard logo naming patterns
            }
            
            // Extra bonus if filename is simple and contains "logo" (not a hash or complex name)
            // This helps identify main site logos vs partner/ad logos
            if (filenameLower.match(/^logo[-_]/) && !filenameLower.match(/[0-9a-f]{20,}/)) {
              score += 5; // Bonus for clean logo filename without hash
            }
            
            // Extra bonus for main logo naming patterns (logo-full-color, logo-white, etc.)
            if (filenameLower.match(/^logo-(full|white|black|color|main|site|primary)/)) {
              score += 10; // Strong indicator of main site logo
            }
          }
        }
        
        // Bonus for being in main logo directories
        const isMainLogoDirectory = urlLower.includes('/assets/images/') || 
                                   urlLower.includes('/assets/logo') ||
                                   urlLower.includes('/images/logo') ||
                                   urlLower.includes('/static/images/') ||
                                   urlLower.includes('/static/logo') ||
                                   pathLower.includes('/assets/images/') ||
                                   pathLower.includes('/images/logo');
        
        if (isMainLogoDirectory && hasLogoInFilename) {
          score += 15; // Strong bonus for logo in main logo directory
        }
        
        // Penalize images that are clearly NOT the main logo
        // Partner logos, ad logos, etc. often have partner/advertiser names in filename
        const partnerIndicators = ['partner', 'sponsor', 'ad', 'advertisement', 'affiliate'];
        const hasPartnerIndicator = partnerIndicators.some(indicator => 
          filenameLower.includes(indicator) || urlLower.includes('/' + indicator + '/')
        );
        
        if (hasPartnerIndicator && !hasLogoInFilename) {
          score -= 20; // Penalty for partner/ad without "logo" in name
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
          
          // Check if alt text contains site name (very strong indicator)
          if (siteName && siteName.length > 2 && altLower.includes(siteName.toLowerCase())) {
            score += 20; // Very strong bonus for site name in alt
          }
          
          // Penalize if alt text is a third-party service name (but not if it matches site name)
          const altIsThirdParty = thirdPartyServices.some(service => 
            (altLower === service || altLower.includes(service)) && 
            service.toLowerCase() !== siteName.toLowerCase()
          );
          
          if (hasThirdPartyName && altIsThirdParty) {
            score -= 15; // Penalty for third-party service in alt (that isn't the site itself)
          }
          
          // Company name in alt is also a strong indicator (e.g., "Facebook", "Google")
          // But only if it's NOT a third-party service (or if it IS the site's own name)
          if (altLower.length > 0 && altLower.length < 50 && !altLower.includes(' ') && (!hasThirdPartyName || altLower === siteName.toLowerCase())) {
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
        
        // Extra bonus for inline SVGs and SVG sprites in prominent positions (top-left, header, nav)
        // These are almost certainly logos
        if (imgData.source === 'inline-svg' || imgData.source === 'svg-sprite') {
          if (imgData.isInHeader || imgData.isInNav) {
            score += 10; // Additional bonus for SVG in header/nav
          }
          if (imgData.position && imgData.position.top !== undefined && 
              imgData.position.top < 200 && imgData.position.left < 200) {
            score += 8; // Bonus for SVG in top-left quadrant
          }
          if (imgData.isInHomepageLink) {
            score += 10; // SVG in homepage link is very likely the logo
          }
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
      
      // 2. Get inline SVG elements with metadata
      const svgElements = document.querySelectorAll('svg');
      svgElements.forEach(svg => {
        try {
          // Get SVG outerHTML
          const svgHtml = svg.outerHTML;
          
          // Convert to base64 data URI
          // Note: btoa doesn't handle UTF-8 well, so we need to encode properly
          const svgEncoded = btoa(unescape(encodeURIComponent(svgHtml)));
          const dataUri = `data:image/svg+xml;base64,${svgEncoded}`;
          
          // Check if we've already seen this SVG (by comparing data URI)
          if (!seenUrls.has(dataUri)) {
            seenUrls.add(dataUri);
            
            // Get metadata
            const rect = svg.getBoundingClientRect();
            const parent = svg.parentElement;
            const parentLink = svg.closest('a');
            
            // Check if in header/nav
            const isInHeader = svg.closest('header') !== null || 
                              svg.closest('[class*="header"]') !== null ||
                              svg.closest('[id*="header"]') !== null;
            const isInNav = svg.closest('nav') !== null || 
                           svg.closest('[class*="nav"]') !== null ||
                           svg.closest('[id*="nav"]') !== null;
            
            // Check if in homepage link
            let isInHomepageLink = false;
            let isOnlyImageInLink = false;
            if (parentLink) {
              const linkHref = parentLink.href || '';
              isInHomepageLink = linkHref === window.location.origin + '/' || 
                                linkHref === window.location.origin ||
                                linkHref.endsWith('/');
              
              // Check if link only contains this SVG
              const linkChildren = Array.from(parentLink.children);
              isOnlyImageInLink = linkChildren.length === 1 && linkChildren[0] === svg;
            }
            
            // Get width/height from SVG attributes or computed style
            let svgWidth = 0;
            let svgHeight = 0;
            
            // Try to get from SVG attributes first
            const widthAttr = svg.getAttribute('width');
            const heightAttr = svg.getAttribute('height');
            const viewBox = svg.getAttribute('viewBox');
            
            // Parse width/height attributes
            const parsedWidth = widthAttr ? parseFloat(widthAttr) : 0;
            const parsedHeight = heightAttr ? parseFloat(heightAttr) : 0;
            
            // Use attributes only if both are valid (> 0)
            if (parsedWidth > 0 && parsedHeight > 0) {
              svgWidth = parsedWidth;
              svgHeight = parsedHeight;
            } else if (viewBox) {
              // Extract from viewBox if width/height not specified or invalid
              const viewBoxValues = viewBox.split(/\s+/);
              if (viewBoxValues.length >= 4) {
                svgWidth = parseFloat(viewBoxValues[2]) || 0;
                svgHeight = parseFloat(viewBoxValues[3]) || 0;
              }
            }
            
            // Fallback to computed dimensions if still 0
            if (svgWidth === 0 || svgHeight === 0) {
              svgWidth = rect.width || 0;
              svgHeight = rect.height || 0;
            }
            
            // Generate a filename for the SVG
            const svgId = svg.id || '';
            const svgClass = svg.className || '';
            let filename = 'inline-svg';
            if (svgId) {
              filename = `${svgId}.svg`;
            } else if (svgClass && typeof svgClass === 'string') {
              const classParts = svgClass.split(/\s+/).filter(c => c.length > 0);
              if (classParts.length > 0) {
                filename = `${classParts[0]}.svg`;
              }
            }
            
            const svgData = {
              filename: filename,
              url: dataUri,
              extension: 'svg',
              source: 'inline-svg',
              pathname: '', // SVGs don't have pathnames
              alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || null,
              className: svg.className || null,
              id: svg.id || null,
              parentTag: parent ? parent.tagName.toLowerCase() : null,
              parentClassName: parent ? (parent.className || null) : null,
              parentId: parent ? (parent.id || null) : null,
              width: svgWidth,
              height: svgHeight,
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
            
            // Score the SVG
            svgData.logoScore = scoreImage(svgData);
            
            imageList.push(svgData);
          }
        } catch (error) {
          // Skip SVG if there's an error processing it
          console.warn('Error processing SVG element:', error);
        }
      });
      
      // 2b. Get SVG sprite URLs from <use> elements
      const svgWithUseElements = document.querySelectorAll('svg use');
      svgWithUseElements.forEach(useEl => {
        try {
          // Get the sprite URL from href or xlink:href
          const spriteUrl = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');
          if (spriteUrl && spriteUrl.trim()) {
            // Extract fragment identifier (e.g., #i-logo-fw) - helps identify logo sprites
            const fragment = spriteUrl.includes('#') ? spriteUrl.split('#')[1] : null;
            const isLogoFragment = fragment && (fragment.toLowerCase().includes('logo') || fragment.toLowerCase().includes('fw') || fragment.toLowerCase().includes('brand'));
            
            // Remove fragment identifier (e.g., #i-logo-fw) to get the sprite file URL
            // Handle both absolute URLs and relative URLs
            let spriteFileUrl = spriteUrl.split('#')[0].trim();
            
            // Skip if it's just a fragment reference (starts with #)
            if (!spriteFileUrl || spriteFileUrl.startsWith('#')) {
              return;
            }
            
            // If spriteFileUrl is a relative path, it should start with / or ./
            // If it's just a fragment like "#i-logo-fw", skip it
            if (spriteFileUrl && (spriteFileUrl.startsWith('/') || spriteFileUrl.startsWith('./') || spriteFileUrl.startsWith('../') || spriteFileUrl.startsWith('http'))) {
              const normalizedUrl = normalizeUrl(spriteFileUrl);
              
              // Get the parent SVG element for metadata first (before checking seenUrls)
              const svg = useEl.closest('svg');
              if (svg) {
                // Check if we already have this URL - if so, check if this version is better
                const existingIndex = imageList.findIndex(img => img.url === normalizedUrl && (img.source === 'html-source-sprite' || img.source === 'html-source'));
                const shouldAdd = !seenUrls.has(normalizedUrl);
                const shouldReplace = existingIndex >= 0 && (isLogoFragment || svg.closest('[class*="header"]') || svg.closest('[class*="logo"]'));
                
                if (shouldAdd || shouldReplace) {
                  if (shouldReplace) {
                    // Remove the existing entry
                    imageList.splice(existingIndex, 1);
                  }
                  if (!seenUrls.has(normalizedUrl)) {
                    seenUrls.add(normalizedUrl);
                  }
                  const rect = svg.getBoundingClientRect();
                  const parent = svg.parentElement;
                  const parentLink = svg.closest('a');
                  
                  // Check if in header/nav
                  const isInHeader = svg.closest('header') !== null || 
                                    svg.closest('[class*="header"]') !== null ||
                                    svg.closest('[id*="header"]') !== null;
                  const isInNav = svg.closest('nav') !== null || 
                                 svg.closest('[class*="nav"]') !== null ||
                                 svg.closest('[id*="nav"]') !== null;
                  
                  // Check if in homepage link
                  let isInHomepageLink = false;
                  let isOnlyImageInLink = false;
                  if (parentLink) {
                    const linkHref = parentLink.href || '';
                    isInHomepageLink = linkHref === window.location.origin + '/' || 
                                      linkHref === window.location.origin ||
                                      linkHref.endsWith('/');
                    
                    // Check if link only contains this SVG
                    const linkChildren = Array.from(parentLink.children);
                    isOnlyImageInLink = linkChildren.length === 1 && linkChildren[0] === svg;
                  }
                  
                  // Get width/height from SVG attributes
                  let svgWidth = 0;
                  let svgHeight = 0;
                  const widthAttr = svg.getAttribute('width');
                  const heightAttr = svg.getAttribute('height');
                  const viewBox = svg.getAttribute('viewBox');
                  
                  // Parse width/height attributes
                  const parsedWidth = widthAttr ? parseFloat(widthAttr) : 0;
                  const parsedHeight = heightAttr ? parseFloat(heightAttr) : 0;
                  
                  // Use attributes only if both are valid (> 0)
                  if (parsedWidth > 0 && parsedHeight > 0) {
                    svgWidth = parsedWidth;
                    svgHeight = parsedHeight;
                  } else if (viewBox) {
                    // Extract from viewBox if width/height not specified or invalid
                    const viewBoxValues = viewBox.split(/\s+/);
                    if (viewBoxValues.length >= 4) {
                      svgWidth = parseFloat(viewBoxValues[2]) || 0;
                      svgHeight = parseFloat(viewBoxValues[3]) || 0;
                    }
                  }
                  
                  // Fallback to computed dimensions if still 0
                  if (svgWidth === 0 || svgHeight === 0) {
                    svgWidth = rect.width || 0;
                    svgHeight = rect.height || 0;
                  }
                  
                  // Extract pathname from URL
                  let pathname = '';
                  try {
                    const urlObj = new URL(normalizedUrl, baseUrl);
                    pathname = urlObj.pathname;
                  } catch (e) {
                    // Ignore
                  }
                  
                  const filename = getFilename(normalizedUrl);
                  
                  // Combine parent class name with parent link class name if different
                  let combinedParentClassName = parent ? (parent.className || null) : null;
                  if (parentLink && parentLink !== parent && parentLink.className) {
                    if (combinedParentClassName) {
                      combinedParentClassName = `${combinedParentClassName} ${parentLink.className}`;
                    } else {
                      combinedParentClassName = parentLink.className;
                    }
                  }
                  
                  const spriteData = {
                    filename: filename || 'svg-sprite.svg',
                    url: normalizedUrl,
                    extension: 'svg',
                    source: 'svg-sprite',
                    pathname: pathname,
                    alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || 
                         (parentLink ? (parentLink.getAttribute('title') || parentLink.getAttribute('aria-label')) : null) || null,
                    className: svg.className || null,
                    id: svg.id || null,
                    parentTag: parent ? parent.tagName.toLowerCase() : null,
                    parentClassName: combinedParentClassName,
                    parentId: parent ? (parent.id || null) : null,
                    width: svgWidth,
                    height: svgHeight,
                    position: {
                      top: rect.top,
                      left: rect.left,
                      right: rect.right,
                      bottom: rect.bottom
                    },
                    isInHeader: isInHeader,
                    isInNav: isInNav,
                    isInHomepageLink: isInHomepageLink,
                    isOnlyImageInLink: isOnlyImageInLink,
                    spriteFragment: fragment || null,
                    isLogoFragment: isLogoFragment || false
                  };
                  
                  // Score the sprite
                  spriteData.logoScore = scoreImage(spriteData);
                  
                  // Extra bonus for logo-related fragments (e.g., #i-logo-fw)
                  if (isLogoFragment) {
                    spriteData.logoScore += 25; // Strong bonus for logo fragment
                  }
                  
                  imageList.push(spriteData);
                }
              }
            }
          }
        } catch (error) {
          // Skip if there's an error processing it
          console.warn('Error processing SVG sprite:', error);
        }
      });
      
      // 3. Get CSS background images with metadata
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
      
      // 4. Extract from page source/HTML for image URLs
      const htmlContent = document.documentElement.outerHTML;
      
      // Match absolute image URLs
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
      
      // Also extract SVG sprite URLs from href/xlink:href attributes (including relative URLs)
      // Match both quoted and unquoted attributes, and handle different quote styles
      const svgSpritePattern = /(?:href|xlink:href)\s*=\s*["']?([^"'\s<>]*\.svg[^"'\s<>]*)/gi;
      const spriteMatches = htmlContent.matchAll(svgSpritePattern);
      
      for (const match of spriteMatches) {
        if (match[1]) {
          // Remove fragment identifier
          let spriteUrl = match[1].split('#')[0].trim();
          
          // Skip if it's just a fragment or empty
          if (!spriteUrl || spriteUrl.startsWith('#')) {
            continue;
          }
          
          // Normalize the URL (handles both absolute and relative URLs)
          const normalizedUrl = normalizeUrl(spriteUrl);
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            const filename = getFilename(normalizedUrl);
            const extension = getExtension(filename);
            
            // Only process if it's an SVG file
            if (extension === 'svg' || normalizedUrl.toLowerCase().includes('.svg')) {
              let pathname = '';
              try {
                const urlObj = new URL(normalizedUrl, baseUrl);
                pathname = urlObj.pathname;
              } catch (e) {}
              
              const imageData = {
                filename: filename || 'svg-sprite.svg',
                url: normalizedUrl,
                extension: 'svg',
                source: 'html-source-sprite',
                pathname: pathname
              };
              
              imageData.logoScore = scoreImage(imageData);
              imageList.push(imageData);
            }
          }
        }
      }
      
      // 5. Check data attributes for image URLs
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
        'inline-svg': 1,
        'svg-sprite': 1,
        'css-background': 2,
        'inline-style': 3,
        'html-source': 4,
        'html-source-sprite': 4,
        'data-attribute': 5
      };
      
      imageList.sort((a, b) => {
        // Helper to check if image has site name in filename/URL
        function hasSiteNameInImage(img) {
          if (!siteName || siteName.length <= 2) return false;
          const siteNameLower = siteName.toLowerCase();
          const filenameLower = (img.filename || '').toLowerCase();
          const urlLower = (img.url || '').toLowerCase();
          return filenameLower.includes(siteNameLower) || urlLower.includes(siteNameLower);
        }
        
        const aHasSiteName = hasSiteNameInImage(a);
        const bHasSiteName = hasSiteNameInImage(b);
        
        // ALWAYS prioritize logos with site name over those without, regardless of score difference
        // This ensures the main site logo is selected even if partner/certification logos score higher
        if (aHasSiteName && !bHasSiteName) {
          return -1; // Logo with site name comes first
        }
        if (bHasSiteName && !aHasSiteName) {
          return 1; // Logo with site name comes first
        }
        
        // First sort by logo score (if available)
        if (a.logoScore !== undefined && b.logoScore !== undefined) {
          // If scores are very close (within 15 points), prioritize inline SVGs and SVG sprites
          const scoreDiff = Math.abs(b.logoScore - a.logoScore);
          if (scoreDiff <= 15) {
            // If one is an inline SVG or SVG sprite and the other isn't, prioritize the SVG
            const aIsSvg = a.source === 'inline-svg' || a.source === 'svg-sprite';
            const bIsSvg = b.source === 'inline-svg' || b.source === 'svg-sprite';
            if (aIsSvg && !bIsSvg) {
              return -1; // SVG comes first
            }
            if (bIsSvg && !aIsSvg) {
              return 1; // SVG comes first
            }
          }
          if (b.logoScore !== a.logoScore) {
            return b.logoScore - a.logoScore;
          }
        }
        // Then by source priority
        const aPriority = sourcePriority[a.source] || 99;
        const bPriority = sourcePriority[b.source] || 99;
        return aPriority - bPriority;
      });
      
      return imageList;
    }, url);
    
    // Add favicon to results if provided and not already in list
    if (faviconUrl) {
      const faviconInList = images.some(img => img.url === faviconUrl);
      if (!faviconInList) {
        images.push({
          filename: 'favicon.ico',
          url: faviconUrl,
          extension: 'ico',
          source: 'favicon',
          logoScore: 0,
          isFavicon: true
        });
      }
    }
    
    return images;
}

/**
 * Main execution
 */
async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: node logoExtractor.js <URL>');
    console.error('Example: node logoExtractor.js https://example.com');
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
    
    // Find the highest scoring logo candidate
    // Images are already sorted by the page.evaluate function (site name priority, then score)
    const scoredImages = images.filter(img => img.logoScore !== undefined && img.logoScore > 0);
    
    // Extract site name from URL for prioritization (same logic as in page.evaluate)
    let siteName = '';
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
      const parts = domain.split('.');
      if (parts.length >= 3) {
        const commonSubdomains = ['www', 'www2', 'www3', 'invest', 'admin', 'app', 'api', 'blog', 'mail', 'ftp', 'cdn', 'static', 'assets', 'media', 'images', 'img'];
        const mainPart = parts[parts.length - 2];
        const subdomainPart = parts[parts.length - 3];
        if (commonSubdomains.includes(subdomainPart.toLowerCase())) {
          siteName = mainPart;
        } else if (mainPart.length <= 2 || /^\d+$/.test(mainPart)) {
          siteName = subdomainPart;
        } else {
          siteName = mainPart;
        }
      } else if (parts.length >= 2) {
        siteName = parts[0];
      }
    } catch (e) {
      // Ignore
    }
    
    // Prioritize logos with site name in filename/URL
    // Since images are already sorted, we can use the first one with site name, or highest score if none
    const topLogo = scoredImages.length > 0 
      ? (() => {
          // First, try to find the first logo with site name (they're already sorted to the top)
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
          return scoredImages.reduce((prev, current) => (prev.logoScore > current.logoScore) ? prev : current);
        })()
      : null;
    
    // Prepare all images with scores for JSON output
    // Sort images by score (highest first) for JSON output
    const imagesWithScores = images.map(img => {
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
    
    // Return all images with scores in JSON
    const result = {
      url: url,
      total_images: images.length,
      logo_url: topLogo ? topLogo.url : null,
      images: imagesWithScores
    };
    
    // Output only top logo candidate to terminal
    if (topLogo) {
      console.log(`\nTop logo candidate (score: ${topLogo.logoScore}):`);
      console.log(`  Filename: ${topLogo.filename}`);
      const displayUrl = topLogo.url.length > 100 ? topLogo.url.substring(0, 100) + '...' : topLogo.url;
      console.log(`  URL: ${displayUrl}`);
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
                     process.argv[1]?.endsWith('logoExtractor.js');

if (isMainModule) {
  main();
}

export { extractAllImages, extractAllImagesWithPage };

