const fs = require('fs');
const path = require('path');

// Helper function to copy files recursively
function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Helper function to remove directory recursively
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(file => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
}

// Bundle content script
function bundleContent(outputDir) {
  const constantsPath = path.join(__dirname, 'cc/src/constants.js');
  const contentPath = path.join(__dirname, 'cc/src/content.js');
  const currencyDetectorPath = path.join(__dirname, 'cc/src/currency-detector.js');

  let constantsContent = fs.readFileSync(constantsPath, 'utf8');
  let contentContent = fs.readFileSync(contentPath, 'utf8');
  let currencyDetectorContent = fs.readFileSync(currencyDetectorPath, 'utf8');

  // Remove export/import statements
  constantsContent = constantsContent.replace(/export\s+(?:const|let|var)\s+/g, 'const ');
  constantsContent = constantsContent.replace(/export\s*{[^}]+}/g, '');
  contentContent = contentContent.replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, '');
  currencyDetectorContent = currencyDetectorContent.replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, '');
  currencyDetectorContent = currencyDetectorContent.replace(/export\s+(?:default\s+)?class\s+/g, 'class ');

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes('firefox')) {
    contentContent = contentContent.replace(/chrome\./g, 'browser.');
    currencyDetectorContent = currencyDetectorContent.replace(/chrome\./g, 'browser.');
  }

  const bundledContent = `// Auto-generated bundled content script
${constantsContent}

${currencyDetectorContent}

${contentContent}`;

  fs.writeFileSync(path.join(outputDir, 'src/content.js'), bundledContent);
}

// Bundle background script
function bundleBackground(outputDir) {
  const constantsPath = path.join(__dirname, 'cc/src/constants.js');
  const backgroundPath = path.join(__dirname, 'cc/src/background.js');

  let constantsContent = fs.readFileSync(constantsPath, 'utf8');
  let backgroundContent = fs.readFileSync(backgroundPath, 'utf8');

  // Remove export/import statements
  constantsContent = constantsContent.replace(/export\s+(?:const|let|var)\s+/g, 'const ');
  constantsContent = constantsContent.replace(/export\s*{[^}]+}/g, '');
  backgroundContent = backgroundContent.replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, '');

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes('firefox')) {
    backgroundContent = backgroundContent.replace(/chrome\./g, 'browser.');
  }

  const bundledContent = `// Auto-generated bundled background script
${constantsContent}

${backgroundContent}`;

  fs.writeFileSync(path.join(outputDir, 'src/background.js'), bundledContent);
}

// Bundle currency detector for popup
function bundleCurrencyDetector(outputDir) {
  const constantsPath = path.join(__dirname, 'cc/src/constants.js');
  const currencyDetectorPath = path.join(__dirname, 'cc/src/currency-detector.js');

  let constantsContent = fs.readFileSync(constantsPath, 'utf8');
  let currencyDetectorContent = fs.readFileSync(currencyDetectorPath, 'utf8');

  // Remove export/import statements
  constantsContent = constantsContent.replace(/export\s+(?:const|let|var)\s+/g, 'const ');
  constantsContent = constantsContent.replace(/export\s*{[^}]+}/g, '');
  currencyDetectorContent = currencyDetectorContent.replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, '');
  currencyDetectorContent = currencyDetectorContent.replace(/export\s+(?:default\s+)?class\s+/g, 'class ');

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes('firefox')) {
    currencyDetectorContent = currencyDetectorContent.replace(/chrome\./g, 'browser.');
  }

  const bundledContent = `// Auto-generated bundled currency detector for popup
${constantsContent}

${currencyDetectorContent}`;

  fs.writeFileSync(path.join(outputDir, 'src/currency-detector.js'), bundledContent);
}

// Bundle popup script (without constants since currency-detector.js already has them)
function bundlePopup(outputDir) {
  const popupPath = path.join(__dirname, 'cc/src/popup.js');

  let popupContent = fs.readFileSync(popupPath, 'utf8');

  // Remove import statements only (don't include constants)
  popupContent = popupContent.replace(/import\s*{[^}]+}\s*from\s*["'][^"']+["'];?\s*/g, '');

  // Replace Chrome APIs with browser APIs for Firefox
  if (outputDir.includes('firefox')) {
    popupContent = popupContent.replace(/chrome\./g, 'browser.');
  }

  const bundledContent = `// Auto-generated bundled popup script (constants loaded by currency-detector.js)
${popupContent}`;

  fs.writeFileSync(path.join(outputDir, 'src/popup.js'), bundledContent);
}

// Main build function
function build() {
  console.log('Building browser extension packages...');

  // Clean existing build directories
  console.log('Cleaning existing build directories...');
  removeDir('chrome');
  removeDir('firefox');
  
  // Create directories
  fs.mkdirSync('chrome', { recursive: true });
  fs.mkdirSync('firefox', { recursive: true });

  // Copy source files to Chrome directory
  console.log('Copying source files to chrome/ directory...');
  copyRecursive('cc', 'chrome');

  // Copy source files to web addon directory (for the interactive demo)
  const webAddonPath = path.join(__dirname, 'web/addon');
  if (fs.existsSync(path.dirname(webAddonPath))) {
    console.log('Copying source files to web/addon/ directory...');
    if (!fs.existsSync(webAddonPath)) {
      fs.mkdirSync(webAddonPath, { recursive: true });
    }
    copyRecursive('cc', webAddonPath);
  }

  // Copy source files to Firefox directory
  console.log('Copying source files to firefox/ directory...');
  copyRecursive('cc', 'firefox');

  // Handle Chrome manifest
  console.log('Setting up Chrome manifest...');
  fs.copyFileSync('manifest-chrome.json', 'chrome/manifest.json');

  // Handle Firefox manifest
  console.log('Setting up Firefox manifest...');
  fs.copyFileSync('manifest-firefox.json', 'firefox/manifest.json');

  // Bundle JavaScript files
  console.log('Bundling JavaScript files...');
  
  // Bundle for Chrome
  bundleContent('chrome');
  bundleBackground('chrome');
  bundleCurrencyDetector('chrome');
  bundlePopup('chrome');
  console.log('✅ Chrome bundling complete!');
  
  // Bundle for Firefox
  bundleContent('firefox');
  bundleBackground('firefox');
  bundleCurrencyDetector('firefox');
  bundlePopup('firefox');
  console.log('✅ Firefox bundling complete!');
  
  // Bundle for web if applicable
  if (fs.existsSync(webAddonPath)) {
    bundleContent(webAddonPath);
    bundleBackground(webAddonPath);
    bundleCurrencyDetector(webAddonPath);
    bundlePopup(webAddonPath);
    console.log('✅ Web addon bundling complete!');
  }

  console.log('\nBuild completed successfully!');
  console.log('Chrome extension files are in: chrome/');
  console.log('Firefox extension files are in: firefox/');
}

// Run build if called directly
if (require.main === module) {
  build();
}

module.exports = { build };