renderNav();

const grid = document.getElementById('video-grid');
const emptyState = document.getElementById('empty-state');
const resultCount = document.getElementById('result-count');
const searchInput = document.getElementById('search-input');
const genreSelect = document.getElementById('genre-select');
const searchBtn = document.getElementById('search-btn');

function cardHtml(v) {
  const rating = Number(v.avg_rating || 0).toFixed(1);
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
          <span>${v.creator_name}</span>
          <span class="rating">★ ${rating}</span>
        </div>
      </div>
    </a>
  `;
}

async function loadDashboard() {
  try {
    const data = await api('/videos/dashboard');
    renderGrid(data.videos, 'Latest uploads');
  } catch (err) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.textContent = `Could not load dashboard: ${err.message}`;
  }
}

async function runSearch() {
  const q = searchInput.value.trim();
  const genre = genreSelect.value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (genre) params.set('genre', genre);

  try {
    const data = await api(`/videos?${params.toString()}`);
    renderGrid(data.videos, q || genre ? 'Search results' : 'Latest uploads');
  } catch (err) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.textContent = `Search failed: ${err.message}`;
  }
}

function renderGrid(videos, label) {
  resultCount.textContent = `(${videos.length})`;
  document.querySelector('.section-title').firstChild.textContent = label + ' ';
  if (!videos.length) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  grid.innerHTML = videos.map(cardHtml).join('');
}

searchBtn.addEventListener('click', runSearch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
genreSelect.addEventListener('change', runSearch);

loadDashboard();
