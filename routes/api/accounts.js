const express = require('express');
const router = express.Router();
const accountsController = require('../../controllers/accountsController');

router.get('/', accountsController.list);
router.get('/:id', accountsController.getById);
router.post('/', accountsController.create);
router.put('/:id', accountsController.update);
router.delete('/:id', accountsController.remove);

module.exports = router;
