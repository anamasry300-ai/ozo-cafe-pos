let token = localStorage.getItem('pos_token') || '';
let user = null;
try { user = JSON.parse(localStorage.getItem('pos_user') || 'null'); } catch (_) { user = null; }

export function setSession(t, u) {
  token = t;
  user = u;
  localStorage.setItem('pos_token', t);
  localStorage.setItem('pos_user', JSON.stringify(u));
}

export function clearSession() {
  token = '';
  user = null;
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
}

export function getToken() { return token; }
export function getUser() { return user; }
export function isAdmin() { return user && user.role === 'admin'; }

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error('تعذر الاتصال بالخادم، تأكد من تشغيله');
  }
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) {
    clearSession();
    if (!location.hash.startsWith('#/login') && !location.hash.startsWith('#/setup')) {
      location.hash = '#/login';
    }
    throw new Error((data && data.error) || 'انتهت الجلسة، سجّل الدخول مرة أخرى');
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'حدث خطأ غير متوقع');
  }
  return data;
}
