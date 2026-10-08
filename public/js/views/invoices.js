import { api, isAdmin } from '../api.js';
import { esc, money, qs, openModal, confirmDlg, toast, tableHTML, printHTML, receiptHTML, statusBadge, dateTimeFmt, todayISO, monthStartISO } from '../ui.js';

export function renderInvoices(root) {
  const canManage = isAdmin();
  let rows = [];
  let settings = {};
  let q = '';
  let status = '';
  let from = monthStartISO();
  let to = todayISO();

  root.innerHTML = `
    <div class="toolbar">
      <input class="input" id="v-from" type="date" value="${from}">
      <input class="input" id="v-to" type="date" value="${to}">
      <select class="select" id="v-status">
        <option value="">كل الحالات</option>
        <option value="completed">مكتملة</option>
        <option value="cancelled">ملغاة</option>
        <option value="refunded">مسترجعة</option>
      </select>
      <input class="input grow" id="v-search" type="search" placeholder="🔍 رقم الفاتورة أو اسم صنف...">
    </div>
    <div class="stats" id="v-stats"></div>
    <div class="card"><div class="card-body tight" id="box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function load() {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const [list, st] = await Promise.all([api('/sales?' + params.toString()), api('/settings')]);
      rows = list;
      settings = st;
      const active = rows.filter(r => r.status === 'completed');
      const sum = active.reduce((s, r) => s + r.total, 0);
      qs('#v-stats').innerHTML = `
        <div class="stat blue"><div class="label">عدد الفواتير</div><div class="value num">${rows.length}</div></div>
        <div class="stat green"><div class="label">إجمالي المبيعات (مكتملة)</div><div class="value num">${money(sum)}</div></div>
        <div class="stat amber"><div class="label">ملغاة / مسترجعة</div><div class="value num">${rows.filter(r => r.status !== 'completed').length}</div></div>`;
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderTable() {
    const cols = [
      { k: 'invoice_no', label: 'رقم الفاتورة', raw: true, fmt: r => `<b>${esc(r.invoice_no)}</b>` },
      { k: 'created_at', label: 'التاريخ والوقت', fmt: r => dateTimeFmt(r.created_at) },
      { k: 'items_count', label: 'الأصناف', cls: 'num' },
      { k: 'total', label: 'الإجمالي', cls: 'num', fmt: r => money(r.total) },
      { k: 'payment_label', label: 'الدفع', raw: true, fmt: r => `<span class="badge badge-teal">${esc(r.payment_label)}</span>` },
      { k: 'status', label: 'الحالة', raw: true, fmt: r => statusBadge(r.status) },
      { k: 'username', label: 'الكاشير', fmt: r => r.username || '—' },
      {
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-view="${r.id}" type="button">👁 عرض</button>
          <button class="btn btn-sm" data-print="${r.id}" type="button">🖨</button>
          ${canManage && r.status === 'completed' ? `
            <button class="btn btn-sm btn-ghost" data-cancel="${r.id}" type="button" style="color:var(--danger)">إلغاء</button>
            <button class="btn btn-sm btn-ghost" data-refund="${r.id}" type="button" style="color:var(--accent)">استرجاع</button>` : ''}`,
      },
    ];
    qs('#box').innerHTML = tableHTML(cols, rows);
    qs('#box').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewInvoice(Number(b.dataset.view)));
    qs('#box').querySelectorAll('[data-print]').forEach(b => b.onclick = async () => {
      try {
        const sale = await api(`/sales/${b.dataset.print}`);
        printHTML(receiptHTML(sale, settings));
      } catch (e) { toast(e.message, 'error'); }
    });
    if (canManage) {
      qs('#box').querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => changeStatus(Number(b.dataset.cancel), 'cancel'));
      qs('#box').querySelectorAll('[data-refund]').forEach(b => b.onclick = () => changeStatus(Number(b.dataset.refund), 'refund'));
    }
  }

  async function changeStatus(id, action) {
    const sale = rows.find(r => r.id === id);
    const msg = action === 'cancel'
      ? `إلغاء الفاتورة ${sale.invoice_no}؟ سيتم إرجاع كميات المكونات للمخزون.`
      : `استرجاع الفاتورة ${sale.invoice_no}؟ سيتم إرجاع كميات المكونات للمخزون.`;
    if (!await confirmDlg(msg, { okText: action === 'cancel' ? 'إلغاء الفاتورة' : 'استرجاع الفاتورة' })) return;
    try {
      await api(`/sales/${id}/${action}`, { method: 'POST' });
      toast(action === 'cancel' ? 'تم إلغاء الفاتورة' : 'تم استرجاع الفاتورة', 'success');
      await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function viewInvoice(id) {
    try {
      const sale = await api(`/sales/${id}`);
      const html = receiptHTML(sale, settings);
      const m = openModal({
        title: `الفاتورة ${sale.invoice_no}`,
        wide: true,
        body: `
          <div style="max-width:400px;margin:0 auto">${html}</div>
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="v-print">🖨 طباعة</button>
            ${canManage && sale.status === 'completed' ? `
              <button class="btn" id="v-cancel" style="color:var(--danger)">إلغاء الفاتورة</button>
              <button class="btn" id="v-refund" style="color:var(--accent)">استرجاع الفاتورة</button>` : ''}
          </div>`,
        footer: `<button class="btn" id="v-close">إغلاق</button>`,
      });
      m.foot.querySelector('#v-print').onclick = () => printHTML(html);
      m.foot.querySelector('#v-close').onclick = () => m.close();
      const cBtn = m.body.querySelector('#v-cancel');
      const rBtn = m.body.querySelector('#v-refund');
      if (cBtn) cBtn.onclick = async () => { m.close(); await changeStatus(id, 'cancel'); };
      if (rBtn) rBtn.onclick = async () => { m.close(); await changeStatus(id, 'refund'); };
    } catch (e) { toast(e.message, 'error'); }
  }

  qs('#v-from').onchange = e => { from = e.target.value; load(); };
  qs('#v-to').onchange = e => { to = e.target.value; load(); };
  qs('#v-status').onchange = e => { status = e.target.value; load(); };
  qs('#v-search').addEventListener('input', e => {
    q = e.target.value;
    clearTimeout(root._t);
    root._t = setTimeout(load, 250);
  });

  load();
}
