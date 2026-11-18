const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate, requireRoomMember } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { roomIdParam } = require('../utils/validators');

// All message routes require authentication
router.use(authenticate);

// GET /rooms/:roomId/messages - Get messages with pagination
router.get(
  '/rooms/:roomId/messages',
  roomIdParam,
  validate,
  requireRoomMember,
  messageController.getMessages
);

module.exports = router;
