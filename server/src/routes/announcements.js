const express = require('express');
const router = express.Router();
const { authenticate, requireRoomMember } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body, param } = require('express-validator');
const ctrl = require('../controllers/announcementController');

router.use(authenticate);

// Room-scoped
router.get('/rooms/:roomId/announcements', param('roomId').isUUID(), validate, requireRoomMember, ctrl.getAnnouncements);
router.post('/rooms/:roomId/announcements', param('roomId').isUUID(), body('content').trim().notEmpty().isLength({ max: 2000 }), validate, requireRoomMember, ctrl.createAnnouncement);
router.post('/rooms/:roomId/announcements/read-all', param('roomId').isUUID(), validate, requireRoomMember, ctrl.markAllRead);

// Non-room-scoped
router.delete('/announcements/:announcementId', param('announcementId').isUUID(), validate, ctrl.deleteAnnouncement);
router.post('/announcements/:announcementId/read', param('announcementId').isUUID(), validate, ctrl.markRead);
router.get('/announcements/unread-counts', ctrl.getUnreadCounts);

module.exports = router;
