export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function num(n, dec = 2) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function money(n) {
  return num(n) + ' ج.م';
}

export function intFmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

export function todayISO() {
  const d = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthStartISO() {
  return todayISO().slice(0, 8) + '01';
}

export function dateTimeFmt(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').slice(0, 16);
}

export function toast(msg, type = 'info', ms = 2800) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

export function openModal({ title, body = '', footer = '', wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-close" type="button" aria-label="إغلاق">&times;</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${footer}</div>
    </div>`;
  root.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-close').addEventListener('click', close);
  return {
    el: overlay,
    body: overlay.querySelector('.modal-body'),
    foot: overlay.querySelector('.modal-foot'),
    close,
  };
}

export function confirmDlg(message, { danger = true, okText = 'تأكيد' } = {}) {
  return new Promise(resolve => {
    const m = openModal({
      title: 'تأكيد',
      body: `<p style="font-size:15px;line-height:1.8">${esc(message)}</p>`,
      footer: `
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>
        <button class="btn" data-cancel>تراجع</button>`,
      onClose: () => resolve(false),
    });
    m.foot.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(true); });
    m.foot.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  });
}

export function tableHTML(columns, rows, totals = null) {
  const head = columns.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('');
  const body = rows.length
    ? rows.map(r => '<tr>' + columns.map(c => {
        const val = c.fmt ? c.fmt(r) : r[c.k];
        return `<td class="${c.cls || ''}">${c.raw ? val : esc(val ?? '')}</td>`;
      }).join('') + '</tr>').join('')
    : `<tr><td colspan="${columns.length}"><div class="empty">لا توجد بيانات لعرضها</div></td></tr>`;
  let foot = '';
  if (totals) {
    foot = '<tfoot><tr>' + columns.map(c => {
      const val = totals[c.k] !== undefined ? totals[c.k] : '';
      return `<td class="${c.cls || ''}">${esc(val ?? '')}</td>`;
    }).join('') + '</tr></tfoot>';
  }
  return `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

export function statusBadge(status) {
  if (status === 'completed') return '<span class="badge badge-green">مكتملة</span>';
  if (status === 'cancelled') return '<span class="badge badge-red">ملغاة</span>';
  if (status === 'refunded') return '<span class="badge badge-amber">مسترجعة</span>';
  return `<span class="badge badge-gray">${esc(status)}</span>`;
}

export function paymentLabel(method) {
  return { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' }[method] || method;
}

export function receiptHTML(sale, settings = {}) {
  const items = sale.items || [];
  const rows = items.map(i => `
    <tr>
      <td>${esc(i.name)}${i.note ? `<div class="muted" style="font-size:11px">${esc(i.note)}</div>` : ''}</td>
      <td class="num">${num(i.quantity, i.quantity % 1 ? 2 : 0)}</td>
      <td class="num">${num(i.price)}</td>
      <td class="num">${num(i.line_total)}</td>
    </tr>`).join('');
  return `
  <div class="receipt">
    <h2>${esc(settings.store_name || 'أوزو OZO')}</h2>
    ${settings.store_phone ? `<div class="r-sub">هاتف: ${esc(settings.store_phone)}</div>` : ''}
    ${settings.store_address ? `<div class="r-sub">${esc(settings.store_address)}</div>` : ''}
    <div class="r-meta">
      <span>فاتورة: <b>${esc(sale.invoice_no)}</b></span>
      <span>${esc(dateTimeFmt(sale.created_at))}</span>
    </div>
    <div class="r-meta" style="border-top:none;margin-top:-8px">
      <span>الكاشير: ${esc(sale.username || sale.full_name || '')}</span>
      ${sale.status && sale.status !== 'completed' ? `<span><b>${sale.status === 'cancelled' ? 'ملغاة' : 'مسترجعة'}</b></span>` : ''}
    </div>
    <table class="items">
      <thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="kv"><span>الإجمالي الفرعي</span><b>${money(sale.subtotal)}</b></div>
    ${sale.discount ? `<div class="kv"><span>الخصم</span><b>- ${money(sale.discount)}</b></div>` : ''}
    ${sale.extra_fees ? `<div class="kv"><span>رسوم إضافية</span><b>+ ${money(sale.extra_fees)}</b></div>` : ''}
    <div class="r-total"><span>الإجمالي</span><span>${money(sale.total)}</span></div>
    <div class="kv" style="margin-top:6px"><span>طريقة الدفع</span><b>${esc(sale.payment_label || paymentLabel(sale.payment_method))}</b></div>
    ${sale.notes ? `<div class="r-sub" style="text-align:right;margin-top:6px">ملاحظات: ${esc(sale.notes)}</div>` : ''}
    <div class="r-foot">${esc(settings.invoice_footer || 'شكرًا لزيارتكم')}</div>
  </div>`;
}

export function printHTML(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  const cleanup = () => { area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function downloadBlob(filename, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob(['\ufeff' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toCSV(columns, rows) {
  const escCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map(c => escCell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => escCell(c.raw ? '' : r[c.k])).join(',')).join('\n');
  return head + '\n' + body;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function bindSubmit(form, handler) {
  form.addEventListener('submit', e => { e.preventDefault(); handler(e); });
}
