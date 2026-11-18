const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body, param, query } = require('express-validator');
const boardController = require('../controllers/boardController');

router.use(authenticate);

// ── Posts ──

router.get(
  '/board/posts',
  [query('category').optional().trim()],
  validate,
  boardController.getPosts
);

router.get(
  '/board/state',
  boardController.getBoardState
);

router.get(
  '/board/notifications',
  boardController.getBoardNotifications
);

router.put(
  '/board/state',
  [
    body('last_seen_at').optional().isISO8601().withMessage('last_seen_at must be an ISO 8601 date'),
  ],
  validate,
  boardController.updateBoardState
);

router.post(
  '/board/posts',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 5000 }),
    body('category').optional().trim().isLength({ max: 50 }),
    body('is_anonymous').optional().isBoolean().withMessage('is_anonymous must be a boolean'),
    body('poll_options').optional().isArray({ min: 2, max: 6 }).withMessage('Poll must have 2-6 options'),
    body('poll_options.*').optional().isString().trim().notEmpty().withMessage('Poll options must be non-empty strings'),
    body('anonymous_poll').optional().isBoolean().withMessage('anonymous_poll must be a boolean'),
  ],
  validate,
  boardController.createPost
);

router.delete(
  '/board/posts/:postId',
  [param('postId').isUUID()],
  validate,
  boardController.deletePost
);

// ── Reactions ──

router.post(
  '/board/posts/:postId/react',
  [
    param('postId').isUUID(),
    body('emoji').isIn(['fire', 'heart', 'laugh', 'clap', 'think']).withMessage('Invalid emoji'),
  ],
  validate,
  boardController.toggleReaction
);

router.get(
  '/board/posts/:postId/reactions',
  [param('postId').isUUID()],
  validate,
  boardController.getReactions
);

// ── Poll Voting ──

router.post(
  '/board/posts/:postId/vote',
  [
    param('postId').isUUID(),
    body('optionIndex').isInt({ min: 0 }).withMessage('Option index must be a non-negative integer'),
  ],
  validate,
  boardController.votePoll
);

// ── Participation ──

router.post(
  '/board/posts/:postId/participate',
  [
    param('postId').isUUID(),
    body('status').isIn(['join', 'pass']).withMessage('Status must be join or pass'),
  ],
  validate,
  boardController.toggleParticipation
);

router.get(
  '/board/my-participations',
  boardController.getMyParticipations
);

// ── Comments (generic) ──

router.get(
  '/comments/:targetType/:targetId',
  [
    param('targetType').isIn(['board_post', 'event', 'file']),
    param('targetId').isUUID(),
  ],
  validate,
  boardController.getComments
);

router.post(
  '/comments/:targetType/:targetId',
  [
    param('targetType').isIn(['board_post', 'event', 'file']),
    param('targetId').isUUID(),
    body('content').trim().notEmpty().withMessage('Comment cannot be empty').isLength({ max: 2000 }),
  ],
  validate,
  boardController.createComment
);

router.delete(
  '/comments/:commentId',
  [param('commentId').isUUID()],
  validate,
  boardController.deleteComment
);

// ── Academic Info ──

router.get('/academic-info', boardController.getAcademicInfo);

router.put(
  '/academic-info',
  [
    body('year_level').isInt({ min: 1, max: 7 }).withMessage('Year must be 1-7'),
    body('semester').isInt({ min: 1, max: 3 }).withMessage('Semester must be 1-3'),
  ],
  validate,
  boardController.updateAcademicInfo
);

module.exports = router;
