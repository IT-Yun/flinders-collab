const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const roomController = require('../controllers/roomController');
const activityController = require('../controllers/activityController');
const { authenticate, requireRoomMember } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');
const {
  createRoomValidation,
  joinRoomValidation,
  roomIdParam,
} = require('../utils/validators');

// All room routes require authentication
router.use(authenticate);

const joinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join attempts. Please wait a few minutes before trying again.' },
});

// POST /rooms - Create a new room
router.post('/', createRoomValidation, validate, roomController.createRoom);

// GET /rooms - List my rooms
router.get('/', roomController.getRooms);

// GET /rooms/activity-summary - unread recent activity counts across my rooms
router.get('/activity-summary', activityController.getActivitySummary);

// POST /rooms/join - Primary join flow from the dashboard using only an invite code
router.post('/join', joinLimiter, joinRoomValidation, validate, roomController.joinRoomByCode);

// GET /rooms/:roomId - Get room details (requires membership)
router.get(
  '/:roomId',
  roomIdParam,
  validate,
  requireRoomMember,
  roomController.getRoom
);

// POST /rooms/:roomId/join - Legacy invite-code join route kept for compatibility
router.post(
  '/:roomId/join',
  joinLimiter,
  roomIdParam,
  joinRoomValidation,
  validate,
  roomController.joinRoom
);

// GET /rooms/:roomId/members - List room members (requires membership)
router.get(
  '/:roomId/members',
  roomIdParam,
  validate,
  requireRoomMember,
  roomController.getMembers
);

router.post(
  '/:roomId/visit',
  roomIdParam,
  validate,
  requireRoomMember,
  roomController.markVisited
);

router.get(
  '/:roomId/quick-links',
  roomIdParam,
  validate,
  requireRoomMember,
  roomController.getQuickLinks
);

router.post(
  '/:roomId/quick-links',
  [
    ...roomIdParam,
    body('tool').optional().trim().isLength({ max: 50 }),
    body('label').trim().notEmpty().isLength({ max: 120 }),
    body('url').trim().notEmpty().isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('A valid URL is required'),
  ],
  validate,
  requireRoomMember,
  roomController.createQuickLink
);

router.delete(
  '/:roomId/quick-links/:linkId',
  [
    ...roomIdParam,
    param('linkId').isUUID(),
  ],
  validate,
  requireRoomMember,
  roomController.deleteQuickLink
);

// PATCH /rooms/:roomId - Update room (owner only)
router.patch(
  '/:roomId',
  roomIdParam,
  validate,
  requireRoomMember,
  roomController.updateRoom
);

// POST /rooms/:roomId/leave - Leave a room (non-owners only)
router.post(
  '/:roomId/leave',
  roomIdParam,
  validate,
  roomController.leaveRoom
);

// GET /rooms/:roomId/activity - Get recent activity (requires membership)
router.get(
  '/:roomId/activity',
  roomIdParam,
  validate,
  requireRoomMember,
  activityController.getRoomActivity
);

// DELETE /rooms/:roomId - Delete a room (owner only)
router.delete(
  '/:roomId',
  roomIdParam,
  validate,
  roomController.deleteRoom
);

module.exports = router;
