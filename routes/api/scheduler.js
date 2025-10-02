const express = require('express');
const router = express.Router();
const { runOnceForAccount, runForAllAccounts } = require('../../services/scheduler');

// Trigger processing for one account (next pending post)
router.post('/trigger/account/:id', async (req, res, next) => {
  try {
    const result = await runOnceForAccount(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Trigger processing for all accounts (one post per account)
router.post('/trigger/all', async (req, res, next) => {
  try {
    const results = await runForAllAccounts();
    return res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
