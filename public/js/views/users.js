import { api, getUser } from '../api.js';
import { esc, qs, openModal, confirmDlg, toast, tableHTML, dateTimeFmt } from '../ui.js';

export function renderUsers(root) {
  let users = [];

  root.innerHTML = `
    <div class="toolbar">
      <div class="hint" style="flex:1">
        <b>المدير (Admin):</b> يدير كل شيء — المنتجات، المخزون، المشتريات، المصروفات، التقارير، الأرباح، المستخدمين والإعدادات.
        &nbsp;·&nbsp;
        <b>الكاشير (Cashier):</b> يبيع ويعرض المنتجات والفواتير فقط.
      </div>
      <button class="btn btn-primary" id="btn-new" type="button">+ مستخدم جديد</button>
    </div>
    <div class="card"><div class="card-body tight" id="box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function load() {
    try {
      users = await api('/users');
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderTable() {
    const cols = [
      { k: 'username', label: 'اسم المستخدم', raw: true, fmt: r => `<b>${esc(r.username)}</b>` },
      { k: 'full_name', label: 'الاسم الكامل', fmt: r => r.full_name || '—' },
      { k: 'role', label: 'الدور', raw: true, fmt: r => r.role === 'admin' ? '<span class="badge badge-teal">مدير</span>' : '<span class="badge badge-amber">كاشير</span>' },
      { k: 'active', label: 'الحالة', raw: true, fmt: r => r.active ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-gray">موقوف</span>' },
      { k: 'created_at', label: 'تاريخ الإنشاء', fmt: r => dateTimeFmt(r.created_at) },
      {
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-edit="${r.id}" type="button">✏️ تعديل</button>
          <button class="btn btn-sm" data-pass="${r.id}" type="button">🔑 كلمة المرور</button>
          ${r.id !== getUser().id ? `<button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>` : ''}`,
      },
    ];
    qs('#box').innerHTML = tableHTML(cols, users);
    qs('#box').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openUser(Number(b.dataset.edit)));
    qs('#box').querySelectorAll('[data-pass]').forEach(b => b.onclick = () => resetPassword(Number(b.dataset.pass)));
    qs('#box').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const u = users.find(x => x.id === Number(b.dataset.del));
      if (!await confirmDlg(`حذف المستخدم "${u.username}"؟`)) return;
      try { await api(`/users/${u.id}`, { method: 'DELETE' }); toast('تم الحذف', 'success'); await load(); }
      catch (e) { toast(e.message, 'error'); }
    });
  }

  function openUser(id) {
    const ex = id ? users.find(u => u.id === id) : null;
    const m = openModal({
      title: ex ? `تعديل المستخدم: ${ex.username}` : 'مستخدم جديد',
      body: `
        <div class="field"><label>اسم المستخدم *</label><input class="input" id="u-name" value="${esc(ex?.username || '')}"></div>
        <div class="field"><label>الاسم الكامل</label><input class="input" id="u-full" value="${esc(ex?.full_name || '')}"></div>
        <div class="form-grid">
          <div class="field"><label>الدور *</label>
            <select class="select" id="u-role">
              <option value="cashier" ${ex?.role === 'cashier' ? 'selected' : ''}>كاشير</option>
              <option value="admin" ${!ex || ex.role === 'admin' ? 'selected' : ''}>مدير</option>
            </select></div>
          <div class="field"><label>الحالة</label>
            <select class="select" id="u-active">
              <option value="1" ${!ex || ex.active ? 'selected' : ''}>نشط</option>
              <option value="0" ${ex && !ex.active ? 'selected' : ''}>موقوف</option>
            </select></div>
        </div>
        <div class="field"><label>${ex ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير) *' : 'كلمة المرور *'}</label>
          <input class="input" id="u-pass" type="password" autocomplete="new-password" ${ex ? '' : 'required'} minlength="4">
        </div>`,
      footer: `<button class="btn btn-primary" id="u-save" type="button">💾 حفظ</button>
               <button class="btn" id="u-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#u-cancel').onclick = () => m.close();
    m.foot.querySelector('#u-save').onclick = async () => {
      const body = {
        username: m.body.querySelector('#u-name').value.trim(),
        full_name: m.body.querySelector('#u-full').value.trim(),
        role: m.body.querySelector('#u-role').value,
        active: m.body.querySelector('#u-active').value === '1',
        password: m.body.querySelector('#u-pass').value || undefined,
      };
      if (!body.username) return toast('اكتب اسم المستخدم', 'error');
      try {
        if (id) await api(`/users/${id}`, { method: 'PUT', body });
        else await api('/users', { method: 'POST', body });
        toast('تم الحفظ', 'success');
        m.close();
        await load();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  function resetPassword(id) {
    const u = users.find(x => x.id === id);
    const m = openModal({
      title: `تغيير كلمة مرور: ${u.username}`,
      body: `
        <div class="field"><label>كلمة المرور الجديدة *</label>
          <input class="input" id="np-pass" type="password" minlength="4" autocomplete="new-password"></div>
        <div class="field"><label>تأكيد كلمة المرور *</label>
          <input class="input" id="np-confirm" type="password" minlength="4" autocomplete="new-password"></div>`,
      footer: `<button class="btn btn-primary" id="np-save" type="button">حفظ</button>
               <button class="btn" id="np-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#np-cancel').onclick = () => m.close();
    m.foot.querySelector('#np-save').onclick = async () => {
      const p = m.body.querySelector('#np-pass').value;
      if (p.length < 4) return toast('كلمة المرور قصيرة', 'error');
      if (p !== m.body.querySelector('#np-confirm').value) return toast('كلمتا المرور غير متطابقتين', 'error');
      try {
        await api(`/users/${id}`, { method: 'PUT', body: { password: p } });
        toast('تم تغيير كلمة المرور', 'success');
        m.close();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  qs('#btn-new').onclick = () => openUser(null);
  load();
}
