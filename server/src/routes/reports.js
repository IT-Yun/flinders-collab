const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body, param, query } = require('express-validator');
const { supabaseAdmin } = require('../services/supabase');

// All routes require authentication
router.use(authenticate);

async function requireAdmin(req, res, next) {
  try {
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();
    if (!profile?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

const reportCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports submitted. Please try again later.' },
});

// POST /api/reports - Create a report (any user)
router.post(
  '/reports',
  reportCreateLimiter,
  [
    body('room_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('room_id must be a valid UUID'),
    body('section').trim().notEmpty().isLength({ max: 50 }).withMessage('section is required'),
    body('subject').trim().notEmpty().isLength({ max: 200 }).withMessage('subject is required'),
    body('description').trim().notEmpty().isLength({ max: 2000 }).withMessage('description is required'),
  ],
  validate,
  reportController.createReport
);

// GET /api/reports - Get all reports (admin only)
router.get(
  '/reports',
  requireAdmin,
  [
    query('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']),
    query('section').optional().trim().isLength({ max: 50 }),
  ],
  validate,
  reportController.getReports
);

// PATCH /api/reports/:reportId - Update report status (admin only)
router.patch(
  '/reports/:reportId',
  requireAdmin,
  [
    param('reportId').isUUID(),
    body('status').trim().notEmpty().isIn(['open', 'in_progress', 'resolved', 'closed']),
  ],
  validate,
  reportController.updateReport
);

// GET /api/admin/users - Get all users (admin only)
router.get('/admin/users', requireAdmin, reportController.getUsers);

// PATCH /api/admin/users/:userId/admin - Toggle admin status (admin only)
router.patch(
  '/admin/users/:userId/admin',
  requireAdmin,
  [param('userId').isUUID()],
  validate,
  reportController.toggleAdmin
);

// DELETE /api/admin/users/:userId - Delete a user (admin only)
router.delete(
  '/admin/users/:userId',
  requireAdmin,
  [param('userId').isUUID()],
  validate,
  reportController.deleteUser
);

module.exports = router;
