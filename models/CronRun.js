const mongoose = require('mongoose');

const CronRunSchema = new mongoose.Schema(
  {
    cronExp: { type: String, required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    stats: {
      totalAccountsTried: { type: Number, default: 0 },
      success: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      images: { type: Number, default: 0 },
      videos: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CronRun', CronRunSchema);
