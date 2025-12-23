
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
];

async function runTests() {
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
      } else if (testCase.expectedLogo.startsWith("/")) {
        // Handle relative URLs for expected logos
        const urlObj = new URL(testCase.url);
        const absoluteExpectedLogo = `${urlObj.protocol}//${urlObj.hostname}${testCase.expectedLogo}`;
        assert.strictEqual(topLogo.url, absoluteExpectedLogo, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`  Expected: ${absoluteExpectedLogo}, Found: ${topLogo.url} - PASSED`);
      } else {
        assert.strictEqual(topLogo.url, testCase.expectedLogo, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`  Expected: ${testCase.expectedLogo}, Found: ${topLogo.url} - PASSED`);
      }
    } catch (error) {
      console.error(`Test case ${index + 1} (${testCase.url}): FAILED - ${error.message}`);
    }
  }
}

runTests();
