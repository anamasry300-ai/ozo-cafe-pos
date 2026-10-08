import { api, setSession, isAdmin } from '../api.js';
import { qs, toast } from '../ui.js';

export function renderLogin(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">☕</div>
        <h1>نظام أوزو OZO</h1>
        <div class="sub">سجّل الدخول لبدء العمل</div>
        <form id="login-form">
          <div class="field">
            <label>اسم المستخدم</label>
            <input class="input" name="username" autocomplete="username" required autofocus>
          </div>
          <div class="field">
            <label>كلمة المرور</label>
            <input class="input" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">دخول</button>
        </form>
      </div>
    </div>`;

  qs('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { token, user } = await api('/login', {
        method: 'POST',
        body: { username: f.get('username'), password: f.get('password') },
      });
      setSession(token, user);
      toast(`مرحبًا ${user.full_name || user.username}`, 'success');
      location.hash = isAdmin() ? '#/dashboard' : '#/pos';
      window.dispatchEvent(new Event('hashchange'));
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}
