import { api } from '../api.js';
import { esc, money, num, intFmt, qs, toast, tableHTML, statusBadge, downloadBlob, toCSV, printHTML, todayISO, monthStartISO, dateTimeFmt } from '../ui.js';

const REPORTS = [
  { id: 'daily-sales', name: 'المبيعات اليومية' },
  { id: 'weekly-sales', name: 'المبيعات الأسبوعية' },
  { id: 'monthly-sales', name: 'المبيعات الشهرية' },
  { id: 'by-product', name: 'المبيعات حسب الصنف' },
  { id: 'top-products', name: 'أكثر الأصناف مبيعًا' },
  { id: 'purchases', name: 'المشتريات' },
  { id: 'expenses', name: 'المصروفات' },
  { id: 'inventory', name: 'المخزون' },
  { id: 'product-costs', name: 'تكلفة المنتجات' },
  { id: 'profits', name: 'الأرباح' },
  { id: 'payment-methods', name: 'طرق الدفع' },
  { id: 'invoices', name: 'الفواتير' },
];

export function renderReports(root) {
  let current = 'daily-sales';
  let from = monthStartISO();
  let to = todayISO();
  let lastData = null;
  let lastCols = [];

  root.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-body">
        <div class="report-head">
          <div class="field"><label>التقرير</label>
            <select class="select" id="r-select">
              ${REPORTS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>من تاريخ</label><input class="input" id="r-from" type="date" value="${from}"></div>
          <div class="field"><label>إلى تاريخ</label><input class="input" id="r-to" type="date" value="${to}"></div>
          <button class="btn btn-primary" id="r-go" type="button">📊 عرض التقرير</button>
          <button class="btn" id="r-print" type="button">🖨 طباعة</button>
          <button class="btn" id="r-csv" type="button">⬇ تصدير CSV</button>
        </div>
      </div>
    </div>
    <div id="report-out"><div class="empty"><div class="big">📈</div>اختر التقرير والفترة ثم اضغط "عرض التقرير"</div></div>`;

  function title() {
    const r = REPORTS.find(x => x.id === current);
    return `${r.name} (${from || 'البداية'} → ${to || 'اليوم'})`;
  }

  function renderResult(name, data) {
    const out = qs('#report-out');
    lastData = data;
    lastCols = [];

    if (['daily-sales', 'weekly-sales', 'monthly-sales'].includes(name)) {
      const periodLabel = name === 'daily-sales' ? 'التاريخ' : name === 'weekly-sales' ? 'بداية الأسبوع' : 'الشهر';
      lastCols = [
        { k: 'period', label: periodLabel },
        { k: 'invoices', label: 'عدد الفواتير', cls: 'num' },
        { k: 'gross', label: 'الإجمالي', cls: 'num', fmt: r => money(r.gross) },
        { k: 'discounts', label: 'الخصومات', cls: 'num', fmt: r => money(r.discounts) },
        { k: 'fees', label: 'رسوم', cls: 'num', fmt: r => money(r.fees) },
        { k: 'net', label: 'الصافي', cls: 'num', fmt: r => money(r.net) },
        { k: 'cogs', label: 'التكلفة', cls: 'num', fmt: r => money(r.cogs) },
        { k: 'gross_profit', label: 'الربح', cls: 'num', raw: true, fmt: r => `<span style="color:${r.gross_profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(r.gross_profit)}</span>` },
      ];
      const t = data.totals;
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">عدد الفواتير</div><div class="value num">${intFmt(t.invoices)}</div></div>
          <div class="stat blue"><div class="label">إجمالي المبيعات</div><div class="value num">${money(t.gross)}</div></div>
          <div class="stat amber"><div class="label">الخصومات</div><div class="value num">${money(t.discounts)}</div></div>
          <div class="stat green"><div class="label">الصافي</div><div class="value num">${money(t.net)}</div></div>
          <div class="stat red"><div class="label">تكلفة المبيعات</div><div class="value num">${money(t.cogs)}</div></div>
          <div class="stat green"><div class="label">الربح قبل المصروفات</div><div class="value num">${money(t.gross_profit)}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, {
          period: 'الإجمالي', invoices: intFmt(t.invoices), gross: money(t.gross), discounts: money(t.discounts),
          fees: money(t.fees), net: money(t.net), cogs: money(t.cogs), gross_profit: money(t.gross_profit),
        })}</div></div>`;
      return;
    }

    if (name === 'by-product' || name === 'top-products') {
      lastCols = [
        { k: 'product_name', label: 'الصنف', raw: true, fmt: r => `<b>${esc(r.product_name)}</b>` },
        { k: 'invoices', label: 'عدد الفواتير', cls: 'num' },
        { k: 'quantity', label: 'الكمية المباعة', cls: 'num' },
        { k: 'revenue', label: 'الإيراد', cls: 'num', fmt: r => money(r.revenue) },
        { k: 'cogs', label: 'التكلفة', cls: 'num', fmt: r => money(r.cogs) },
        { k: 'profit', label: 'الربح', cls: 'num', raw: true, fmt: r => `<span style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(r.profit)}</span>` },
      ];
      const t = data.totals;
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">إجمالي الكميات</div><div class="value num">${intFmt(t.quantity)}</div></div>
          <div class="stat green"><div class="label">الإيراد</div><div class="value num">${money(t.revenue)}</div></div>
          <div class="stat amber"><div class="label">التكلفة</div><div class="value num">${money(t.cogs)}</div></div>
          <div class="stat green"><div class="label">الربح</div><div class="value num">${money(t.profit)}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, {
          product_name: 'الإجمالي', quantity: intFmt(t.quantity), revenue: money(t.revenue), cogs: money(t.cogs), profit: money(t.profit),
        })}</div></div>`;
      return;
    }

    if (name === 'purchases') {
      lastCols = [
        { k: 'invoice_no', label: 'رقم الفاتورة' },
        { k: 'date', label: 'التاريخ' },
        { k: 'supplier_name', label: 'المورد', fmt: r => r.supplier_name || '—' },
        { k: 'items_count', label: 'عدد الأصناف', cls: 'num' },
        { k: 'total', label: 'الإجمالي', cls: 'num', fmt: r => money(r.total) },
        { k: 'username', label: 'المُسجّل' },
      ];
      const t = data.totals;
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">عدد فواتير الشراء</div><div class="value num">${t.count}</div></div>
          <div class="stat amber"><div class="label">إجمالي المشتريات</div><div class="value num">${money(t.total)}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, { invoice_no: 'الإجمالي', total: money(t.total) })}</div></div>`;
      return;
    }

    if (name === 'expenses') {
      lastCols = [
        { k: 'type', label: 'النوع', raw: true, fmt: r => `<span class="badge badge-red">${esc(r.type)}</span>` },
        { k: 'date', label: 'التاريخ' },
        { k: 'amount', label: 'المبلغ', cls: 'num', fmt: r => money(r.amount) },
        { k: 'notes', label: 'الملاحظات', fmt: r => r.notes || '—' },
        { k: 'username', label: 'المُسجّل' },
      ];
      const t = data.totals;
      out.innerHTML = `
        <div class="stats">
          <div class="stat red"><div class="label">إجمالي المصروفات</div><div class="value num">${money(t.total)}</div></div>
          <div class="stat blue"><div class="label">عدد المصروفات</div><div class="value num">${t.count}</div></div>
        </div>
        <div class="grid-2" style="margin-bottom:16px">
          <div class="card"><div class="card-head"><h3>التصنيف حسب النوع</h3></div><div class="card-body">
            ${tableHTML([
              { k: 'type', label: 'النوع' },
              { k: 'count', label: 'العدد', cls: 'num' },
              { k: 'amount', label: 'المبلغ', cls: 'num', fmt: r => money(r.amount) },
            ], data.by_type || [], { type: 'الإجمالي', amount: money(t.total) })}
          </div></div>
          <div class="card"><div class="card-head"><h3>أكبر المصروفات</h3></div><div class="card-body">
            ${(data.by_type || []).map(r => `
              <div class="list-row"><div class="grow"><b>${esc(r.type)}</b></div><b class="num">${money(r.amount)}</b></div>`).join('') || '<div class="empty">لا بيانات</div>'}
          </div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, { type: 'الإجمالي', amount: money(t.total) })}</div></div>`;
      return;
    }

    if (name === 'inventory') {
      const ingCols = [
        { k: 'name', label: 'المادة الخام', raw: true, fmt: r => `<b>${esc(r.name)}</b>` },
        { k: 'quantity', label: 'الكمية', cls: 'num', raw: true, fmt: r => `<span class="badge ${r.low_stock ? 'badge-amber' : 'badge-green'}">${num(r.quantity)} ${esc(r.unit)}</span>` },
        { k: 'min_stock', label: 'الحد الأدنى', cls: 'num', fmt: r => `${num(r.min_stock)} ${r.unit}` },
        { k: 'purchase_price', label: 'سعر الشراء', cls: 'num', fmt: r => money(r.purchase_price) },
        { k: 'stock_value', label: 'قيمة المخزون', cls: 'num', fmt: r => money(r.stock_value) },
        { k: 'supplier_name', label: 'المورد', fmt: r => r.supplier_name || '—' },
      ];
      const moveCols = [
        { k: 'created_at', label: 'التاريخ', fmt: r => dateTimeFmt(r.created_at) },
        { k: 'ingredient_name', label: 'المادة' },
        { k: 'type', label: 'النوع' },
        { k: 'delta', label: 'التغيير', cls: 'num', raw: true, fmt: r => `<span style="color:${r.delta >= 0 ? 'var(--success)' : 'var(--danger)'}">${r.delta >= 0 ? '+' : ''}${num(r.delta)}</span>` },
        { k: 'quantity_after', label: 'الرصيد', cls: 'num' },
        { k: 'notes', label: 'ملاحظات', fmt: r => r.notes || '—' },
      ];
      const t = data.totals;
      lastCols = ingCols;
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">عدد المواد</div><div class="value num">${t.items}</div></div>
          <div class="stat green"><div class="label">قيمة المخزون</div><div class="value num">${money(t.stock_value)}</div></div>
          <div class="stat amber"><div class="label">مواد منخفضة/ناقصة</div><div class="value num">${t.low_count}</div></div>
          <div class="stat blue"><div class="label">حركات المخزون في الفترة</div><div class="value num">${t.movements}</div></div>
        </div>
        <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>المواد الخام (الأرصدة الحالية)</h3></div>
          <div class="card-body">${tableHTML(ingCols, data.rows, { name: 'قيمة المخزون الكلية', stock_value: money(t.stock_value) })}</div></div>
        <div class="card"><div class="card-head"><h3>حركات المخزون في الفترة</h3></div>
          <div class="card-body">${tableHTML(moveCols, data.movements || [])}</div></div>`;
      return;
    }

    if (name === 'product-costs') {
      lastCols = [
        { k: 'name', label: 'المنتج', raw: true, fmt: r => `<b>${esc(r.name)}</b>` },
        { k: 'category_name', label: 'التصنيف', fmt: r => r.category_name || '—' },
        { k: 'price', label: 'سعر البيع', cls: 'num', fmt: r => money(r.price) },
        { k: 'cost', label: 'التكلفة', cls: 'num', fmt: r => money(r.cost) },
        { k: 'margin', label: 'هامش الربح', cls: 'num', fmt: r => money(r.margin) },
        { k: 'margin_percent', label: 'النسبة', cls: 'num', fmt: r => num(r.margin_percent, 0) + '%' },
        { k: 'recipe', label: 'المكونات', raw: true, fmt: r => r.has_recipe
            ? r.recipe.map(x => `${esc(x.ingredient_name)} (${num(x.quantity)} ${esc(x.unit)})`).join('، ')
            : '<span class="muted">تكلفة يدوية</span>' },
      ];
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">عدد المنتجات</div><div class="value num">${data.totals.count}</div></div>
          <div class="stat amber"><div class="label">متوسط التكلفة</div><div class="value num">${money(data.totals.avg_cost)}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows)}</div></div>`;
      return;
    }

    if (name === 'profits') {
      const t = data.totals;
      lastCols = [
        { k: 'period', label: 'التاريخ' },
        { k: 'net_sales', label: 'مبيعات', cls: 'num', fmt: r => money(r.net_sales) },
        { k: 'cogs', label: 'التكلفة', cls: 'num', fmt: r => money(r.cogs) },
        { k: 'gross_profit', label: 'ربح قبل المصروفات', cls: 'num', fmt: r => money(r.gross_profit) },
        { k: 'expenses', label: 'المصروفات', cls: 'num', fmt: r => money(r.expenses) },
        { k: 'net_profit', label: 'صافي الربح', cls: 'num', raw: true, fmt: r => `<b style="color:${r.net_profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(r.net_profit)}</b>` },
      ];
      out.innerHTML = `
        <div class="card" style="margin-bottom:16px"><div class="card-body">
          <div class="kv"><span>إجمالي المبيعات (قبل الخصم)</span><b>${money(t.gross)}</b></div>
          <div class="kv"><span>الخصومات</span><b style="color:var(--danger)">− ${money(t.discounts)}</b></div>
          <div class="kv"><span>رسوم إضافية</span><b>+ ${money(t.fees)}</b></div>
          <div class="kv"><span>صافي المبيعات</span><b>${money(t.net_sales)}</b></div>
          <div class="kv"><span>تكلفة المنتجات المباعة</span><b style="color:var(--danger)">− ${money(t.cogs)}</b></div>
          <div class="kv"><span>المصروفات</span><b style="color:var(--danger)">− ${money(t.expenses)}</b></div>
          <div class="kv big" style="border-top:2px solid var(--border);margin-top:6px;padding-top:12px">
            <span><b>صافي الربح</b></span>
            <b style="font-size:24px;color:${t.net_profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(t.net_profit)}</b>
          </div>
          <div class="hint" style="margin-top:6px">عدد الفواتير المكتملة: ${t.invoices}</div>
        </div></div>
        <div class="card"><div class="card-head"><h3>التفاصيل اليومية</h3></div>
          <div class="card-body">${tableHTML(lastCols, data.rows)}</div></div>`;
      return;
    }

    if (name === 'payment-methods') {
      lastCols = [
        { k: 'label', label: 'طريقة الدفع', raw: true, fmt: r => `<span class="badge badge-teal">${esc(r.label)}</span>` },
        { k: 'count', label: 'عدد العمليات', cls: 'num' },
        { k: 'amount', label: 'الإجمالي', cls: 'num', fmt: r => money(r.amount) },
      ];
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">إجمالي العمليات</div><div class="value num">${data.totals.count}</div></div>
          <div class="stat green"><div class="label">الإجمالي المحصل</div><div class="value num">${money(data.totals.amount)}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, { label: 'الإجمالي', count: data.totals.count, amount: money(data.totals.amount) })}</div></div>`;
      return;
    }

    if (name === 'invoices') {
      lastCols = [
        { k: 'invoice_no', label: 'رقم الفاتورة' },
        { k: 'created_at', label: 'التاريخ', fmt: r => dateTimeFmt(r.created_at) },
        { k: 'items_count', label: 'الأصناف', cls: 'num' },
        { k: 'total', label: 'الإجمالي', cls: 'num', fmt: r => money(r.total) },
        { k: 'payment_label', label: 'الدفع' },
        { k: 'status', label: 'الحالة', raw: true, fmt: r => statusBadge(r.status) },
        { k: 'username', label: 'الكاشير' },
      ];
      out.innerHTML = `
        <div class="stats">
          <div class="stat blue"><div class="label">عدد الفواتير</div><div class="value num">${data.totals.count}</div></div>
          <div class="stat green"><div class="label">مبيعات مكتملة</div><div class="value num">${money(data.totals.net)}</div></div>
          <div class="stat red"><div class="label">ملغاة / مسترجعة</div><div class="value num">${data.totals.cancelled}</div></div>
        </div>
        <div class="card"><div class="card-body">${tableHTML(lastCols, data.rows, { invoice_no: 'الإجمالي', total: money(data.totals.net) })}</div></div>`;
      return;
    }

    out.innerHTML = '<div class="empty">التقرير غير مدعوم</div>';
  }

  async function run() {
    from = qs('#r-from').value;
    to = qs('#r-to').value;
    current = qs('#r-select').value;
    const btn = qs('#r-go');
    btn.disabled = true;
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const data = await api(`/reports/${current}?${params.toString()}`);
      renderResult(current, data);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  qs('#r-go').onclick = run;
  qs('#r-select').onchange = run;
  qs('#r-print').onclick = async () => {
    if (!lastData) return toast('اعرض التقرير أولًا', 'error');
    const store = await api('/settings').catch(() => ({}));
    printHTML(`
      <div class="receipt" style="margin-bottom:12px">
        <h2>${esc(store.store_name || 'أوزو OZO')}</h2>
        <div class="r-sub">${esc(title())}</div>
        <div class="r-sub">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</div>
      </div>` + qs('#report-out').innerHTML);
  };
  qs('#r-csv').onclick = () => {
    if (!lastData || !lastCols.length) return toast('اعرض التقرير أولًا', 'error');
    const rows = lastData.rows || [];
    const cols = lastCols.filter(c => !c.raw);
    if (!cols.length) return toast('لا أعمدة قابلة للتصدير', 'error');
    downloadBlob(`${current}-${from}-${to}.csv`, toCSV(cols, rows), 'text/csv;charset=utf-8');
    toast('تم تنزيل الملف', 'success');
  };

  run();
}
