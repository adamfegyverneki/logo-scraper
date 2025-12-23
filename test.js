
import { extractAllImages } from "./logoExtractor.js";
import assert from "assert";

const testCases = [
  {
    url: "https://wertis.hu/",
    expectedLogo: "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop,q=95/AQEee9a92WCbl4DN/werislogo-Yan00a8akZukR74n.png",
  },
  {
    url: "https://www.pifadvisory.com/",
    expectedLogo: "https://cdn.prod.website-files.com/66f59ab291dc37d99a491aea/66f5aac270328f7eee78e368_PIF%20Advisory%20logo.svg",
  },
  {
    url: "https://pxp.io/",
    expectedLogo: "https://pxp.io/hubfs/PXP_Logo_White.svg",
  },
  {
    url: "https://bpstudio.co.kr/",
    expectedLogo: "BP Studio",
  },
  {
    url: "https://ipon.hu/",
    expectedLogo: "/images/logo-text.svg?8zc8lijay0",
  },
  {
    url: "https://www.fundango.hu/",
    expectedLogo: "https://www.fundango.hu/images/images/fundango-logo2.svg",
  },
  {
    url: "https://www.roksh.com/",
    expectedLogo: "https://weshopsiteimages.blob.core.windows.net/images/roksh-logo-wo-slogen.png",
  },
  {
    url: "http://prezi.com/",
    expectedLogo: "https://assets.prezicdn.net/assets-versioned/staticpages-versioned/v1.0-259-g51ab7c47fe-r20437963830a1/staticpages/webflow/images/Prezi-Logo-2.svg",
  },
  {
    url: "http://utanvet-ellenor.hu",
    expectedLogo: "https://clientcdn.fra1.cdn.digitaloceanspaces.com/utanvet-ellenor.hu/assets/images/_600x60_fit_center-center_82_none/logo-full-color.png?mtime=1759504866",
  },
  {
    url: "https://andrasikft.hu/",
    expectedLogo: "https://andrasikft.hu/themes/frontend/images/logo.png",
  },
  {
    url: "https://appartman.hu/",
    expectedLogo: "https://appartman.hu/images/landing/appartman-property-management-system-logo.png",
  },
  {
    url: "https://biotechusa.hu/vitaminkalkulator/",
    expectedLogo: "https://biotechusa.hu/content/themes/btu-sk/dist/images/xl.svg?8e9a98204947c2e4f1550958401bed58",
  },
  {
    url: "https://biotechusagroup.com",
    expectedLogo: "https://biotechusagroup.com/content/themes/btu-group/dist/images/xl-white.svg?b67c8cbece12483d4d36fe5243f1d25b",
  },
  {
    url: "https://bkk.hu",
    expectedLogo: "https://bkk.hu/static/cache/web/bkkv2/images/logo_mobile.svg",
  },
  {
    url: "https://bkk.hu/jegyek-es-berletek/budapestgo/",
    expectedLogo: "https://bkk.hu/static/cache/web/bkkv2/images/logo_mobile.svg",
  },
  {
    url: "https://bordstudio.hu/",
    expectedLogo: "https://bordstudio.hu/wp-content/uploads/2025/02/BORD_Architectural_Studio_Logo-scaled.jpg",
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const [index, testCase] of testCases.entries()) {
    console.log(`\nRunning test case ${index + 1}: ${testCase.url}`);
    try {
      const images = await extractAllImages(testCase.url);

      const topLogo = images.length > 0
        ? images.reduce((prev, current) => (prev.logoScore > current.logoScore) ? prev : current)
        : null;

      if (testCase.expectedLogo === "redacted") {
        // For 'redacted' cases, we simply assert that a logo candidate is found.
        // A more robust test would involve checking if *no* valid logo is found, or if it's a generic one.
        assert.ok(topLogo, `Test case ${index + 1} (${testCase.url}): Expected a logo candidate for 'redacted' case.`);
        console.log(`  Expected 'redacted', found a logo candidate: ${topLogo.url}`);
        passed++;
      } else if (testCase.expectedLogo.startsWith("/")) {
        // Handle relative URLs for expected logos
        const urlObj = new URL(testCase.url);
        const absoluteExpectedLogo = `${urlObj.protocol}//${urlObj.hostname}${testCase.expectedLogo}`;
        assert.strictEqual(topLogo.url, absoluteExpectedLogo, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`  Expected: ${absoluteExpectedLogo}, Found: ${topLogo.url} - PASSED`);
        passed++;
      } else {
        assert.strictEqual(topLogo.url, testCase.expectedLogo, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`  Expected: ${testCase.expectedLogo}, Found: ${topLogo.url} - PASSED`);
        passed++;
      }
    } catch (error) {
      console.error(`Test case ${index + 1} (${testCase.url}): FAILED - ${error.message}`);
      failed++;
    }
  }

  const total = testCases.length;
  const percentage = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Test Results Summary:`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${total}`);
  console.log(`  Success Rate: ${percentage}%`);
  console.log(`${'='.repeat(50)}`);
}

runTests();

