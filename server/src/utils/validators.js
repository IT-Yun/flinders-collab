const { body, param, query } = require('express-validator');

// Flinders University email domain
const ALLOWED_DOMAINS = ['flinders.edu.au'];

/**
 * Validate that an email belongs to an allowed university domain.
 */
function isUniversityEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const domain = email.split('@')[1];
  return ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// Auth validators
const signupValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .custom((value, { req }) => {
      // Only enforce Flinders domain for non-general accounts
      if (req.body.account_type !== 'general' && !isUniversityEmail(value)) {
        throw new Error('Must use a Flinders University email address');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required'),
  body('student_id')
    .optional()
    .trim(),
  body('major')
    .optional()
    .trim(),
  body('university')
    .optional()
    .trim(),
  body('account_type')
    .optional()
    .isIn(['flinders', 'general'])
    .withMessage('Invalid account type'),
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const passwordResetValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
];

// Room validators
const createRoomValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Room name is required')
    .isLength({ max: 100 })
    .withMessage('Room name must be under 100 characters'),
  body('course_name')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }),
];

const joinRoomValidation = [
  body('invite_code')
    .trim()
    .notEmpty()
    .withMessage('Invite code is required')
    .isLength({ min: 6, max: 12 })
    .withMessage('Invite code must be 6-12 characters')
    .matches(/^[A-Z2-9]+$/i)
    .withMessage('Invite code format is invalid'),
];

// Event validators
const createEventValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Event title is required')
    .isLength({ max: 200 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category must be under 50 characters'),
  body('location_name')
    .optional()
    .trim(),
  body('start_time')
    .isISO8601()
    .withMessage('Valid start time is required'),
  body('end_time')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('Valid end time is required')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.start_time)) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),
  body('enable_location_sharing')
    .optional()
    .isBoolean()
    .withMessage('enable_location_sharing must be true or false')
    .toBoolean(),
  body('location_name')
    .custom((value, { req }) => {
      if (req.body.enable_location_sharing === true && !String(value || '').trim()) {
        throw new Error('Location name is required when location sharing is enabled');
      }
      return true;
    }),
];

const updateEventValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category must be under 50 characters'),
  body('location_name')
    .optional()
    .trim(),
  body('start_time')
    .optional()
    .isISO8601(),
  body('end_time')
    .optional()
    .isISO8601()
    .custom((value, { req }) => {
      // If both are provided, end must be after start
      const startTime = req.body.start_time;
      if (startTime && new Date(value) <= new Date(startTime)) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),
  body('enable_location_sharing')
    .optional()
    .isBoolean()
    .withMessage('enable_location_sharing must be true or false')
    .toBoolean(),
];

// Message validators
const sendMessageValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 5000 })
    .withMessage('Message must be under 5000 characters'),
  body('message_type')
    .optional()
    .isIn(['text', 'system', 'file'])
    .withMessage('Invalid message type'),
];

// Location validators
const updateLocationValidation = [
  body('latitude')
    .exists()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('longitude')
    .exists()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('status')
    .optional()
    .isIn(['on_the_way', 'arrived', 'late'])
    .withMessage('Invalid status'),
];

// Task validators
const createTaskValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Task title is required')
    .isLength({ max: 200 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }),
  body('assigned_to')
    .optional()
    .isUUID(),
  body('due_date')
    .optional()
    .isISO8601(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high']),
];

const updateTaskValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed']),
  body('assigned_to')
    .optional()
    .isUUID(),
  body('due_date')
    .optional()
    .isISO8601(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high']),
];

// Param validators
const roomIdParam = [
  param('roomId').isUUID().withMessage('Invalid room ID'),
];

const eventIdParam = [
  param('eventId').isUUID().withMessage('Invalid event ID'),
];

const fileIdParam = [
  param('fileId').isUUID().withMessage('Invalid file ID'),
];

const taskIdParam = [
  param('taskId').isUUID().withMessage('Invalid task ID'),
];

const eventsQueryValidation = [
  query('from')
    .optional()
    .isISO8601()
    .withMessage('from must be a valid ISO 8601 date'),
  query('to')
    .optional()
    .isISO8601()
    .withMessage('to must be a valid ISO 8601 date'),
];

module.exports = {
  isUniversityEmail,
  ALLOWED_DOMAINS,
  signupValidation,
  loginValidation,
  passwordResetValidation,
  createRoomValidation,
  joinRoomValidation,
  createEventValidation,
  updateEventValidation,
  sendMessageValidation,
  updateLocationValidation,
  createTaskValidation,
  updateTaskValidation,
  roomIdParam,
  eventIdParam,
  fileIdParam,
  taskIdParam,
  eventsQueryValidation,
};
