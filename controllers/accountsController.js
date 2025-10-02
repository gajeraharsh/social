const Account = require('../models/Account');
const { createAccountSchema, updateAccountSchema } = require('../validations/accountValidation');

exports.list = async (req, res, next) => {
  try {
    const items = await Account.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await Account.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Account not found' });
    return res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = createAccountSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', details: error.details });
    const created = await Account.create(value);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = updateAccountSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed', details: error.details });
    const updated = await Account.findByIdAndUpdate(req.params.id, value, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Account not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const deleted = await Account.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Account not found' });
    return res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
};
