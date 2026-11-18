const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { subscribe, unsubscribe, getVapidKey } = require('../controllers/pushController');

router.get('/vapid-key', getVapidKey);
router.post('/subscribe', authenticate, subscribe);
router.post('/unsubscribe', authenticate, unsubscribe);

module.exports = router;
