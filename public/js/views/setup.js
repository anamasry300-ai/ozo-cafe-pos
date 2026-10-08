import { api, setSession } from '../api.js';
import { esc, qs, toast } from '../ui.js';

export function renderSetup(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">☕</div>
        <h1>إنشاء أول مستخدم</h1>
        <div class="sub">أنشئ حساب المدير (Admin) للبدء في استخدام النظام</div>
        <form id="setup-form">
          <div class="field">
            <label>اسم المستخدم</label>
            <input class="input" name="username" autocomplete="username" required placeholder="admin">
          </div>
          <div class="field">
            <label>الاسم الكامل (اختياري)</label>
            <input class="input" name="full_name" placeholder="اسم المدير">
          </div>
          <div class="field">
            <label>كلمة المرور</label>
            <input class="input" name="password" type="password" autocomplete="new-password" required minlength="4" placeholder="4 أحرف على الأقل">
          </div>
          <div class="field">
            <label>تأكيد كلمة المرور</label>
            <input class="input" name="confirm" type="password" autocomplete="new-password" required minlength="4">
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">إنشاء الحساب والدخول</button>
        </form>
      </div>
    </div>`;

  qs('#setup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const password = f.get('password');
    if (password !== f.get('confirm')) return toast('كلمتا المرور غير متطابقتين', 'error');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { token, user } = await api('/setup', {
        method: 'POST',
        body: {
          username: f.get('username'),
          password,
          full_name: f.get('full_name'),
        },
      });
      setSession(token, user);
      toast('تم إنشاء حساب المدير بنجاح', 'success');
      location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}
