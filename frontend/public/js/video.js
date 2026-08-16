renderNav();

const params = new URLSearchParams(window.location.search);
const videoId = params.get('id');
const user = getUser();

if (!videoId) {
  document.querySelector('.container').innerHTML = '<div class="empty">No video specified.</div>';
  throw new Error('missing id');
}

async function loadVideo() {
  try {
    const data = await api(`/videos/${videoId}`);
    const v = data.video;

    document.title = `${v.title} — StreamHive`;
    document.getElementById('v-title').textContent = v.title;
    document.getElementById('v-desc').textContent = v.description || '';
    document.getElementById('player').src = `/api/videos/${v.id}/stream`;

    document.getElementById('v-tags').innerHTML = `
      <span class="tag age">${v.age_rating}</span>
      ${v.genre ? `<span class="tag">${v.genre}</span>` : ''}
      <span class="tag">By ${v.creator_name}</span>
      ${v.publisher ? `<span class="tag">Publisher: ${v.publisher}</span>` : ''}
      <span class="tag">${v.view_count} views</span>
    `;

    document.getElementById('rate-stat').textContent =
      `${Number(v.avg_rating).toFixed(1)} avg · ${v.rating_count} rating${v.rating_count == 1 ? '' : 's'}`;

    const starContainer = document.getElementById('star-row');
    const current = data.my_rating || 0;

    async function handlePick(stars) {
      if (!user || user.role !== 'consumer') {
        alert('Log in as a consumer account to rate videos.');
        return;
      }
      try {
        await api(`/videos/${videoId}/rate`, { method: 'POST', body: { stars } });
        starRow(starContainer, stars, handlePick);
        loadVideo();
      } catch (err) {
        alert(err.message);
      }
    }

    starRow(starContainer, current, handlePick);

    renderCommentForm();
    loadComments();
  } catch (err) {
    document.getElementById('v-title').textContent = 'Video not found';
  }
}

function renderCommentForm() {
  const wrap = document.getElementById('comment-form-wrap');
  if (!user) {
    wrap.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">
      <a href="login.html" style="color:var(--amber);">Log in</a> as a consumer to comment.</p>`;
    return;
  }
  if (user.role !== 'consumer') {
    wrap.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">Only consumer accounts can comment.</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="field">
      <textarea id="comment-input" placeholder="Share your thoughts…"></textarea>
    </div>
    <button class="pill primary" id="comment-submit">Post comment</button>
  `;
  document.getElementById('comment-submit').addEventListener('click', async () => {
    const body = document.getElementById('comment-input').value.trim();
    if (!body) return;
    try {
      await api(`/videos/${videoId}/comments`, { method: 'POST', body: { body } });
      document.getElementById('comment-input').value = '';
      loadComments();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadComments() {
  const list = document.getElementById('comments-list');
  try {
    const data = await api(`/videos/${videoId}/comments`);
    if (!data.comments.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;">No comments yet.</p>';
      return;
    }
    list.innerHTML = data.comments.map(c => `
      <div class="comment">
        <div class="who">
          ${c.author}
          <span class="sentiment ${c.sentiment_label}">${c.sentiment_label}</span>
        </div>
        <div class="body">${escapeHtml(c.body)}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:var(--text-muted);">${err.message}</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadVideo();
