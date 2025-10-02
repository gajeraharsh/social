const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, unique: true },
    ig_user_id: { type: String, trim: true },
    access_token: { type: String, trim: true },
    email: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', AccountSchema);
