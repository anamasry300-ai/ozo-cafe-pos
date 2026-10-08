import { api, getToken } from '../api.js';
import { esc, qs, confirmDlg, toast, num, downloadBlob } from '../ui.js';

export function renderSettings(root) {
  let settings = {};
  let backups = [];
  let menuUrls = [];

  root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>🏪 بيانات المنشأة (تظهر على الفاتورة)</h3></div>
        <div class="card-body">
          <form id="store-form">
            <div class="field"><label>اسم المنشأة (العلامة التجارية)</label><input class="input" name="store_name" value="${esc(settings.store_name || '')}"></div>
            <div class="field"><label>الهاتف</label><input class="input" name="store_phone" value="${esc(settings.store_phone || '')}"></div>
            <div class="field"><label>العنوان</label><input class="input" name="store_address" value="${esc(settings.store_address || '')}"></div>
            <div class="field"><label>عبارة أسفل الفاتورة</label><input class="input" name="invoice_footer" value="${esc(settings.invoice_footer || '')}"></div>
            <button class="btn btn-primary" type="submit">💾 حفظ البيانات</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>💾 النسخ الاحتياطي</h3>
          <div style="flex:1"></div>
          <button class="btn btn-primary btn-sm" id="btn-backup" type="button">إنشاء نسخة الآن</button>
        </div>
        <div class="card-body">
          <div id="backup-list"><div class="empty">جارٍ التحميل...</div></div>
          <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn" href="/api/export?token=${getToken()}" download>⬇ تصدير كل البيانات (JSON)</a>
          </div>
          <div class="hint" style="margin-top:8px">
            النسخة الاحتياطية هي ملف قاعدة البيانات كامل. احتفظ بها في مكان آمن.
            يمكنك أيضاً نسخ ملف <b>data/cafe.db</b> يدويًا والصقه في مجلد <b>backups</b>.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>📱 المنيو والـ QR</h3></div>
        <div class="card-body">
          <div class="field">
            <label>رابط المنيو (الذي يفتحه العميل)</label>
            <input class="input" id="menu-url" placeholder="http://.../menu" dir="ltr" style="text-align:left">
          </div>
          <div class="hint">إن لم يكن لديك نطاق خارجي، استخدم الرابط الذي يبدأ بـ IP الشبكة ليعمل على موبايل العملاء داخل نفس الـ Wi-Fi.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
            <button class="btn btn-sm" id="btn-preview-menu" type="button">👁 معاينة المنيو</button>
            <button class="btn btn-sm" id="btn-dl-qr" type="button">⬇ تحميل الـ QR</button>
            <img id="menu-qr" alt="QR" style="width:132px;height:132px;border:1px solid var(--border);border-radius:10px;background:#fff">
          </div>
          <div class="hint" style="margin-top:10px">اطبع هذا الكود وضعه على الطاولات — العميل يصوره بالموبايل ويفتح المنيو مباشرة.</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>ℹ️ عن النظام</h3></div>
      <div class="card-body">
        <div class="kv"><span>العملة</span><b>الجنيه المصري (EGP)</b></div>
        <div class="kv"><span>قاعدة البيانات</span><b>SQLite — data/cafe.db</b></div>
        <div class="kv"><span>مجلد النسخ الاحتياطية</span><b>backups/</b></div>
        <div class="kv"><span>اللغة</span><b>العربية (RTL)</b></div>
      </div>
    </div>`;

  async function load() {
    try {
      settings = await api('/settings');
      Object.entries(settings).forEach(([k, v]) => {
        const input = root.querySelector(`[name="${k}"]`);
        if (input) input.value = v;
      });
      backups = await api('/backup/list');
      renderBackups();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderBackups() {
    const box = qs('#backup-list');
    if (!backups.length) {
      box.innerHTML = '<div class="empty" style="padding:18px"><div class="big">🗃</div>لا توجد نسخ احتياطية بعد</div>';
      return;
    }
    box.innerHTML = backups.map(b => `
      <div class="list-row">
        <div class="grow">
          <div style="font-weight:700;font-size:13.5px">${esc(b.name)}</div>
          <div class="muted" style="font-size:12px">${esc(b.created_at)} · ${num(b.size / 1024, 0)} كيلوبايت</div>
        </div>
        <a class="btn btn-sm" href="/api/backup/download/${encodeURIComponent(b.name)}?token=${getToken()}">⬇ تنزيل</a>
        <button class="btn btn-sm" data-restore="${esc(b.name)}" type="button">♻ استعادة</button>
        <button class="btn btn-sm btn-ghost" data-del="${esc(b.name)}" type="button" style="color:var(--danger)">🗑</button>
      </div>`).join('');
    box.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
      if (!await confirmDlg(`استعادة النسخة "${b.dataset.restore}"؟ سيتم استبدال كل البيانات الحالية بهذه النسخة. أنصح بأخذ نسخة جديدة أولًا.`, { okText: 'استعادة' })) return;
      try {
        const res = await api('/backup/restore', { method: 'POST', body: { file: b.dataset.restore } });
        toast(res.message || 'تمت الاستعادة', 'success');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!await confirmDlg(`حذف النسخة "${b.dataset.del}"؟`)) return;
      try {
        const res = await api('/backup/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
        backups = res.list;
        renderBackups();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  root.querySelector('#store-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      settings = await api('/settings', { method: 'PUT', body: Object.fromEntries(f.entries()) });
      toast('تم حفظ بيانات المنشأة', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  qs('#btn-backup').onclick = async () => {
    const btn = qs('#btn-backup');
    btn.disabled = true;
    try {
      const res = await api('/backup/create', { method: 'POST' });
      backups = res.list;
      renderBackups();
      toast('تم إنشاء النسخة الاحتياطية بنجاح', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  async function loadMenuUrl() {
    try {
      const info = await api('/menu-url');
      menuUrls = info.urls || [];
      const input = qs('#menu-url');
      input.value = menuUrls[0] || `${location.origin}/menu`;
      updateQr();
    } catch (e) { /* غير حرج */ }
  }

  function menuUrl() {
    return (qs('#menu-url').value || `${location.origin}/menu`).trim() || `${location.origin}/menu`;
  }

  function updateQr() {
    const url = menuUrl();
    qs('#menu-qr').src = `/api/qr?data=${encodeURIComponent(url)}`;
    qs('#btn-preview-menu').onclick = () => window.open(url, '_blank');
  }

  root.querySelector('#menu-url').addEventListener('input', updateQr);
  qs('#btn-dl-qr').onclick = async () => {
    try {
      const r = await fetch(`/api/qr?data=${encodeURIComponent(menuUrl())}`);
      if (!r.ok) throw new Error();
      const text = await r.text();
      downloadBlob('menu-qr.svg', text, 'image/svg+xml;charset=utf-8');
    } catch (e) { toast('تعذّر إنشاء الـ QR', 'error'); }
  };

  load();
  loadMenuUrl();
}
