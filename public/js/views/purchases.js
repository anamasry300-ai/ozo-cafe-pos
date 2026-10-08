import { api } from '../api.js';
import { esc, money, num, qs, openModal, confirmDlg, toast, tableHTML, todayISO, monthStartISO } from '../ui.js';

export function renderPurchases(root) {
  let rows = [];
  let ingredients = [];
  let suppliers = [];
  let q = '';
  let from = monthStartISO();
  let to = todayISO();

  root.innerHTML = `
    <div class="toolbar">
      <input class="input" id="p-from" type="date" value="${from}">
      <input class="input" id="p-to" type="date" value="${to}">
      <input class="input grow" id="p-search" type="search" placeholder="🔍 بحث برقم الفاتورة أو المورد...">
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="btn-new" type="button">+ فاتورة شراء</button>
    </div>
    <div class="stats" id="p-stats"></div>
    <div class="card"><div class="card-body tight" id="box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function load() {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q) params.set('q', q);
      const [data, ing, sup] = await Promise.all([
        api('/purchases?' + params.toString()),
        api('/ingredients?active_only=1'),
        api('/suppliers'),
      ]);
      rows = data.rows;
      ingredients = ing;
      suppliers = sup;
      qs('#p-stats').innerHTML = `
        <div class="stat blue"><div class="label">عدد فواتير الشراء</div><div class="value num">${rows.length}</div></div>
        <div class="stat amber"><div class="label">إجمالي المشتريات (الفترة)</div><div class="value num">${money(data.total)}</div></div>`;
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderTable() {
    const cols = [
      { k: 'invoice_no', label: 'رقم الفاتورة', raw: true, fmt: r => `<b>${esc(r.invoice_no)}</b>` },
      { k: 'date', label: 'التاريخ' },
      { k: 'supplier_name', label: 'المورد', fmt: r => r.supplier_name || '—' },
      { k: 'items_count', label: 'عدد الأصناف', cls: 'num' },
      { k: 'total', label: 'الإجمالي', cls: 'num', fmt: r => money(r.total) },
      { k: 'username', label: 'المُسجّل', fmt: r => r.username || '—' },
      {
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-view="${r.id}" type="button">👁 عرض</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>`,
      },
    ];
    qs('#box').innerHTML = tableHTML(cols, rows);
    qs('#box').querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewPurchase(Number(b.dataset.view)));
    qs('#box').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const p = rows.find(x => x.id === Number(b.dataset.del));
      if (!await confirmDlg(`حذف فاتورة الشراء ${p.invoice_no}؟ سيتم خصم كمياتها من المخزون.`)) return;
      try {
        await api(`/purchases/${p.id}`, { method: 'DELETE' });
        toast('تم حذف الفاتورة وعكس المخزون', 'success');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function viewPurchase(id) {
    try {
      const p = await api(`/purchases/${id}`);
      const cols = [
        { k: 'ingredient_name', label: 'المادة الخام' },
        { k: 'quantity', label: 'الكمية', cls: 'num', fmt: r => `${num(r.quantity)} ${r.unit}` },
        { k: 'unit_price', label: 'سعر الوحدة', cls: 'num', fmt: r => money(r.unit_price) },
        { k: 'line_total', label: 'الإجمالي', cls: 'num', fmt: r => money(r.line_total) },
      ];
      openModal({
        title: `فاتورة شراء ${p.invoice_no}`,
        body: `
          <div class="kv"><span>التاريخ</span><b>${esc(p.date)}</b></div>
          <div class="kv"><span>المورد</span><b>${esc(p.supplier_name || '—')}</b></div>
          <div class="kv"><span>ملاحظات</span><b>${esc(p.notes || '—')}</b></div>
          <div style="margin-top:12px">${tableHTML(cols, p.items)}</div>
          <div class="kv big" style="margin-top:10px"><span>الإجمالي</span><b style="color:var(--primary)">${money(p.total)}</b></div>`,
        footer: `<button class="btn" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>`,
      });
    } catch (e) { toast(e.message, 'error'); }
  }

  function openNew() {
    if (!ingredients.length) return toast('أضف مواد خام أولًا من صفحة المخزون', 'error');
    let items = [{ ingredient_id: ingredients[0].id, quantity: '', unit_price: ingredients[0].purchase_price }];

    const m = openModal({
      title: 'فاتورة شراء جديدة',
      wide: true,
      body: `
        <div class="form-grid">
          <div class="field"><label>المورد</label>
            <select class="select" id="n-sup">
              <option value="">بدون مورد</option>
              ${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label>التاريخ *</label><input class="input" id="n-date" type="date" value="${todayISO()}"></div>
        </div>
        <div class="field"><label>الأصناف المشتراة</label><div id="n-items"></div>
          <button class="btn btn-sm" id="n-add" type="button" style="margin-top:8px">+ إضافة صنف</button>
        </div>
        <div class="field"><label>ملاحظات</label><input class="input" id="n-notes" placeholder="اختياري"></div>
        <div class="kv big"><span>إجمالي الفاتورة</span><b id="n-total" style="color:var(--primary)">0.00 ج.م</b></div>`,
      footer: `<button class="btn btn-primary" id="n-save" type="button">💾 حفظ الفاتورة وتحديث المخزون</button>
               <button class="btn" id="n-cancel" type="button">إلغاء</button>`,
    });

    function renderItems() {
      const box = m.body.querySelector('#n-items');
      box.innerHTML = items.map((it, i) => `
        <div class="list-row" style="gap:6px">
          <select class="select input-sm" data-ing="${i}" style="flex:2;min-width:0">
            ${ingredients.map(g => `<option value="${g.id}" ${g.id === it.ingredient_id ? 'selected' : ''}>${esc(g.name)} (${esc(g.unit)})</option>`).join('')}
          </select>
          <input class="input input-sm" data-qty="${i}" type="number" min="0" step="any" placeholder="الكمية" value="${it.quantity}" style="flex:1;min-width:80px">
          <input class="input input-sm" data-price="${i}" type="number" min="0" step="any" placeholder="سعر الشراء" value="${it.unit_price}" style="flex:1;min-width:90px">
          <span class="num" data-line="${i}" style="min-width:88px;font-weight:800">0.00</span>
          <button class="o-del" data-del="${i}" type="button">🗑</button>
        </div>`).join('');
      box.querySelectorAll('[data-ing]').forEach(el => el.onchange = () => {
        items[Number(el.dataset.ing)].ingredient_id = Number(el.value);
        const ing = ingredients.find(g => g.id === Number(el.value));
        if (ing) items[Number(el.dataset.ing)].unit_price = ing.purchase_price;
        renderItems();
      });
      box.querySelectorAll('[data-qty]').forEach(el => el.oninput = () => {
        items[Number(el.dataset.qty)].quantity = el.value;
        updateTotal();
      });
      box.querySelectorAll('[data-price]').forEach(el => el.oninput = () => {
        items[Number(el.dataset.price)].unit_price = el.value;
        updateTotal();
      });
      box.querySelectorAll('[data-del]').forEach(el => el.onclick = () => {
        if (items.length === 1) return toast('يجب أن يحتوي الفاتورة على صنف واحد على الأقل', 'error');
        items.splice(Number(el.dataset.del), 1);
        renderItems();
      });
      updateTotal();
    }

    function updateTotal() {
      let total = 0;
      items.forEach((it, i) => {
        const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
        total += line;
        const span = m.body.querySelector(`[data-line="${i}"]`);
        if (span) span.textContent = num(line);
      });
      m.body.querySelector('#n-total').textContent = money(total);
    }

    m.body.querySelector('#n-add').onclick = () => {
      items.push({ ingredient_id: ingredients[0].id, quantity: '', unit_price: ingredients[0].purchase_price });
      renderItems();
    };
    m.foot.querySelector('#n-cancel').onclick = () => m.close();
    m.foot.querySelector('#n-save').onclick = async () => {
      const clean = items
        .map(it => ({ ingredient_id: it.ingredient_id, quantity: Number(it.quantity), unit_price: Number(it.unit_price) }))
        .filter(it => it.quantity > 0);
      if (!clean.length) return toast('أدخل كمية لكل صنف', 'error');
      const date = m.body.querySelector('#n-date').value;
      if (!date) return toast('حدد التاريخ', 'error');
      try {
        const p = await api('/purchases', {
          method: 'POST',
          body: {
            supplier_id: m.body.querySelector('#n-sup').value ? Number(m.body.querySelector('#n-sup').value) : null,
            date,
            notes: m.body.querySelector('#n-notes').value.trim(),
            items: clean,
          },
        });
        toast(`تم حفظ ${p.invoice_no} وتحديث المخزون`, 'success');
        m.close();
        await load();
      } catch (e) { toast(e.message, 'error'); }
    };

    renderItems();
  }

  qs('#btn-new').onclick = openNew;
  qs('#p-from').onchange = e => { from = e.target.value; load(); };
  qs('#p-to').onchange = e => { to = e.target.value; load(); };
  qs('#p-search').addEventListener('input', e => {
    q = e.target.value;
    clearTimeout(root._t);
    root._t = setTimeout(load, 250);
  });

  load();
}
