#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Function to check if a URL is accessible
function waitForUrl(url, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve();
        } else {
          if (retries++ < maxRetries) {
            setTimeout(check, 500);
          } else {
            reject(new Error(`Timeout waiting for ${url}`));
          }
        }
      }).on('error', () => {
        if (retries++ < maxRetries) {
          setTimeout(check, 500);
        } else {
          reject(new Error(`Could not connect to ${url}`));
        }
      });
    };
    
    check();
  });
}

// Try to find which port Vite is using
function findVitePort() {
  return new Promise((resolve) => {
    let port = 5173;
    
    const tryPort = () => {
      const url = `http://localhost:${port}`;
      http.get(url, (res) => {
        resolve(port);
      }).on('error', () => {
        if (port < 5190) {
          port++;
          setTimeout(tryPort, 100);
        } else {
          resolve(5173); // fallback
        }
      });
    };
    
    // Give Vite a moment to start
    setTimeout(tryPort, 500);
  });
}

async function main() {
  console.log('📦 Zen AI Desktop - Development Mode\n');
  console.log('🚀 Starting web-app dev server on localhost:5173+...\n');
  
  // Start web-app dev server
  const webApp = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../../web-app'),
    stdio: 'inherit',
    shell: true,
  });

  webApp.on('error', (err) => {
    console.error('❌ Web-app error:', err);
    process.exit(1);
  });

  // Wait for any dev server to be ready
  try {
    await waitForUrl('http://localhost:5173');
    console.log('\n✅ Web-app dev server is ready!\n');
  } catch (err) {
    console.error('\n❌ Web-app failed to start:', err.message);
    process.exit(1);
  }

  // Find the actual Vite port
  const vitePort = await findVitePort();
  if (vitePort !== 5173) {
    console.log(`ℹ️  Vite is running on port ${vitePort} (5173 was in use)\n`);
  }

  // Wait a bit more for stability
  await new Promise(r => setTimeout(r, 1500));

  // Try to start Electron if available
  try {
    console.log('🎯 Starting Electron window...\n');
    const electronEnv = Object.assign({}, process.env, {
      VITE_DEV_PORT: vitePort.toString(),
    });

    const electron = spawn('electron', ['.'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
      env: electronEnv,
    });

    electron.on('error', (err) => {
      console.warn('⚠️  Electron not available. Please install with:');
      console.warn('   npm install --save-dev electron\n');
      console.log(`💡 Web-app is running at http://localhost:${vitePort}`);
    });

    electron.on('exit', () => {
      console.log(`\n👋 Shutting down...\n`);
      // Kill the web-app process when Electron closes
      webApp.kill('SIGINT');
      process.exit(0);
    });
  } catch (err) {
    console.warn('⚠️  Could not start Electron:', err.message);
    console.log('\n💡 Install Electron with: npm install --save-dev electron');
    console.log(`📝 Web-app is running at http://localhost:${vitePort}\n`);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
