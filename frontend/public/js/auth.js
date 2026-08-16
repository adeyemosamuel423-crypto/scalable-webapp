renderNav();

const msgBox = document.getElementById('msg');

function showMsg(text, type = 'error') {
  msgBox.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      setSession(data.token, data.user);
      window.location.href = data.user.role === 'creator' ? 'upload.html' : 'index.html';
    } catch (err) {
      showMsg(err.message);
    }
  });
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const display_name = document.getElementById('display_name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
      const data = await api('/auth/signup', { method: 'POST', body: { display_name, email, password } });
      setSession(data.token, data.user);
      window.location.href = 'index.html';
    } catch (err) {
      showMsg(err.message);
    }
  });
}
