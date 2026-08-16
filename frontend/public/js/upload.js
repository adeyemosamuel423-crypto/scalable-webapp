const user = requireAuth('creator');
renderNav();

const form = document.getElementById('upload-form');
const msgBox = document.getElementById('msg');
const submitBtn = document.getElementById('submit-btn');
const myVideosGrid = document.getElementById('my-videos');

function showMsg(text, type = 'error') {
  msgBox.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('video');
  if (!fileInput.files.length) return showMsg('Please choose a video file.');

  const fd = new FormData();
  fd.append('title', document.getElementById('title').value.trim());
  fd.append('description', document.getElementById('description').value.trim());
  fd.append('publisher', document.getElementById('publisher').value.trim());
  fd.append('producer', document.getElementById('producer').value.trim());
  fd.append('genre', document.getElementById('genre').value);
  fd.append('age_rating', document.getElementById('age_rating').value);
  fd.append('video', fileInput.files[0]);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading… this can take a moment';
  try {
    await api('/videos', { method: 'POST', body: fd, isForm: true });
    showMsg('Video uploaded and processed successfully.', 'success');
    form.reset();
    loadMyVideos();
  } catch (err) {
    showMsg(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  }
});

function cardHtml(v) {
  return `
    <a class="card" href="video.html?id=${v.id}">
      <div class="thumb-wrap">
        <img src="/api/videos/${v.id}/thumbnail" alt="${v.title}" onerror="this.style.display='none'">
        <span class="badge">${v.age_rating}</span>
        <span class="duration">${formatDuration(v.duration_secs)}</span>
      </div>
      <div class="card-body">
        <p class="card-title">${v.title}</p>
        <div class="card-meta">
          <span>${v.view_count} views</span>
          <span>${timeAgo(v.created_at)}</span>
        </div>
      </div>
    </a>
  `;
}

async function loadMyVideos() {
  try {
    const data = await api('/videos/mine');
    myVideosGrid.innerHTML = data.videos.length
      ? data.videos.map(cardHtml).join('')
      : '<p style="color:var(--text-muted)">You haven\'t uploaded anything yet.</p>';
  } catch (err) {
    myVideosGrid.innerHTML = `<p style="color:var(--text-muted)">${err.message}</p>`;
  }
}

loadMyVideos();
