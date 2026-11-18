const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticate, requireRoomMember } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createEventValidation,
  updateEventValidation,
  eventsQueryValidation,
  roomIdParam,
  eventIdParam,
} = require('../utils/validators');

// All event routes require authentication
router.use(authenticate);

// GET /events/upcoming-count - Count upcoming events across my rooms
router.get('/events/upcoming-count', eventController.getUpcomingEventCount);
router.get('/events/upcoming', eventController.getUpcomingEvents);

// POST /rooms/:roomId/events - Create event in a room
router.post(
  '/rooms/:roomId/events',
  roomIdParam,
  createEventValidation,
  validate,
  requireRoomMember,
  eventController.createEvent
);

// GET /rooms/:roomId/events - List events in a room
router.get(
  '/rooms/:roomId/events',
  roomIdParam,
  eventsQueryValidation,
  validate,
  requireRoomMember,
  eventController.getEvents
);

// PATCH /events/:eventId - Update an event
router.patch(
  '/events/:eventId',
  eventIdParam,
  updateEventValidation,
  validate,
  eventController.updateEvent
);

// DELETE /events/:eventId - Delete an event
router.delete(
  '/events/:eventId',
  eventIdParam,
  validate,
  eventController.deleteEvent
);

module.exports = router;
