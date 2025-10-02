const Post = require('../models/Post');
const { createPostSchema, updatePostSchema } = require('../validations/postValidation');

// Helper for pagination
function buildPagination({ page = 1, limit = 10 }) {
  page = parseInt(page, 10) || 1;
  limit = Math.min(parseInt(limit, 10) || 10, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

exports.list = async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const [items, total] = await Promise.all([
      Post.find().populate('account').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments(),
    ]);
    return res.json({ success: true, data: { items, page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await Post.findById(req.params.id).populate('account');
    if (!item) return res.status(404).json({ success: false, message: 'Post not found' });
    return res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = createPostSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', details: error.details });
    const created = await Post.create(value);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = updatePostSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', details: error.details });
    const updated = await Post.findByIdAndUpdate(req.params.id, value, { new: true }).populate('account');
    if (!updated) return res.status(404).json({ success: false, message: 'Post not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const deleted = await Post.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Post not found' });
    return res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
};
