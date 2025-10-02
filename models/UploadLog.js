const mongoose = require('mongoose');

const UploadLogSchema = new mongoose.Schema(
  {
    cronRun: { type: mongoose.Schema.Types.ObjectId, ref: 'CronRun' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    type: { type: String, enum: ['video', 'image'] },
    status: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
    errorReason: { type: String },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UploadLog', UploadLogSchema);
