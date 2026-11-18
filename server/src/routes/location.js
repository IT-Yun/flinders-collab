const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  updateLocationValidation,
  eventIdParam,
} = require('../utils/validators');

// All location routes require authentication
router.use(authenticate);

const locationMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many location updates. Slow down and try again.' },
});

// POST /events/:eventId/location/start - Start sharing location
router.post(
  '/events/:eventId/location/start',
  locationMutationLimiter,
  eventIdParam,
  validate,
  locationController.startSharing
);

// POST /events/:eventId/location/update - Update current location
router.post(
  '/events/:eventId/location/update',
  locationMutationLimiter,
  eventIdParam,
  updateLocationValidation,
  validate,
  locationController.updateLocation
);

// POST /events/:eventId/location/stop - Stop sharing location
router.post(
  '/events/:eventId/location/stop',
  locationMutationLimiter,
  eventIdParam,
  validate,
  locationController.stopSharing
);

// GET /events/:eventId/location-status - Get all location sessions
router.get(
  '/events/:eventId/location-status',
  eventIdParam,
  validate,
  locationController.getLocationStatus
);

module.exports = router;
