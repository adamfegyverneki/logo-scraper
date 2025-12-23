
import { extractAllImages } from "./logoExtractor.js";
import { getSiteName } from "./utils/siteHelpers.js";
import { findTopLogo } from "./utils/imageHelpers.js";
import assert from "assert";

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const testCases = [
  {
    url: "http://prezi.com/",
    expectedLogo: "https://assets.prezicdn.net/assets-versioned/staticpages-versioned/v1.0-259-g51ab7c47fe-r20437963830a1/staticpages/webflow/images/Prezi-Logo-2.svg",
  },
  {
    url: "http://utanvet-ellenor.hu",
    expectedLogo: "https://clientcdn.fra1.cdn.digitaloceanspaces.com/utanvet-ellenor.hu/assets/images/logo-full-color.png",
  },
  {
    url: "http://www.marinacity.hu",
    expectedLogo: "https://cordia.hu/wp-content/uploads/2023/12/CRD_MarinaCity3_1-soros-logo_RGB_by-CRD-nelkul-20250130-1.svg",
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
  {
    url: "https://brainbar.com/",
    expectedLogo: "https://storage.googleapis.com/brainbar/logo.svg",
  },
  {
    url: "https://cromkontakt.hu",
    expectedLogo: "https://cromkontakt.hu/wp-content/uploads/2024/11/Cromkontakt-logo.svg",
  },
  {
    url: "https://cryptoscan.ai",
    expectedLogo: "https://cryptoscan.ai/static/media/cs-brand-logo-2.baf3df4d200c95bd03ec95eb7b933f38.svg",
  },
  {
    url: "https://designsmart.ly/hu/mento-marton/",
    expectedLogo: "https://designsmart.ly/wp-content/themes/smart-design2.0/includes/img/logo-black.svg",
  },
  {
    url: "https://designterminal.org/",
    expectedLogo: "https://designterminal.org/img/DesignTerminal_Civitta_horizontal_logo_white.png",
  },
  {
    url: "https://dh.hu/",
    expectedLogo: "https://dh.hu/assets/logo.webp",
  },
  {
    url: "https://everguest.com/",
    expectedLogo: "https://everguest.com/assets/logo.svg",
  },
  {
    url: "https://everguest.digital/portal/dashboard",
    expectedLogo: "https://everguest.digital/assets/logo.svg",
  },
  {
    url: "https://flowwow.com",
    expectedLogo: "https://content3.flowwow-images.com/images/logo/logo_plain_new.png",
  },
  {
    url: "https://foxpost.hu/",
    expectedLogo: "https://foxpost.hu/img/header-logo-square.svg",
  },
  {
    url: "https://futuremanagement.hu/",
    expectedLogo: "https://futuremanagement.hu/wp-content/uploads/2024/01/logo.svg",
  },
  {
    url: "https://greenroom.hu/",
    expectedLogo: "https://greenroom.hu/img/clients/belgian.svg",
  },
  {
    url: "https://gronway.hu/",
    expectedLogo: "https://husqvarna.cdn.shoprenter.hu/custom/husqvarna/image/cache/w275h51/src_2024/gronway_logo.png.webp",
  },
  {
    url: "https://help.semmelweis.hu/",
    expectedLogo: "data:image/svg+xml,%3c?xml%20version=%271.0%27%20encoding=%27utf-8%27?%3e...",
  },
  {
    url: "https://hintalovon.hu",
    expectedLogo: "https://hintalovon.hu/wp-content/uploads/2025/11/hintalovon_xmas_shortpurple.svg",
  },
  {
    url: "https://hiya.com/",
    expectedLogo: "https://cdn.prod.website-files.com/5dc2e934de1955d46d9f8eb5/5f1a08b8f263c3ef6e879a5b_hiya%20logo.svg",
  },
  {
    url: "https://hub55.hu/",
    expectedLogo: "https://hub55.hu/src/menulogo.png",
  },
  {
    url: "https://humantelex.hu/",
    expectedLogo: "https://humantelex.hu/wp-content/uploads/2024/06/humantelex_logo.svg",
  },
  {
    url: "https://iddesign.eu/",
    expectedLogo: "https://iddesign.eu/!common_design/custom/iddesign-hu.unas.hu/element/layout_hu_header_logo-400x120_1_default.png",
  },
  {
    url: "https://imatek.hu",
    expectedLogo: "https://imatek.hu/wp-content/uploads/2025/06/logo-imatek_new.svg",
  },
  {
    url: "https://invest.debrecen.hu/",
    expectedLogo: "https://invest.debrecen.hu/wp-content/uploads/2024/06/debrecen-logo-2x.png",
  },
  {
    url: "https://jadabo.com/",
    expectedLogo: "https://jadabo.com/assets/images/jadabo.svg",
  },
  {
    url: "https://jatekosnyomozas.hu",
    expectedLogo: "https://jatekosnyomozas.hu/themes/frontend/images/logo.png",
  },
  {
    url: "https://logiscool.com",
    expectedLogo: "https://www.logiscool.com/_nuxt/img/logiscool_logo.5fcb9da.svg",
  },
  {
    url: "https://lovasijaszat.hu/",
    expectedLogo: "https://lovasijaszat.hu/images/rendszer/logo.svg",
  },
  {
    url: "https://loveszalon.hu",
    expectedLogo: "https://loveszalon.hu/wp-content/uploads/2024/09/loveszalon_logo.svg",
  },
  {
    url: "https://lumenet.hu/",
    expectedLogo: "https://lumenet.hu/!common_design/custom/lumenet.unas.hu/image/logo.svg",
  },
  {
    url: "https://magnusaircraft.com/",
    expectedLogo: "http://magnusaircraft.com/wp-content/uploads/2024/09/stylewhite.svg",
  },
  {
    url: "https://magyarszinhaz.hu/",
    expectedLogo: "https://magyarszinhaz.hu/wp-content/uploads/2024/09/logo_white.svg",
  },
  {
    url: "https://maimagyarepiteszet.hu/",
    expectedLogo: "https://maimagyarepiteszet.hu/wp-content/themes/mek-mem-child/assets/images/logos/mek-mem-logo-hu.svg",
  },
  {
    url: "https://malagrow.hu/",
    expectedLogo: "https://malagrow.hu/wp-content/themes/malagrow/images/site_logo_alt.svg",
  },
  {
    url: "https://mastiffcargobike.com/hu",
    expectedLogo: "https://mastiffcargobike.com/wp-content/themes/mastiff/images/logo-light.svg",
  },
  {
    url: "https://mercureszekesfehervar.hu/",
    expectedLogo: "https://mercureszekesfehervar.hu/themes/frontend/images/logo.png",
  },
  {
    url: "https://mesemano.hu/",
    expectedLogo: "https://mesemano.hu/assets/images/mesemano-logo.png",
  },
  {
    url: "https://morgens.hu/",
    expectedLogo: "https://zcms.hu/morgens3hu/templates/morgenslogo.png",
  },
  {
    url: "https://muzeumshop.com/",
    expectedLogo: "https://museumshop.cdn.shoprenter.hu/custom/museumshop/image/cache/w220h100m00/LOGO/MuzeumShop/ms_png_black_fekvo.png",
  },
  {
    url: "https://noilezer.hu/",
    expectedLogo: "https://noilezer.hu/wp-content/uploads/2021/04/noilezer_logo_horizontal_1.png",
  },
  {
    url: "https://ominimo.eu",
    expectedLogo: "https://ominimo.ai/images/logo.svg",
  },
  {
    url: "https://onti.hu/",
    expectedLogo: "https://onti.hu/themes/frontend/images/logo.png",
  },
  {
    url: "https://optimonk.com/",
    expectedLogo: "https://www.optimonk.com/wp-content/uploads/optimonk-logo-2024-1.svg",
  },
  {
    url: "https://oszkar.com/",
    expectedLogo: "https://img.oszkar.com/image/site/mobil_header_logo.png",
  },
  {
    url: "https://pajtikeszthely.hu/",
    expectedLogo: "https://pajtikeszthely.hu/wp-content/themes/pajti/img/pajti-logo.svg",
  },
  {
    url: "https://plazmacenter.hu",
    expectedLogo: "https://plazmacenter.hu/wp-content/uploads/2023/05/plazma-logo-1-120x39.png",
  },
  {
    url: "https://radio1.hu",
    expectedLogo: "https://pics.radio1.hu/images/static/radio_1_logo_1_1_no_image.png",
  },
  {
    url: "https://rapidnyomda.hu",
    expectedLogo: "https://rapidnyomda.hu/files/pictures/0/4/6/46/_thumb/logo-color-mobile-header_jpg.png",
  },
  {
    url: "https://reflexshop.hu/",
    expectedLogo: "https://reflexshop.hu/!common_design/custom/reflexshop.unas.hu/element/layout_hu_header_logo-260_1_default.png",
  },
  {
    url: "https://robogaze.com/",
    expectedLogo: "https://robogaze.com/assets/logos/robogaze-logo-black.webp",
  },
  {
    url: "https://sellvio.com/hu",
    expectedLogo: "https://sellvio.com/files/pictures/0/4/0/40/_thumb/40-sellvio-logo-header_jpg.png",
  },
  {
    url: "https://shenmen-piercing.hu/hu/",
    expectedLogo: "https://shenmen-piercing.hu/images/shenmen-piercing-logo.png",
  },
  {
    url: "https://shop.rossmann.hu/mobilapp",
    expectedLogo: "https://shop.rossmann.hu/assets/logos/rossmann-text.svg",
  },
  {
    url: "https://startuphungary.io/",
    expectedLogo: "https://cdn.prod.website-files.com/64805b4f2e801cea6a10cdb8/6481c35faf835b5134f8f7c7_logo%20startup%20hungary.svg",
  },
  {
    url: "https://tresorit.com/",
    expectedLogo: "https://cdn.tresorit.com/webv10/dist/gatsby/static/90b3eef2c2ce6e6fec8037bc6ae5a461/tresorit-mobile.svg",
  },
  {
    url: "https://virtualjog.hu/",
    expectedLogo: "https://sp-ao.shortpixel.ai/client/to_auto,q_lossless,ret_img/https://virtualjog.hu/wp-content/uploads/2016/05/logo-colored.png",
  },
  {
    url: "https://voovo.study/",
    expectedLogo: "https://cdn.prod.website-files.com/64cc43575e8a2f42649a5bf7/64ccd1c52c03c59df2614edb_Voovo_text_logo_2%201.png",
  },
  {
    url: "https://www.agroinform.hu/",
    expectedLogo: "https://static.agroinform.hu/static/bootstrap/img/ai-logo-xmas-2025.svg",
  },
  {
    url: "https://www.aliz.ai/",
    expectedLogo: "https://cdn.prod.website-files.com/64d4fcb1399fbd4505c91827/64db4ea67c3f65ee60783347_aliz-logo.svg",
  },
  {
    url: "https://www.billingo.hu/",
    expectedLogo: "https://www.billingo.hu/images/logo.svg",
  },
  {
    url: "https://www.bitrise.io/",
    expectedLogo: "https://cdn.prod.website-files.com/5db35de024bb983af1b4e151/5e05f06777d741b88a37f65d_bitrise-icon.svg",
  },
  {
    url: "https://www.maon.hu",
    expectedLogo: "https://maon.hu/wp-content/uploads/2025/05/maon_logo_fekete_v1-scaled.png",
  },
  {
    url: "https://www.mindmegette.hu/",
    expectedLogo: "https://www.mindmegette.hu/assets/images/mindmegette-logo.svg",
  },
  {
    url: "https://www.monteen.hu/",
    expectedLogo: "https://www.monteen.hu/cdn/shop/files/MONTEEN_logo_colour.png",
  },
  {
    url: "https://www.mralkohol.hu",
    expectedLogo: "https://www.mralkohol.hu/!common_design/custom/miszteralkohol.unas.hu/element/layout_hu_header_logo-300x80_1_default.png",
  },
  {
    url: "https://www.oc.hu/",
    expectedLogo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPac...",
  },
  {
    url: "https://www.uni-miskolc.hu",
    expectedLogo: "https://www.uni-miskolc.hu/themes/custom/uni_miskolc/images/logo.svg",
  },
  {
    url: "https://www.vg.hu/",
    expectedLogo: "https://www.vg.hu/assets/vg-logo.svg",
  },
  {
    url: "https://www.xeropan.com",
    expectedLogo: "https://www.xeropan.com/wp-content/uploads/2024/04/xeropan-logo.svg",
  },
];

// Function to normalize URLs by removing version parameters, CDN transformations, and query params
function normalizeLogoUrl(url) {
  if (!url) return url;
  
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Remove version-like segments from path (e.g., v1.0-259-g51ab7c47fe-r20437963830a1)
    // This pattern matches version segments in paths like /assets-versioned/staticpages-versioned/v1.0-XXX/...
    pathname = pathname.replace(/\/v\d+\.\d+[^\/]*\//g, '/');
    
    // Remove CDN transformation segments (e.g., _600x60_fit_center-center_82_none/)
    pathname = pathname.replace(/\/_[^\/]*\/[^\/]*\//g, '/');
    pathname = pathname.replace(/\/_[^\/]*\//g, '/');
    
    // Remove query parameters that might be version-related
    urlObj.search = '';
    
    // Reconstruct URL with normalized pathname
    urlObj.pathname = pathname;
    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, return original
    return url;
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const [index, testCase] of testCases.entries()) {
    console.log(`\nRunning test case ${index + 1}: ${testCase.url}`);
    let actualLogo = null;
    let expectedLogo = testCase.expectedLogo;
    
    try {
      // Use the same extraction method as combinedExtractor.js
      const images = await extractAllImages(testCase.url);
      const siteName = getSiteName(testCase.url);
      const topLogo = images.length > 0 ? findTopLogo(images, siteName) : null;
      actualLogo = topLogo ? topLogo.url : null;

      if (testCase.expectedLogo === "redacted") {
        // For 'redacted' cases, we simply assert that a logo candidate is found.
        assert.ok(topLogo, `Test case ${index + 1} (${testCase.url}): Expected a logo candidate for 'redacted' case.`);
        console.log(`${colors.green}  ✓ PASSED${colors.reset} - Expected 'redacted', found a logo candidate: ${topLogo.url}`);
        passed++;
      } else if (testCase.expectedLogo.startsWith("/")) {
        // Handle relative URLs for expected logos
        const urlObj = new URL(testCase.url);
        expectedLogo = `${urlObj.protocol}//${urlObj.hostname}${testCase.expectedLogo}`;
        const normalizedExpected = normalizeLogoUrl(expectedLogo);
        const normalizedActual = normalizeLogoUrl(actualLogo);
        assert.strictEqual(normalizedActual, normalizedExpected, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`${colors.green}  ✓ PASSED${colors.reset} - Expected: ${expectedLogo}, Found: ${actualLogo}`);
        passed++;
      } else {
        const normalizedExpected = normalizeLogoUrl(expectedLogo);
        const normalizedActual = normalizeLogoUrl(actualLogo);
        assert.strictEqual(normalizedActual, normalizedExpected, `Test case ${index + 1} (${testCase.url}): Expected logo URL mismatch.`);
        console.log(`${colors.green}  ✓ PASSED${colors.reset} - Expected: ${expectedLogo}, Found: ${actualLogo}`);
        passed++;
      }
    } catch (error) {
      console.error(`${colors.red}  ✗ FAILED${colors.reset} - Test case ${index + 1} (${testCase.url})`);
      console.error(`${colors.dim}  Expected:${colors.reset}`);
      console.error(`    ${expectedLogo}`);
      console.error(`${colors.dim}  Actual:${colors.reset}`);
      console.error(`    ${actualLogo || "null"}`);
      failed++;
    }
  }

  const total = testCases.length;
  const percentage = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${colors.cyan}Test Results Summary:${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`  ${colors.dim}Total:  ${total}${colors.reset}`);
  
  // Color code the success rate based on percentage
  const successColor = percentage >= 80 ? colors.green : percentage >= 50 ? colors.yellow : colors.red;
  console.log(`  ${successColor}Success Rate: ${percentage}%${colors.reset}`);
  console.log(`${'='.repeat(50)}`);
}

runTests();

