const cron = require('node-cron');
const Account = require('../models/Account');
const Post = require('../models/Post');
const { downloadWithYtDlp, cleanupFile, convertForInstagram } = require('./downloader');
const { storeToUploads, cleanupUpload } = require('./storage');
const { createMediaContainer, publishContainer, waitForContainerReady } = require('./instagram');
const CronRun = require('../models/CronRun');
const UploadLog = require('../models/UploadLog');

// Simple per-account lock to guarantee sequential posting per account
const accountLocks = new Map();
function withAccountLock(accountId, fn) {
  const run = async () => {
    try {
      return await fn();
    } finally {
      accountLocks.set(accountId, Promise.resolve());
    }
  };
  const prev = accountLocks.get(accountId) || Promise.resolve();
  const p = prev.then(run, run);
  accountLocks.set(accountId, p);
  return p;
}

async function processNextPostForAccount(account, cronCtx) {
  // Find the next pending post for this account
  const post = await Post.findOne({ account: account._id, status: 'pending' }).sort({ createdAt: 1 });
  if (!post) {
    // Log skipped when no pending post (even for manual triggers)
    const logDoc = {
      account: account._id,
      post: null,
      status: 'skipped',
      errorReason: 'no-pending-post',
      startedAt: new Date(),
      endedAt: new Date(),
    };
    if (cronCtx?.cronRun) logDoc.cronRun = cronCtx.cronRun._id;
    await UploadLog.create(logDoc);
    return { skipped: true, reason: 'no-pending-post' };
  }

  let filePath;
  let convertedPath;
  let publicFile;
  const baseLog = {
    account: account._id,
    post: post._id,
    type: post.type,
    status: 'skipped', // will update below
    startedAt: new Date(),
  };
  if (cronCtx?.cronRun) baseLog.cronRun = cronCtx.cronRun._id;
  const log = await UploadLog.create(baseLog);
  try {
    // Step 1: Download media locally (requirement), but IG Graph API requires public URL.
    // We'll still download to fulfill requirement and then use original post.url for the API call.
    const dl = await downloadWithYtDlp(post.url);
    filePath = dl.filePath;
    // Step 1.5: Convert to Instagram-compatible MP4 when video
    let toStorePath = filePath;
    if (post.type === 'video') {
      try {
        const conv = await convertForInstagram(filePath);
        convertedPath = conv.filePath;
        toStorePath = convertedPath;
      } catch (e) {
        console.warn('FFmpeg conversion failed, falling back to original file:', e.message);
      }
    }
    // Move into public/uploads and get a local URL to serve to IG Graph API
    publicFile = await storeToUploads(toStorePath);

    // Step 2: Create media container
    const type = post.type === 'video' ? 'video' : 'image';
    // Always resolve the account from the post to avoid any mismatch in concurrent flows
    const postAccount = await Account.findById(post.account);
    if (!postAccount) {
      throw new Error('Post linked account not found');
    }
    // Optional sanity: warn if the scheduler account differs from post.account
    if (postAccount._id.toString() !== account._id.toString()) {
      console.warn('[Scheduler] Mismatch: post.account differs from iterator account', {
        iteratorAccountId: account._id?.toString(),
        postAccountId: postAccount._id?.toString(),
        postId: post._id?.toString(),
      });
    }
    const { ig_user_id, access_token } = postAccount;
    if (!ig_user_id || !access_token) {
      throw new Error(`Account ${postAccount.username || postAccount._id} missing ig_user_id or access_token`);
    }

    const container = await createMediaContainer({
      ig_user_id,
      access_token,
      type,
      sourceUrl: publicFile.url, // serve from our server to ensure public accessibility
      caption: post.name || '',
    });

    // Step 3: Wait until container is ready to publish
    await waitForContainerReady({ access_token, creation_id: container.id });

    // Step 4: Publish container
    await publishContainer({ ig_user_id, access_token, creation_id: container.id });

    // Step 5: Update status to posted
    post.status = 'posted';
    await post.save();

    // Update UploadLog
    if (log) {
      log.status = 'success';
      log.endedAt = new Date();
      await log.save();
    }
    // Update counters on cron run
    if (cronCtx?.cronRun) {
      const inc = { success: 1 };
      if (type === 'video') inc.videos = 1; else inc.images = 1;
      await CronRun.updateOne({ _id: cronCtx.cronRun._id }, {
        $inc: { 'stats.success': inc.success, [`stats.${type === 'video' ? 'videos' : 'images'}`]: 1 },
      });
    }
    return { success: true, postId: post._id.toString() };
  } catch (err) {
    console.error('Posting error:', {
      account: account.username,
      accountId: account._id?.toString(),
      error: err?.message,
    });
    if (log) {
      log.status = 'failed';
      log.errorReason = err?.message || 'unknown-error';
      log.endedAt = new Date();
      await log.save();
    }
    if (cronCtx?.cronRun) {
      await CronRun.updateOne({ _id: cronCtx.cronRun._id }, { $inc: { 'stats.failed': 1, [`stats.${post?.type === 'video' ? 'videos' : 'images'}`]: 1 } });
    }
    return { error: true, message: err.message };
  } finally {
    // Step 6: Cleanup files (both temp and uploaded copies)
    if (filePath) await cleanupFile(filePath);
    if (convertedPath) await cleanupFile(convertedPath);
    if (publicFile?.absPath) await cleanupUpload(publicFile.absPath);
  }
}

