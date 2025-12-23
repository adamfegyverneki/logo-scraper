import { extractAllImages } from './logoExtractor.js';
import { extractFaviconColors, extractColorsFromImageUrl } from './colorExtractor.js';
import { writeFileSync } from 'fs';
import { getSiteName } from './utils/siteHelpers.js';
import { findTopLogo, prepareImagesData } from './utils/imageHelpers.js';
import { validateUrl } from './utils/urlHelpers.js';

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
  if (!validateUrl(url)) {
    console.error('Invalid URL provided');
    process.exit(1);
  }
  
  // Record start time
  const startTime = performance.now();
  
  try {
    console.log(`\n=== Extracting logo and colors from ${url} ===\n`);
    
    // Extract logo and colors in parallel (they use different browser instances)
    console.log('Step 1: Extracting logo and colors in parallel...');
    const [images, colorsResult] = await Promise.allSettled([
      extractAllImages(url),
      extractFaviconColors(url).catch(error => {
        return { error: error.message };
      })
    ]);
    
    // Process logo extraction result
    const imagesData = images.status === 'fulfilled' ? images.value : [];
    const siteName = getSiteName(url);
    const topLogo = imagesData.length > 0 ? findTopLogo(imagesData, siteName) : null;
    const logoUrl = topLogo ? topLogo.url : null;
    
    if (topLogo) {
      console.log(`  ✓ Found logo: ${topLogo.filename}`);
      console.log(`  URL: ${logoUrl}`);
    } else {
      console.log('  ⚠ No logo candidate found');
    }
    
    // Process color extraction result
    console.log('\nStep 2: Processing color extraction...');
    let colors = null;
    
    if (colorsResult.status === 'fulfilled' && !colorsResult.value.error) {
      colors = colorsResult.value;
      console.log(`  ✓ Primary color: ${colors.primary}`);
      console.log(`  ✓ Secondary color: ${colors.secondary || 'N/A'}`);
    } else {
      const errorMsg = colorsResult.status === 'rejected' 
        ? colorsResult.reason?.message || 'Unknown error'
        : colorsResult.value?.error || 'Unknown error';
      console.log(`  ⚠ Could not extract colors from favicon: ${errorMsg}`);
      
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
    
    // Calculate execution time
    const endTime = performance.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2); // Convert to seconds with 2 decimal places
    
    // Prepare result
    const result = {
      url: url,
      logo_url: logoUrl,
      colors: {
        primary: colors.primary,
        secondary: colors.secondary
      },
      execution_time_seconds: parseFloat(executionTime)
    };
    
    // Save result.json
    writeFileSync('result.json', JSON.stringify(result, null, 2));
    console.log('\n✓ Result saved to result.json');
    
    // Save images.json for debugging
    const preparedImagesData = prepareImagesData(imagesData);
    const debugResult = {
      url: url,
      total_images: imagesData.length,
      logo_url: logoUrl,
      images: preparedImagesData
    };
    writeFileSync('images.json', JSON.stringify(debugResult, null, 2));
    console.log(`✓ Debug data saved to images.json (${images.length} images)`);
    
    // Output summary
    console.log('\n=== Summary ===');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n⏱️  Execution time: ${executionTime} seconds`);
    
  } catch (error) {
    // Calculate execution time even on error
    const endTime = performance.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.error(`\n✗ Failed to extract data: ${error.message}`);
    
    // Save error result
    const errorResult = {
      url: url,
      logo_url: null,
      colors: {
        primary: null,
        secondary: null
      },
      error: error.message,
      execution_time_seconds: parseFloat(executionTime)
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
    
    console.log(`\n⏱️  Execution time: ${executionTime} seconds`);
    
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('combinedExtractor.js');

if (isMainModule) {
  main();
}

