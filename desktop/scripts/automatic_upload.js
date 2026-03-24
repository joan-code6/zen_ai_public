const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Hardcoded per user request (non-secret values). You can override project with APPWRITE_PROJECT env var.
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT || 'zenai';
const APPWRITE_BUCKET_ID = '696520880012a3766904';

// API key must NOT be committed. Prefer a service key in `APPWRITE_SERVICE_KEY`,
// fallback to `APPWRITE_KEY`.
const APPWRITE_SERVICE_KEY = process.env.APPWRITE_SERVICE_KEY;
const APPWRITE_KEY = APPWRITE_SERVICE_KEY || process.env.APPWRITE_KEY;
if (!APPWRITE_KEY) {
  console.error('Missing Appwrite API key. Set APPWRITE_SERVICE_KEY or APPWRITE_KEY in the environment. Aborting.');
  process.exit(1);
}
console.log('Using', APPWRITE_SERVICE_KEY ? 'service' : 'user', 'API key for Appwrite requests (value not shown)');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'dist');
const APPWRITE_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_RETRIES = 5;

function buildOutputFolderName() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `dist-prod-${stamp}`;
}

function runCommand(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function findArtifacts(dir) {
  const exts = ['.exe', '.AppImage', '.deb', '.dmg', '.zip', '.tar.gz'];
  // Skip build tools, uninstallers, and other artifacts we don't want to upload
  const skipPatterns = [
    /elevate\.exe/i,
    /__uninstaller-nsis/i,
    /nsis\./i,
    /builder-effective-config/i,
  ];
  const results = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const lower = e.name;
        // Check if file matches a skip pattern
        if (skipPatterns.some((p) => p.test(lower))) {
          console.log('Skipping build artifact:', lower);
          continue;
        }
        // Check if file has an installer extension
        for (const ext of exts) {
          if (lower.endsWith(ext)) {
            results.push(full);
            break;
          }
        }
      }
    }
  }

  if (fs.existsSync(dir)) walk(dir);
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getListedFiles(listJson) {
  if (Array.isArray(listJson.files)) return listJson.files;
  if (Array.isArray(listJson.documents)) return listJson.documents;
  return [];
}

function createUploadForm({ filePath, name, fileId, start, end }) {
  const form = new FormData();
  form.append('fileId', fileId);
  form.append('file', fs.createReadStream(filePath, { start, end }), {
    filename: name,
    knownLength: end - start + 1,
  });
  return form;
}

async function uploadChunk({ filePath, name, fileId, chunkIndex, chunkStart, chunkEnd, totalSize, existingFileId }) {
  const uploadUrl = `${APPWRITE_ENDPOINT.replace(/\/$/, '')}/storage/buckets/${APPWRITE_BUCKET_ID}/files`;
  let attempt = 0;

  while (attempt < MAX_UPLOAD_RETRIES) {
    attempt += 1;
    const form = createUploadForm({
      filePath,
      name,
      fileId,
      start: chunkStart,
      end: chunkEnd,
    });

    const headers = {
      'X-Appwrite-Project': APPWRITE_PROJECT,
      'X-Appwrite-Key': APPWRITE_KEY,
      'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
      ...form.getHeaders(),
    };

    if (existingFileId) {
      headers['X-Appwrite-Id'] = existingFileId;
    }

    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: form,
      });

      if (uploadRes.ok) {
        return await uploadRes.json();
      }

      const bodyText = await uploadRes.text();
      if ([502, 503, 504].includes(uploadRes.status) && attempt < MAX_UPLOAD_RETRIES) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Chunk ${chunkIndex} upload attempt ${attempt} for ${name} failed with ${uploadRes.status}. Retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      throw new Error(`Upload failed for chunk ${chunkIndex}: ${uploadRes.status} ${bodyText}`);
    } catch (err) {
      if (attempt < MAX_UPLOAD_RETRIES) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Chunk ${chunkIndex} upload attempt ${attempt} for ${name} errored: ${err.message}. Retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Upload failed for chunk ${chunkIndex}: retry budget exhausted`);
}

async function uploadInChunks(filePath, name, stat) {
  const totalChunks = Math.ceil(stat.size / APPWRITE_CHUNK_SIZE);
  const requestedFileId = 'unique()';
  let uploadedFileId = null;

  console.log(`Uploading ${name} in ${totalChunks} chunk(s) of up to ${Math.round(APPWRITE_CHUNK_SIZE / (1024 * 1024))}MB`);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunkStart = chunkIndex * APPWRITE_CHUNK_SIZE;
    const chunkEnd = Math.min(stat.size, chunkStart + APPWRITE_CHUNK_SIZE) - 1;
    const responseJson = await uploadChunk({
      filePath,
      name,
      fileId: uploadedFileId || requestedFileId,
      chunkIndex: chunkIndex + 1,
      chunkStart,
      chunkEnd,
      totalSize: stat.size,
      existingFileId: uploadedFileId,
    });

    if (!uploadedFileId && responseJson && responseJson.$id) {
      uploadedFileId = responseJson.$id;
    }

    const uploadedBytes = chunkEnd + 1;
    const uploadedPercent = ((uploadedBytes / stat.size) * 100).toFixed(1);
    console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks} for ${name} (${uploadedPercent}%)`);
  }

  console.log('Uploaded', name, '->', uploadedFileId);
}

