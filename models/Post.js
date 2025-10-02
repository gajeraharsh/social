const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['video', 'image'], required: true },
    url: { type: String, required: true, trim: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    status: { type: String, enum: ['pending', 'posted'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Post', PostSchema);
