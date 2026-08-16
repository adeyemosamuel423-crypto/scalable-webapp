// Thin fetch wrapper for the StreamHive REST API. All frontend pages
// call the backend exclusively via /api/... which nginx reverse-proxies
// to the Node/Express service (see frontend/nginx.conf).

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('sh_token');
}

function getUser() {
  const raw = localStorage.getItem('sh_user');
  return raw ? JSON.parse(raw) : null;
}

function setSession(token, user) {
  localStorage.setItem('sh_token', token);
  localStorage.setItem('sh_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('sh_token');
  localStorage.removeItem('sh_user');
}

async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function renderNav() {
  const user = getUser();
  const el = document.getElementById('nav-actions');
  if (!el) return;

  if (!user) {
    el.innerHTML = `
      <a href="login.html" class="pill">Log in</a>
      <a href="signup.html" class="pill primary">Sign up</a>
    `;
    return;
  }

  const uploadLink = user.role === 'creator'
    ? `<a href="upload.html" class="pill">Upload</a>`
    : '';

  el.innerHTML = `
    <span class="nav-links" style="margin-right:4px;">${user.display_name} · ${user.role}</span>
    ${uploadLink}
    <button id="logout-btn" class="pill">Log out</button>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
}

function requireAuth(role) {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (role && user.role !== role) {
    alert(`This page is only available to ${role} accounts.`);
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

function starRow(container, current, onPick) {
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span');
    span.className = 'star' + (i <= current ? ' filled' : '');
    span.textContent = '★';
    span.dataset.value = i;
    span.addEventListener('click', () => onPick(i));
    container.appendChild(span);
  }
}

function formatDuration(secs) {
  if (!secs && secs !== 0) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
