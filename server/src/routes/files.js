const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fileController = require('../controllers/fileController');
const { authenticate, requireRoomMember } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { roomIdParam, fileIdParam } = require('../utils/validators');
const config = require('../config');

// Configure multer for memory storage (files go to Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSize,
  },
  fileFilter: (_req, file, cb) => {
    if (!config.upload.allowedTypes.includes(file.mimetype)) {
      cb(new Error('File type not allowed'));
      return;
    }
    cb(null, true);
  },
});

// All file routes require authentication
router.use(authenticate);

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload attempts. Please wait a few minutes and try again.' },
});

// POST /rooms/:roomId/files - Upload a file
router.post(
  '/rooms/:roomId/files',
  uploadLimiter,
  roomIdParam,
  validate,
  requireRoomMember,
  upload.single('file'),
  fileController.uploadFile
);

// GET /rooms/:roomId/files - List files in a room
router.get(
  '/rooms/:roomId/files',
  roomIdParam,
  validate,
  requireRoomMember,
  fileController.getFiles
);

// GET /files/:fileId/download - Get a signed download URL
router.get(
  '/files/:fileId/download',
  fileIdParam,
  validate,
  fileController.getFileDownloadUrl
);

// PATCH /files/:fileId - Update file metadata
router.patch(
  '/files/:fileId',
  fileIdParam,
  validate,
  fileController.updateFile
);

// DELETE /files/:fileId - Delete a file
router.delete(
  '/files/:fileId',
  fileIdParam,
  validate,
  fileController.deleteFile
);

module.exports = router;
