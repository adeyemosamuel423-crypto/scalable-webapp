const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

const TOKEN_TTL = '12h';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Public consumer sign-up. Creator accounts are intentionally NOT exposed
// here per the spec ("No public interface needs to be offered for
// enrolment of creator users") - creators are provisioned via
// POST /api/auth/register-creator, which itself requires an existing
// creator/admin token. A seed creator is created on first boot (see seed.js).
async function signupConsumer(req, res) {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    return res.status(400).json({ error: 'email, password and display_name are required.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'consumer')
       RETURNING id, email, display_name, role, created_at`,
      [email, hash, display_name]
    );

    const user = result.rows[0];
    res.status(201).json({ user, token: signToken(user) });
  } catch (err) {
    console.error('[signupConsumer]', err);
    res.status(500).json({ error: 'Could not create account.' });
  }
}

// Registers a new creator account. Locked behind an existing creator's
// token so there is no public creator sign-up surface, matching the brief.
async function registerCreator(req, res) {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    return res.status(400).json({ error: 'email, password and display_name are required.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'creator')
       RETURNING id, email, display_name, role, created_at`,
      [email, hash, display_name]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('[registerCreator]', err);
    res.status(500).json({ error: 'Could not create creator account.' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    const safeUser = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      created_at: user.created_at,
    };

    res.json({ user: safeUser, token: signToken(safeUser) });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed.' });
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { signupConsumer, registerCreator, login, me };
