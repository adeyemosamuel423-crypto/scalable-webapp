const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, requireRole } = require('../middleware/auth');

router.post('/signup', ctrl.signupConsumer);              // public consumer sign-up
router.post('/login', ctrl.login);                         // both roles
router.post('/register-creator', authenticate, requireRole('creator'), ctrl.registerCreator);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
