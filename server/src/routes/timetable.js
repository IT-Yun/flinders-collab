const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Search topics
router.get('/topics/search', timetableController.searchTopics);

// Get my timetable
router.get('/my', timetableController.getMyTimetable);

// Add topic to timetable (auto-create/join room)
router.post('/add', timetableController.addToTimetable);

// Remove a single timetable entry
router.delete('/:entryId', timetableController.removeFromTimetable);

// Remove entire topic from timetable + leave room
router.delete('/topic/:topicId', timetableController.removeTopic);

// Get member count for a topic
router.get('/topic/:topicId/members', timetableController.getTopicMembers);

// Get popular times for a topic (from other students)
router.get('/topic/:topicId/popular-times', timetableController.getPopularTimes);

// Resolve a topic to its canonical chat room and ensure membership
router.post('/topic/:topicId/open-chat', timetableController.openTopicChat);

// Ensure membership in a topic room + get members
router.post('/room/:roomId/ensure-member', timetableController.ensureTopicRoomMember);

module.exports = router;
