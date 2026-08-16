const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/video.controller');
const upload = require('../middleware/upload');
const { authenticate, optionalAuthenticate, requireRole } = require('../middleware/auth');

router.get('/dashboard', ctrl.dashboard);
router.get('/', ctrl.listVideos);
router.get('/mine', authenticate, requireRole('creator'), ctrl.myUploads);
router.get('/:id', optionalAuthenticate, ctrl.getVideo);
router.get('/:id/stream', ctrl.streamVideo);
router.get('/:id/thumbnail', ctrl.streamThumbnail);

router.post('/', authenticate, requireRole('creator'), upload.single('video'), ctrl.uploadVideo);
router.post('/:id/rate', authenticate, requireRole('consumer'), ctrl.rateVideo);

module.exports = router;