function scheduleForTimes(times = ['0 0 * * *', '0 4 * * *', '0 8 * * *', '0 12 * * *', '0 16 * * *']) {
  times.forEach((cronExp) => {
    cron.schedule(cronExp, async () => {
      console.log(`[Scheduler] Tick for ${cronExp} at`, new Date().toISOString());
      const cronRun = await CronRun.create({ cronExp, startedAt: new Date(), stats: { totalAccountsTried: 0, success: 0, failed: 0, images: 0, videos: 0 } });
      try {
        const accounts = await Account.find().sort({ createdAt: 1 });
        const concurrency = Math.max(1, parseInt(process.env.POST_ACCOUNT_CONCURRENCY || '10', 10));
        await runWithConcurrency(accounts, concurrency, async (account) => {
          await CronRun.updateOne({ _id: cronRun._id }, { $inc: { 'stats.totalAccountsTried': 1 } });
          await withAccountLock(account._id.toString(), () => processNextPostForAccount(account, { cronRun }));
        });
      } finally {
        await CronRun.updateOne({ _id: cronRun._id }, { $set: { endedAt: new Date() } });
      }
    });
  });
}

function initScheduler() {
  // Allow override via env POST_SCHEDULE_CRONS as comma-separated cron expressions
  const override = process.env.POST_SCHEDULE_CRONS;
  if (override) {
    const parts = override.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      scheduleForTimes(parts);
      console.log('[Scheduler] Using custom cron times:', parts);
      return;
    }
  }
  scheduleForTimes();
  console.log('[Scheduler] Default cron times registered (00:00, 04:00, 08:00, 12:00, 16:00)');
}

module.exports = { initScheduler, processNextPostForAccount, runOnceForAccount, runForAllAccounts };

// Helpers
async function runWithConcurrency(items, limit, iterator) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iterator(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.allSettled(results);
}

async function runOnceForAccount(accountId) {
  const account = await Account.findById(accountId);
  if (!account) throw new Error('Account not found');
  return withAccountLock(account._id.toString(), () => processNextPostForAccount(account, null));
}

async function runForAllAccounts() {
  const accounts = await Account.find().sort({ createdAt: 1 });
  const concurrency = Math.max(1, parseInt(process.env.POST_ACCOUNT_CONCURRENCY || '10', 10));
  const results = [];
  await runWithConcurrency(accounts, concurrency, async (account) => {
    const res = await withAccountLock(account._id.toString(), () => processNextPostForAccount(account));
    results.push({ accountId: account._id.toString(), username: account.username, result: res });
  });
  return results;
}
