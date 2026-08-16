const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/comment.controller');
const { authenticate, requireRole } = require('../middleware/auth');

// Mounted at /api/videos/:id/comments
router.get('/', ctrl.listComments);
router.post('/', authenticate, requireRole('consumer'), ctrl.postComment);

module.exports = router;
