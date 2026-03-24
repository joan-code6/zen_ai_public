const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook to ensure ffmpeg.dll is copied correctly
 * This addresses the issue where portable builds might not include ffmpeg.dll
 */
exports.default = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  console.log('Running afterPack hook...');
  console.log('Platform:', electronPlatformName);
  console.log('Output directory:', appOutDir);
  
  // Only process Windows builds
  if (electronPlatformName !== 'win32') {
    console.log('Skipping ffmpeg copy - not Windows');
    return;
  }
  
  // Find the electron distribution
  const electronPath = require('electron');
  const electronDist = path.dirname(electronPath);
  
  // Source ffmpeg.dll from electron distribution
  const sourceFfmpeg = path.join(electronDist, 'ffmpeg.dll');
  
  // Target location: next to the executable
  const targetFfmpeg = path.join(appOutDir, 'ffmpeg.dll');
  
  if (!fs.existsSync(sourceFfmpeg)) {
    console.warn('Warning: ffmpeg.dll not found at', sourceFfmpeg);
    return;
  }
  
  try {
    console.log('Copying ffmpeg.dll from', sourceFfmpeg);
    console.log('                     to', targetFfmpeg);
    fs.copyFileSync(sourceFfmpeg, targetFfmpeg);
    console.log('Successfully copied ffmpeg.dll');
  } catch (err) {
    console.error('Error copying ffmpeg.dll:', err);
    throw err;
  }
};
