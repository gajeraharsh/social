const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Account = require('../models/Account');
const { createPostSchema, updatePostSchema } = require('../validations/postValidation');
const { createAccountSchema, updateAccountSchema } = require('../validations/accountValidation');
const CronRun = require('../models/CronRun');
const UploadLog = require('../models/UploadLog');

// Helper for pagination
function buildPagination({ page = 1, limit = 10 }) {
  page = parseInt(page, 10) || 1;
  limit = Math.min(parseInt(limit, 10) || 10, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// Admin Home redirect -> Dashboard
router.get('/', (req, res) => res.redirect('/admin/dashboard'));

// Dashboard (analytics)
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalPosts, pendingPosts, postedPosts, totalAccounts] = await Promise.all([
      Post.countDocuments(),
      Post.countDocuments({ status: 'pending' }),
      Post.countDocuments({ status: 'posted' }),
      Account.countDocuments(),
    ]);

    // Per-account statistics
    const perAccountAgg = await Post.aggregate([
      {
        $group: {
          _id: '$account',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          posted: { $sum: { $cond: [{ $eq: ['$status', 'posted'] }, 1, 0] } },
          lastCreatedAt: { $max: '$createdAt' },
        },
      },
      { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
      { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
    ]);

    // Recent posts
    const recentPosts = await Post.find()
      .populate('account', 'username')
      .sort({ createdAt: -1 })
      .limit(10);

    // Cron/Upload summary for dashboard
    const [totalCronRuns, successCount, failedCount, imageProcessed, videoProcessed, lastCron, lastUpload] = await Promise.all([
      CronRun.countDocuments(),
      UploadLog.countDocuments({ status: 'success' }),
      UploadLog.countDocuments({ status: 'failed' }),
      UploadLog.countDocuments({ status: { $in: ['success', 'failed'] }, type: 'image' }),
      UploadLog.countDocuments({ status: { $in: ['success', 'failed'] }, type: 'video' }),
      CronRun.findOne().sort({ startedAt: -1 }),
      UploadLog.findOne().sort({ createdAt: -1 }),
    ]);

    const uploadsPerAccount = await UploadLog.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: '$account', uploads: { $sum: 1 } } },
      { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
      { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
      { $sort: { uploads: -1 } },
      { $limit: 10 },
    ]);

    res.render('dashboard', {
      totals: { totalPosts, pendingPosts, postedPosts, totalAccounts },
      perAccount: perAccountAgg,
      recentPosts,
      logSummary: {
        totalCronRuns,
        processed: { images: imageProcessed, videos: videoProcessed },
        successCount,
        failedCount,
        uploadsPerAccount,
        recentActivity: {
          lastCronStartedAt: lastCron?.startedAt || null,
          lastCronEndedAt: lastCron?.endedAt || null,
          lastUploadAt: lastUpload?.createdAt || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Detailed Logs with Pagination
router.get('/logs', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      UploadLog.find()
        .populate('account', 'username')
        .populate('post', 'name type')
        .populate('cronRun', 'cronExp startedAt endedAt stats')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      UploadLog.countDocuments(),
    ]);

    res.render('logs/index', {
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// Posts List
router.get('/posts', async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const [posts, total, accounts] = await Promise.all([
      Post.find().populate('account').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments(),
      Account.find().sort({ username: 1 }),
    ]);
    res.render('posts/index', {
      posts,
      accounts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// New Post Form
router.get('/posts/new', async (req, res, next) => {
  try {
    const accounts = await Account.find().sort({ username: 1 });
    res.render('posts/form', { mode: 'create', post: {}, accounts, errors: [] });
  } catch (err) {
    next(err);
  }
});

// Create Post
router.post('/posts', async (req, res, next) => {
  try {
    const { error, value } = createPostSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const accounts = await Account.find().sort({ username: 1 });
      return res.status(400).render('posts/form', {
        mode: 'create',
        post: req.body,
        accounts,
        errors: error.details,
      });
    }
    await Post.create(value);
    req.flash('success', 'Post created');
    res.redirect('/admin/posts');
  } catch (err) {
    next(err);
  }
});

// Edit Post Form
router.get('/posts/:id/edit', async (req, res, next) => {
  try {
    const [post, accounts] = await Promise.all([
      Post.findById(req.params.id),
      Account.find().sort({ username: 1 }),
    ]);
    if (!post) {
      req.flash('error', 'Post not found');
      return res.redirect('/admin/posts');
    }
    res.render('posts/form', { mode: 'edit', post, accounts, errors: [] });
  } catch (err) {
    next(err);
  }
});

// Update Post
router.put('/posts/:id', async (req, res, next) => {
  try {
    const { error, value } = updatePostSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const accounts = await Account.find().sort({ username: 1 });
      return res.status(400).render('posts/form', {
        mode: 'edit',
        post: { ...req.body, _id: req.params.id },
        accounts,
        errors: error.details,
      });
    }
    const updated = await Post.findByIdAndUpdate(req.params.id, value, { new: true });
    if (!updated) {
      req.flash('error', 'Post not found');
      return res.redirect('/admin/posts');
    }
    req.flash('success', 'Post updated');
    res.redirect('/admin/posts');
  } catch (err) {
    next(err);
  }
});

// Delete Post
router.delete('/posts/:id', async (req, res, next) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    req.flash('success', 'Post deleted');
    res.redirect('/admin/posts');
  } catch (err) {
    next(err);
  }
});

// Accounts List
router.get('/accounts', async (req, res, next) => {
  try {
    const accounts = await Account.find().sort({ createdAt: -1 });
    res.render('accounts/index', { accounts });
  } catch (err) {
    next(err);
  }
});

// New Account Form
router.get('/accounts/new', (req, res) => {
  res.render('accounts/form', { mode: 'create', account: {}, errors: [] });
});

// Create Account
router.post('/accounts', async (req, res, next) => {
  try {
    const { error, value } = createAccountSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).render('accounts/form', {
        mode: 'create',
        account: req.body,
        errors: error.details,
      });
    }
    await Account.create(value);
    req.flash('success', 'Account created');
    res.redirect('/admin/accounts');
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Username already exists');
      return res.redirect('/admin/accounts');
    }
    next(err);
  }
});

// Edit Account Form
router.get('/accounts/:id/edit', async (req, res, next) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      req.flash('error', 'Account not found');
      return res.redirect('/admin/accounts');
    }
    res.render('accounts/form', { mode: 'edit', account, errors: [] });
  } catch (err) {
    next(err);
  }
});

// Update Account
router.put('/accounts/:id', async (req, res, next) => {
  try {
    const { error, value } = updateAccountSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).render('accounts/form', {
        mode: 'edit',
        account: { ...req.body, _id: req.params.id },
        errors: error.details,
      });
    }
    const updated = await Account.findByIdAndUpdate(req.params.id, value, { new: true });
    if (!updated) {
      req.flash('error', 'Account not found');
      return res.redirect('/admin/accounts');
    }
    req.flash('success', 'Account updated');
    res.redirect('/admin/accounts');
  } catch (err) {
    next(err);
  }
});

// Delete Account
router.delete('/accounts/:id', async (req, res, next) => {
  try {
    await Account.findByIdAndDelete(req.params.id);
    req.flash('success', 'Account deleted');
    res.redirect('/admin/accounts');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
