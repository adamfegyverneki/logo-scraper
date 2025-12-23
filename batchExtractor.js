import { extractAllImages } from './logoExtractor.js';
import { extractFaviconColors, extractColorsFromImageUrl } from './colorExtractor.js';
import { readFileSync, writeFileSync } from 'fs';
import { getSiteName } from './utils/siteHelpers.js';
import { findTopLogo } from './utils/imageHelpers.js';
import { validateUrl } from './utils/urlHelpers.js';

/**
 * Process a single URL and extract logo and colors
 */
async function processUrl(url) {
  const startTime = performance.now();
  const result = {
    url: url,
    logo_url: null,
    colors: {
      primary: null,
      secondary: null
    },
    execution_time_seconds: 0,
    error: null,
    status: 'success'
  };

  try {
    // Validate URL
    if (!validateUrl(url)) {
      throw new Error('Invalid URL format');
    }

    // Extract logo and colors in parallel
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
    result.logo_url = topLogo ? topLogo.url : null;

    // Process color extraction result
    let colors = null;
    if (colorsResult.status === 'fulfilled' && !colorsResult.value.error) {
      colors = colorsResult.value;
    } else {
      // Fallback: try extracting colors from the logo image
      if (result.logo_url) {
        try {
          colors = await extractColorsFromImageUrl(result.logo_url);
        } catch (logoError) {
          colors = { primary: null, secondary: null };
        }
      } else {
        colors = { primary: null, secondary: null };
      }
    }

    result.colors = {
      primary: colors.primary,
      secondary: colors.secondary
    };

  } catch (error) {
    result.status = 'error';
    result.error = error.message;
  } finally {
    const endTime = performance.now();
    result.execution_time_seconds = parseFloat(((endTime - startTime) / 1000).toFixed(2));
  }

  return result;
}

/**
 * Main batch processing function
 */
async function processBatch(inputFile, outputFile = 'batch-results.json') {
  try {
    // Read URLs from file
    console.log(`Reading URLs from ${inputFile}...`);
    const fileContent = readFileSync(inputFile, 'utf-8');
    const urls = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')) // Filter empty lines and comments
      .filter(line => line.startsWith('http')); // Only process valid URLs

    if (urls.length === 0) {
      console.error('No valid URLs found in the input file');
      process.exit(1);
    }

    console.log(`Found ${urls.length} URLs to process\n`);

    // Process all URLs
    const results = [];
    const totalStartTime = performance.now();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] Processing: ${url}`);
      
      const result = await processUrl(url);
      results.push(result);

      // Print status
      if (result.status === 'success') {
        console.log(`  ✓ Logo: ${result.logo_url ? 'Found' : 'Not found'}`);
        console.log(`  ✓ Colors: ${result.colors.primary || 'N/A'}`);
        console.log(`  ⏱️  Time: ${result.execution_time_seconds}s\n`);
      } else {
        console.log(`  ✗ Error: ${result.error}`);
        console.log(`  ⏱️  Time: ${result.execution_time_seconds}s\n`);
      }
    }

    const totalEndTime = performance.now();
    const totalTime = parseFloat(((totalEndTime - totalStartTime) / 1000).toFixed(2));

    // Prepare final output
    const output = {
      processed_at: new Date().toISOString(),
      total_urls: urls.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      total_execution_time_seconds: totalTime,
      average_time_per_url_seconds: parseFloat((totalTime / urls.length).toFixed(2)),
      results: results
    };

    // Save results to file
    writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n${'='.repeat(60)}`);
    console.log('Batch Processing Complete!');
    console.log(`${'='.repeat(60)}`);
    console.log(`Total URLs processed: ${urls.length}`);
    console.log(`Successful: ${output.successful}`);
    console.log(`Failed: ${output.failed}`);
    console.log(`Total time: ${totalTime}s`);
    console.log(`Average time per URL: ${output.average_time_per_url_seconds}s`);
    console.log(`Results saved to: ${outputFile}`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\nFatal error processing batch: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'batch-results.json';

if (!inputFile) {
  console.error('Usage: node batchExtractor.js <input-file.txt> [output-file.json]');
  console.error('Example: node batchExtractor.js urls.txt batch-results.json');
  process.exit(1);
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('batchExtractor.js');

if (isMainModule) {
  processBatch(inputFile, outputFile);
}

export { processUrl, processBatch };

