const pool = require('../config/db');
const { analyzeSentiment } = require('../utils/sentiment');
const { cacheInvalidate } = require('../config/redis');

async function listComments(req, res) {
  const { id } = req.params; // video id
  try {
    const result = await pool.query(
      `SELECT c.*, u.display_name AS author
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.video_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );
    res.json({ comments: result.rows });
  } catch (err) {
    console.error('[listComments]', err);
    res.status(500).json({ error: 'Could not load comments.' });
  }
}

async function postComment(req, res) {
  const { id } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required.' });

  try {
    const { score, label } = analyzeSentiment(body);

    const result = await pool.query(
      `INSERT INTO comments (video_id, user_id, body, sentiment_score, sentiment_label)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [id, req.user.id, body.trim(), score, label]
    );

    await cacheInvalidate('videos:*');

    res.status(201).json({ comment: { ...result.rows[0], author: req.user.display_name } });
  } catch (err) {
    console.error('[postComment]', err);
    res.status(500).json({ error: 'Could not post comment.' });
  }
}

module.exports = { listComments, postComment };
