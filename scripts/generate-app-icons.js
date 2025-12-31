#!/usr/bin/env node
/**
 * Generate iOS app icons from the bands brand
 * Creates a 1024x1024 PNG icon matching the SVG design
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Brand colors
const BRAND_RED = '#ef4444';
const WHITE = '#ffffff';

// Icon SVG matching the existing design
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="192" fill="${BRAND_RED}"/>
  <text x="512" y="680" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="560" font-weight="bold" fill="${WHITE}">$</text>
</svg>
`;

// Splash screen SVG (simple black background with logo)
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#000000"/>
  <rect x="1116" y="1116" width="500" height="500" rx="100" fill="${BRAND_RED}"/>
  <text x="1366" y="1450" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="280" font-weight="bold" fill="${WHITE}">$</text>
</svg>
`;

async function generateIcons() {
  const iosAssetsPath = path.join(__dirname, '../ios/App/App/Assets.xcassets');

  // Generate 1024x1024 app icon
  const appIconPath = path.join(iosAssetsPath, 'AppIcon.appiconset/AppIcon-512@2x.png');

  console.log('Generating 1024x1024 app icon...');
  await sharp(Buffer.from(iconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(appIconPath);
  console.log(`  ✓ Created ${appIconPath}`);

  // Generate splash screen images (2732x2732 for all device sizes)
  const splashPath = path.join(iosAssetsPath, 'Splash.imageset');

  console.log('Generating splash screen images...');
  const splashBuffer = await sharp(Buffer.from(splashSvg))
    .resize(2732, 2732)
    .png()
    .toBuffer();

  for (const suffix of ['', '-1', '-2']) {
    const filename = `splash-2732x2732${suffix}.png`;
    const filepath = path.join(splashPath, filename);
    await fs.promises.writeFile(filepath, splashBuffer);
    console.log(`  ✓ Created ${filepath}`);
  }

  console.log('\n✅ All icons generated successfully!');
  console.log('\nNext steps:');
  console.log('  1. Run: npx cap sync ios');
  console.log('  2. Open in Xcode: npx cap open ios');
  console.log('  3. Configure signing and build for TestFlight');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
