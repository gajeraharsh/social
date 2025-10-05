const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const crypto = require('crypto');

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
async function downloadWithYtDlp(sourceUrl, opts = {}) {
  const tmpDir = path.join(os.tmpdir(), 'ig-media');
  // Use a unique subdirectory per invocation to avoid concurrency conflicts
  const sessionDir = path.join(tmpDir, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
  await fs.ensureDir(sessionDir);
  const outTemplate = path.join(sessionDir, '%(id)s.%(ext)s');

  // Build yt-dlp args with optional auth/cookies and headers
  const args = ['-o', outTemplate, '--no-playlist'];

  const envCookiesBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER; // e.g. chrome, chromium, brave, firefox
  const envCookiesFile = process.env.YTDLP_COOKIES_FILE; // path to cookies.txt / netscape format
  const envUserAgent = process.env.YTDLP_USER_AGENT; // optional UA override

  const cookiesFromBrowser = opts.cookiesFromBrowser || envCookiesBrowser;
  const cookiesFile = opts.cookiesFile || envCookiesFile;
  const userAgent = opts.userAgent || envUserAgent;
  const referer = opts.referer || sourceUrl;

  if (cookiesFromBrowser) {
    args.push('--cookies-from-browser', String(cookiesFromBrowser));
  } else if (cookiesFile) {
    args.push('--cookies', String(cookiesFile));
  }

  if (userAgent) {
    args.push('--user-agent', String(userAgent));
  }

  // Set a reasonable retry strategy
  args.push('--retry-sleep', '3', '--retries', '5');

  // Some sites (incl. Instagram) require a referer header
  if (referer) {
    args.push('--referer', String(referer));
  }

  // Finally, the URL
  args.push(sourceUrl);

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    let stdout = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        const isInstagram = /instagram\.com/i.test(sourceUrl);
        const hintParts = [];
        if (isInstagram) {
          hintParts.push('Instagram often requires authentication.');
          hintParts.push('Set YTDLP_COOKIES_FROM_BROWSER (e.g. "chrome", "firefox") or YTDLP_COOKIES_FILE to a cookies.txt, or pass opts.cookiesFromBrowser/opts.cookiesFile.');
          hintParts.push('See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp');
        }
        if (!cookiesFromBrowser && !cookiesFile) {
          hintParts.push('No cookies were provided to yt-dlp.');
        }
        const hint = hintParts.length ? ` Hint: ${hintParts.join(' ')}` : '';
        return reject(new Error(`yt-dlp exited with code ${code}.${hint}\nArgs: ${JSON.stringify(args)}\nSTDERR: ${stderr || '(empty)'}\nSTDOUT: ${stdout || '(empty)'}`));
      }
      resolve();
    });
  });

  // Find newest file in this session directory only
  const files = (await fs.readdir(sessionDir)).map((f) => path.join(sessionDir, f));
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

