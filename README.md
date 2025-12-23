# Logo Scraper

A comprehensive Node.js tool for extracting company logos and brand colors from websites using Playwright browser automation. Perfect for brand research, competitor analysis, or building logo databases.

## Features

### Logo Extraction
- **Intelligent logo detection** using advanced scoring algorithms
- Extracts logos from multiple sources:
  - `<img>` tags (including lazy-loaded images via `data-src`, `data-lazy-src`)
  - CSS background images
  - Inline style attributes
  - SVG elements
  - Favicon fallback
- **Smart scoring system** that prioritizes logos based on:
  - URL/filename containing "logo", "brand", "header", "site", "company"
  - Site name matching in filename/URL
  - Alt text and class/ID attributes
  - Position on page (top-left preferred)
  - Image dimensions (100-400px preferred)
  - Context (header, nav, homepage links)
  - File format (SVG preferred)

### Color Extraction
- Extracts primary and secondary brand colors from:
  - Website favicons
  - Logo images (fallback)
- Uses Sharp for accurate color analysis

### Batch Processing
- Process multiple URLs from a text file
- Sequential processing with progress tracking
- Comprehensive JSON output with statistics
- Execution time tracking per URL

### Testing Suite
- Automated test suite with color-coded output
- URL normalization for versioned CDN URLs
- Expected vs actual comparison on failures
- Test statistics and success rate reporting

## Installation

1. **Clone the repository:**
git clone <repository-url>
cd ScrapingScript2. **Install dependencies:**
npm install3. **Install Playwright browsers:**h
npx playwright install chromium## Usage

### Single URL Extraction (Logo + Colors)

Extract both logo and colors from a single website:

npm start <URL>
# or
npm run extract <URL>
# or
node combinedExtractor.js <URL>**Example:**
npm start https://example.com**Output:**
- Terminal: Detailed extraction results
- `result.json`: Logo URL and colors
- `images.json`: All extracted images with metadata (for debugging)

### Logo Extraction Only

Extract just the logo from a website:

npm run extract-logo <URL>
# or
node logoExtractor.js <URL>**Example:**
npm run extract-logo https://example.com### Color Extraction Only

Extract just brand colors from a website:

npm run extract-colors <URL>
# or
node colorExtractor.js <URL>**Example:**ash
npm run extract-colors https://example.com### Batch Processing

Process multiple URLs from a text file:

npm run batch <input-file.txt> [output-file.json]
# or
node batchExtractor.js <input-file.txt> [output-file.json]**Example:**
npm run batch urls-example.txt batch-results.json**Input file format** (`urls-example.txt`):

