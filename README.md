# Image Extractor

A JavaScript script that extracts images from websites and identifies the most likely company logo using Playwright browser automation.

## Features

- Extracts all images from a website including:
  - `<img>` tags (including data attributes like `data-src`, `data-lazy-src`)
  - CSS background images
  - Inline style attributes
  - HTML source code
  - Data attributes
- Identifies the top logo candidate using intelligent scoring based on:
  - URL/filename containing "logo", "brand", "header", "site", "company"
  - Alt text containing "logo" or company name
  - Class/ID containing "logo", "brand", "header", "nav", "site-identity"
  - Position on page (top-left preferred)
  - Image dimensions (100-400px preferred)
  - Context (header, nav, homepage links)
- Automatically saves base64 images to files
- Includes favicon as fallback

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Usage

Run the script with a URL as a command-line argument:

```bash
node imageExtractor.js https://example.com
```

Or using npm script:
```bash
npm run extract-images https://example.com
```

## Output

The script outputs:
- **Terminal**: Top logo candidate information (filename, URL, score, metadata)
- **JSON file** (`images.json`): Top logo candidate URL only

Example JSON output:
```json
{
  "url": "https://example.com",
  "logo_url": "https://example.com/images/logo.png"
}
```

If no logo is found:
```json
{
  "url": "https://example.com",
  "logo_url": null
}
```

## Requirements

- Node.js (v14 or higher)
- npm or yarn
- Internet connection (for browser automation and searches)

