#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const webAppDir = path.join(__dirname, '../../web-app');
const webAppDistDir = path.join(webAppDir, 'dist');
const desktopDistWebDir = path.join(__dirname, '../dist-web');

console.log('🔨 Building web-app...');
try {
  execSync('npm run build', {
    cwd: webAppDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_BASE: './',
    },
  });
  console.log('✅ Web-app build complete');
} catch (error) {
  console.error('❌ Web-app build failed:', error.message);
  process.exit(1);
}

// Remove old dist-web directory if it exists
if (fs.existsSync(desktopDistWebDir)) {
  console.log('🧹 Removing old dist-web directory...');
  fs.rmSync(desktopDistWebDir, { recursive: true, force: true });
}

// Copy web-app dist to desktop dist-web
console.log('📦 Copying web-app dist to desktop...');
try {
  fs.cpSync(webAppDistDir, desktopDistWebDir, { recursive: true });
  console.log('✅ Web-app synced to desktop/dist-web');
} catch (error) {
  console.error('❌ Failed to sync web-app:', error.message);
  process.exit(1);
}

console.log('✅ Web-app preparation complete');
