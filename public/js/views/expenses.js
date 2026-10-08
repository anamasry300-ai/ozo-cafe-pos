import { api } from '../api.js';
import { esc, money, num, qs, openModal, confirmDlg, toast, tableHTML, todayISO, monthStartISO } from '../ui.js';

export function renderExpenses(root) {
  let rows = [];
  let total = 0;
  let types = [];
  let q = '';
  let from = monthStartISO();
  let to = todayISO();

  root.innerHTML = `
    <div class="toolbar">
      <input class="input" id="e-from" type="date" value="${from}">
      <input class="input" id="e-to" type="date" value="${to}">
      <input class="input grow" id="e-search" type="search" placeholder="🔍 بحث في المصروفات...">
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="btn-new" type="button">+ مصروف جديد</button>
    </div>
    <div class="stats">
      <div class="stat red"><div class="label">إجمالي المصروفات (الفترة)</div><div class="value num" id="e-total">0.00 ج.م</div></div>
      <div class="stat blue"><div class="label">عدد المصروفات</div><div class="value num" id="e-count">0</div></div>
    </div>
    <div class="card"><div class="card-body tight" id="box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function load() {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q) params.set('q', q);
      const [data, t] = await Promise.all([
        api('/expenses?' + params.toString()),
        api('/expense-types'),
      ]);
      rows = data.rows;
      total = data.total;
      types = t;
      qs('#e-total').textContent = money(total);
      qs('#e-count').textContent = rows.length;
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderTable() {
    const cols = [
      { k: 'type', label: 'نوع المصروف', raw: true, fmt: r => `<span class="badge badge-red">${esc(r.type)}</span>` },
      { k: 'date', label: 'التاريخ' },
      { k: 'amount', label: 'المبلغ', cls: 'num', fmt: r => money(r.amount) },
      { k: 'notes', label: 'الملاحظات', fmt: r => r.notes || '—' },
      { k: 'username', label: 'المُسجّل', fmt: r => r.username || '—' },
      {
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-edit="${r.id}" type="button">✏️</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>`,
      },
    ];
    qs('#box').innerHTML = tableHTML(cols, rows, { type: 'الإجمالي', amount: money(total) });
    qs('#box').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openExpense(Number(b.dataset.edit)));
    qs('#box').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const e = rows.find(x => x.id === Number(b.dataset.del));
      if (!await confirmDlg(`حذف مصروف "${e.type}" بمبلغ ${money(e.amount)}؟`)) return;
      try { await api(`/expenses/${e.id}`, { method: 'DELETE' }); toast('تم الحذف', 'success'); await load(); }
      catch (err) { toast(err.message, 'error'); }
    });
  }

  function openExpense(id) {
    const ex = id ? rows.find(r => r.id === id) : null;
    const m = openModal({
      title: ex ? 'تعديل مصروف' : 'مصروف جديد',
      body: `
        <div class="field"><label>نوع المصروف *</label>
          <input class="input" id="x-type" list="type-list" value="${esc(ex?.type || '')}" placeholder="اختر أو اكتب نوعًا جديدًا">
          <datalist id="type-list">${types.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
        <div class="form-grid">
          <div class="field"><label>المبلغ (ج.م) *</label><input class="input" id="x-amount" type="number" min="0" step="0.5" value="${ex?.amount ?? ''}"></div>
          <div class="field"><label>التاريخ *</label><input class="input" id="x-date" type="date" value="${ex?.date || todayISO()}"></div>
        </div>
        <div class="field"><label>ملاحظات</label><textarea class="textarea" id="x-notes">${esc(ex?.notes || '')}</textarea></div>`,
      footer: `<button class="btn btn-primary" id="x-save" type="button">💾 حفظ</button>
               <button class="btn" id="x-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#x-cancel').onclick = () => m.close();
    m.foot.querySelector('#x-save').onclick = async () => {
      const body = {
        type: m.body.querySelector('#x-type').value.trim(),
        amount: Number(m.body.querySelector('#x-amount').value),
        date: m.body.querySelector('#x-date').value,
        notes: m.body.querySelector('#x-notes').value.trim(),
      };
      if (!body.type) return toast('حدد نوع المصروف', 'error');
      if (!body.amount || body.amount <= 0) return toast('أدخل مبلغًا صحيحًا', 'error');
      if (!body.date) return toast('حدد التاريخ', 'error');
      try {
        if (id) await api(`/expenses/${id}`, { method: 'PUT', body });
        else await api('/expenses', { method: 'POST', body });
        toast('تم الحفظ', 'success');
        m.close();
        await load();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  qs('#btn-new').onclick = () => openExpense(null);
  qs('#e-from').onchange = e => { from = e.target.value; load(); };
  qs('#e-to').onchange = e => { to = e.target.value; load(); };
  qs('#e-search').addEventListener('input', e => {
    q = e.target.value;
    clearTimeout(root._t);
    root._t = setTimeout(load, 250);
  });

  load();
}
