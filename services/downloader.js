const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Global single-conversion lock to ensure only one video conversion
// runs at a time across the entire process.
let conversionLock = Promise.resolve();
function withConversionLock(fn) {
  const run = async () => fn();
  const prev = conversionLock || Promise.resolve();
  const p = prev.then(run, run);
  conversionLock = p.finally(() => {
    conversionLock = Promise.resolve();
  });
  return p;
}

/**
 * Download media using yt-dlp to a temp directory.
 * Returns { filePath } on success.
 */
async function downloadWithYtDlp(sourceUrl) {
  const tmpDir = path.join(os.tmpdir(), 'ig-media');
  await fs.ensureDir(tmpDir);
  const outTemplate = path.join(tmpDir, '%(id)s.%(ext)s');

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['-o', outTemplate, sourceUrl]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      resolve();
    });
  });

  // Find newest file in tmpDir
  const files = (await fs.readdir(tmpDir)).map((f) => path.join(tmpDir, f));
  const stats = await Promise.all(files.map(async (f) => ({ f, s: await fs.stat(f) })));
  const latest = stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)[0];
  if (!latest) throw new Error('Download failed: no file found');
  return { filePath: latest.f };
}

async function cleanupFile(filePath) {
  try {
    if (filePath) await fs.remove(filePath);
  } catch (e) {
    // ignore cleanup errors
  }
}

module.exports = { downloadWithYtDlp, cleanupFile };

/**
 * Convert a video to Instagram-compatible MP4 using ffmpeg
 * Returns { filePath } of converted file
 */
async function convertForInstagram(inputPath) {
  return withConversionLock(async () => {
    const outDir = path.dirname(inputPath);
    const outPath = path.join(outDir, `${path.parse(inputPath).name}-ig.mp4`);
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.0',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outPath,
      ];
      const ff = spawn('ffmpeg', args);
      let stderr = '';
      ff.stderr.on('data', (d) => (stderr += d.toString()));
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code !== 0) return reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        resolve();
      });
    });
    return { filePath: outPath };
  });
}

module.exports.convertForInstagram = convertForInstagram;