async function uploadSingleRequest(filePath, name) {
  const uploadUrl = `${APPWRITE_ENDPOINT.replace(/\/$/, '')}/storage/buckets/${APPWRITE_BUCKET_ID}/files`;
  let attempt = 0;

  while (attempt < MAX_UPLOAD_RETRIES) {
    attempt += 1;
    const form = new FormData();
    form.append('fileId', 'unique()');
    form.append('file', fs.createReadStream(filePath), { filename: name });

    const headers = {
      'X-Appwrite-Project': APPWRITE_PROJECT,
      'X-Appwrite-Key': APPWRITE_KEY,
      ...form.getHeaders(),
    };

    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: form,
      });

      if (uploadRes.ok) {
        const uploadJson = await uploadRes.json();
        console.log('Uploaded', name, '->', uploadJson.$id);
        return;
      }

      const bodyText = await uploadRes.text();
      if ([502, 503, 504].includes(uploadRes.status) && attempt < MAX_UPLOAD_RETRIES) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Upload attempt ${attempt} for ${name} failed with ${uploadRes.status}. Retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      throw new Error(`Upload failed: ${uploadRes.status} ${bodyText}`);
    } catch (err) {
      if (attempt < MAX_UPLOAD_RETRIES) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Upload attempt ${attempt} for ${name} errored: ${err.message}. Retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      throw err;
    }
  }
}

async function listFiles() {
  const listUrl = `${APPWRITE_ENDPOINT.replace(/\/$/, '')}/storage/buckets/${APPWRITE_BUCKET_ID}/files`;
  console.log('Listing files from', listUrl);
  console.log('Using project:', APPWRITE_PROJECT);
  const res = await fetch(listUrl, {
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT,
      'X-Appwrite-Key': APPWRITE_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('List response status:', res.status, txt);
    throw new Error(`Failed to list files: ${res.status} ${txt}`);
  }
  return await res.json();
}

async function deleteFile(fileId) {
  const delUrl = `${APPWRITE_ENDPOINT.replace(/\/$/, '')}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}`;
  const delRes = await fetch(delUrl, {
    method: 'DELETE',
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT,
      'X-Appwrite-Key': APPWRITE_KEY,
    },
  });
  if (!delRes.ok) {
    const txt = await delRes.text();
    throw new Error(`Failed to delete file: ${delRes.status} ${txt}`);
  }
}

async function uploadFile(filePath) {
  const name = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  // Allow overriding the maximum size via environment variable
  const maxSizeMB = process.env.APPWRITE_MAX_SIZE_MB ? Number(process.env.APPWRITE_MAX_SIZE_MB) : 100;
  const forceUpload = process.argv.includes('--force-upload') || process.argv.includes('--force');

  if (stat.size > maxSizeMB * 1024 * 1024 && !forceUpload) {
    console.warn(`Skipping ${name} (${sizeMB}MB) - exceeds ${maxSizeMB}MB threshold (Appwrite backend limits). Use --force-upload or set APPWRITE_MAX_SIZE_MB to override.`);
    return;
  }

  console.log('Preparing upload for', name, `(${sizeMB}MB)`);

  // Delete existing files with same name
  const listJson = await listFiles();
  const listedFiles = getListedFiles(listJson);
  if (listedFiles.length > 0) {
    for (const doc of listedFiles) {
      if (doc.name === name) {
        console.log(`Deleting existing file ${name} (id=${doc.$id})`);
        await deleteFile(doc.$id);
      }
    }
  }

  if (stat.size > APPWRITE_CHUNK_SIZE) {
    await uploadInChunks(filePath, name, stat);
    return;
  }

  await uploadSingleRequest(filePath, name);
}

async function main() {
  try {
    const skipBuild = process.argv.includes('--skip-build');
    let artifactDir = DEFAULT_OUT_DIR;

    if (!skipBuild) {
      // Determine packaging targets based on host OS to avoid unsupported cross-builds
      const platform = process.platform; // 'win32', 'darwin', 'linux'
      let targets = [];
      if (platform === 'darwin') targets = ['--mac'];
      else if (platform === 'win32') targets = ['--win'];
      else if (platform === 'linux') targets = ['--linux'];
      else targets = [];

      // Build into a fresh output directory every run to avoid file lock issues in dist/win-unpacked.
      const outputFolderName = buildOutputFolderName();
      artifactDir = path.join(ROOT, outputFolderName);

      console.log('Packaging for targets:', targets.length ? targets.join(',') : 'default');
      console.log('Using fresh output directory:', artifactDir);
      runCommand('npm', ['run', 'build']);

      const builderArgs = ['electron-builder'];
      if (targets.length) builderArgs.push(...targets);
      builderArgs.push(`--config.directories.output=${outputFolderName}`);
      runCommand('npx', builderArgs);
    } else {
      console.log('Skipping build (--skip-build flag detected)');
    }

    console.log('Searching for built installer artifacts in', artifactDir);
    const artifacts = findArtifacts(artifactDir);
    if (artifacts.length === 0) {
      console.error('No installer artifacts found in', artifactDir);
      process.exit(1);
    }

    for (const a of artifacts) {
      await uploadFile(a);
    }

    console.log('All uploads complete.');
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
