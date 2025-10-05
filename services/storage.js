const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function getBaseUrl() {
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return base.replace(/\/$/, '');
}

/**
 * Move a file into public/uploads and return { url, absPath }
 */
async function storeToUploads(srcAbsPath) {
  await fs.ensureDir(UPLOADS_DIR);
  const origName = path.basename(srcAbsPath);
  const uniquePrefix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const fileName = `${uniquePrefix}-${origName}`;
  const destAbsPath = path.join(UPLOADS_DIR, fileName);
  await fs.copy(srcAbsPath, destAbsPath);
  const url = `${getBaseUrl()}/public/uploads/${encodeURIComponent(fileName)}`;
  return { url, absPath: destAbsPath };
}

async function cleanupUpload(absPath) {
  try {
    await fs.remove(absPath);
  } catch (_) {}
}

module.exports = { storeToUploads, cleanupUpload };
