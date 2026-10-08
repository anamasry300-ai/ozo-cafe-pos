import { api } from '../api.js';
import { esc, money, num, intFmt, qs, statusBadge, paymentLabel, dateTimeFmt, toast } from '../ui.js';

export function renderDashboard(root) {
  root.innerHTML = `
    <div class="stats" id="stats"></div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head">
          <h3>📈 ملخص المبيعات</h3>
          <div class="spacer" style="flex:1"></div>
          <div class="tabs" id="sum-tabs">
            <button class="tab active" data-k="daily" type="button">يومي</button>
            <button class="tab" data-k="weekly" type="button">أسبوعي</button>
            <button class="tab" data-k="monthly" type="button">شهري</button>
          </div>
        </div>
        <div class="card-body">
          <div class="chart" id="chart"></div>
          <div id="sum-table" style="margin-top:14px"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>🏆 الأصناف الأكثر مبيعًا (هذا الشهر)</h3></div>
        <div class="card-body" id="top-products"><div class="empty">جارٍ التحميل...</div></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>⚠️ تنبيهات انخفاض المخزون</h3></div>
        <div class="card-body" id="low-stock"><div class="empty">جارٍ التحميل...</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>🧾 آخر الفواتير</h3></div>
        <div class="card-body" id="recent"><div class="empty">جارٍ التحميل...</div></div>
      </div>
    </div>`;

  let data = null;
  let period = 'daily';

  function stat(label, value, cls = '', sub = '') {
    return `<div class="stat ${cls}">
      <div class="label">${label}</div>
      <div class="value num">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  }

  function renderStats() {
    const t = data.today;
    qs('#stats').innerHTML = [
      stat('مبيعات اليوم (الإجمالي)', money(t.gross), 'blue', `${t.invoices} فاتورة اليوم`),
      stat('صافي المبيعات', money(t.net_sales), '', t.discounts ? `خصومات: ${money(t.discounts)}` : 'بدون خصومات'),
      stat('تكلفة المبيعات', money(t.cogs), 'amber', 'تكلفة الأصناف المباعة'),
      stat('مصروفات اليوم', money(t.expenses), 'red', `مصروفات الشهر: ${money(data.month.expenses)}`),
      stat('صافي الربح التقريبي (اليوم)', money(t.net_profit), t.net_profit >= 0 ? 'green' : 'red', 'صافي المبيعات − التكلفة − المصروفات'),
      stat('عدد فواتير اليوم', intFmt(t.invoices), 'blue', 'فواتير مكتملة'),
    ].join('');
  }

  function renderSummary() {
    const rows = data.summary[period] || [];
    const chart = qs('#chart');
    if (!rows.length) {
      chart.innerHTML = `<div class="empty" style="width:100%">لا توجد مبيعات في هذه الفترة</div>`;
      qs('#sum-table').innerHTML = '';
      return;
    }
    const max = Math.max(...rows.map(r => r.total), 1);
    chart.innerHTML = rows.map(r => {
      const h = Math.max(3, Math.round((r.total / max) * 100));
      const lbl = period === 'monthly' ? r.d.slice(2) : r.d.slice(5);
      return `<div class="bar-col">
        <div class="bar-val">${num(r.total, 0)}</div>
        <div class="bar" style="height:${h}%" title="${esc(r.d)}: ${money(r.total)}"></div>
        <div class="bar-lbl">${esc(lbl)}</div>
      </div>`;
    }).join('');

    const totals = rows.reduce((a, r) => ({
      invoices: a.invoices + r.invoices,
      total: a.total + r.total,
      cogs: a.cogs + r.cogs,
    }), { invoices: 0, total: 0, cogs: 0 });

    qs('#sum-table').innerHTML = `
      <div class="kv"><span>عدد الفواتير</span><b>${intFmt(totals.invoices)}</b></div>
      <div class="kv"><span>إجمالي المبيعات</span><b>${money(totals.total)}</b></div>
      <div class="kv"><span>تكلفة المبيعات</span><b>${money(totals.cogs)}</b></div>
      <div class="kv"><span>الربح قبل المصروفات</span><b style="color:var(--success)">${money(totals.total - totals.cogs)}</b></div>`;
  }

  function renderTop() {
    const rows = data.top_products;
    qs('#top-products').innerHTML = rows.length ? rows.map((r, i) => `
      <div class="list-row">
        <span class="badge badge-teal">${i + 1}</span>
        <div class="grow">
          <div style="font-weight:700">${esc(r.name)}</div>
          <div class="muted" style="font-size:12.5px">${intFmt(r.qty)} قطعة · إيراد ${money(r.revenue)}</div>
        </div>
        <b class="num">${money(r.revenue - r.cogs)}</b>
      </div>`).join('') : '<div class="empty">لا توجد مبيعات هذا الشهر بعد</div>';
  }

  function renderLow() {
    const rows = data.low_stock;
    qs('#low-stock').innerHTML = rows.length ? rows.map(r => `
      <div class="list-row">
        <span class="badge ${r.quantity <= 0 ? 'badge-red' : 'badge-amber'}">${r.quantity <= 0 ? 'نفد' : 'منخفض'}</span>
        <div class="grow">
          <div style="font-weight:700">${esc(r.name)}</div>
          <div class="muted" style="font-size:12.5px">الحد الأدنى: ${num(r.min_stock)} ${esc(r.unit)}${r.supplier_name ? ' · ' + esc(r.supplier_name) : ''}</div>
        </div>
        <b class="num" style="color:var(--danger)">${num(r.quantity)} ${esc(r.unit)}</b>
      </div>`).join('') : '<div class="empty"><div class="big">✅</div>المخزون في أمان، لا توجد تنبيهات</div>';
  }

  function renderRecent() {
    const rows = data.recent_sales;
    qs('#recent').innerHTML = rows.length ? rows.map(r => `
      <div class="list-row">
        <div class="grow">
          <div style="font-weight:700">${esc(r.invoice_no)}</div>
          <div class="muted" style="font-size:12.5px">${dateTimeFmt(r.created_at)} · ${esc(r.username || '')} · ${paymentLabel(r.payment_method)}</div>
        </div>
        ${statusBadge(r.status)}
        <b class="num">${money(r.total)}</b>
      </div>`).join('') : '<div class="empty"><div class="big">🧾</div>لا توجد فواتير بعد</div>';
  }

  qs('#sum-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    period = btn.dataset.k;
    qs('#sum-tabs').querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    renderSummary();
  });

  (async () => {
    try {
      data = await api('/dashboard');
      renderStats();
      renderSummary();
      renderTop();
      renderLow();
      renderRecent();
    } catch (e) {
      toast(e.message, 'error');
    }
  })();
}
