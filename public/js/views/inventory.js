import { api, isAdmin } from '../api.js';
import { esc, money, num, qs, openModal, confirmDlg, toast, tableHTML, todayISO, monthStartISO, dateTimeFmt } from '../ui.js';

export function renderInventory(root) {
  const canEdit = isAdmin();
  let tab = 'materials';
  let ingredients = [];
  let suppliers = [];
  let moves = [];
  let q = '';
  let lowOnly = false;

  root.innerHTML = `
    <div class="toolbar">
      <div class="tabs" id="inv-tabs">
        <button class="tab active" data-t="materials" type="button">المواد الخام</button>
        <button class="tab" data-t="moves" type="button">حركات المخزون</button>
        <button class="tab" data-t="suppliers" type="button">الموردون</button>
      </div>
      <div style="flex:1"></div>
      <div id="tab-actions" style="display:flex;gap:8px"></div>
    </div>
    <div class="card"><div class="card-body tight" id="box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function loadAll() {
    try {
      ingredients = await api(`/ingredients?q=${encodeURIComponent(q)}${lowOnly ? '&low_stock=1' : ''}`);
      suppliers = await api('/suppliers');
      if (tab === 'moves') await loadMoves();
      render();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function loadMoves() {
    const from = qs('#m-from')?.value;
    const to = qs('#m-to')?.value;
    const ing = qs('#m-ing')?.value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (ing) params.set('ingredient_id', ing);
    moves = await api('/inventory/transactions?' + params.toString());
  }

  function renderActions() {
    const box = qs('#tab-actions');
    if (tab === 'materials' && canEdit) {
      box.innerHTML = `<button class="btn" id="btn-low" type="button">${lowOnly ? 'إظهار الكل' : '⚠️ المنخفض فقط'}</button>
                       <button class="btn btn-primary" id="btn-new-ing" type="button">+ مادة خام</button>`;
      qs('#btn-low').onclick = () => { lowOnly = !lowOnly; loadAll(); };
      qs('#btn-new-ing').onclick = () => openIngredient(null);
    } else if (tab === 'suppliers' && canEdit) {
      box.innerHTML = `<button class="btn btn-primary" id="btn-new-sup" type="button">+ مورد</button>`;
      qs('#btn-new-sup').onclick = () => openSupplier(null);
    } else {
      box.innerHTML = '';
    }
  }

  function render() {
    renderActions();
    const box = qs('#box');
    if (tab === 'materials') return renderMaterials(box);
    if (tab === 'moves') return renderMoves(box);
    return renderSuppliers(box);
  }

  function renderMaterials(box) {
    const cols = [
      { k: 'name', label: 'المادة الخام', raw: true, fmt: r => `<b>${esc(r.name)}</b>${r.active ? '' : ' <span class="badge badge-gray">موقوفة</span>'}` },
      { k: 'quantity', label: 'الكمية الحالية', cls: 'num', raw: true, fmt: r => `<span class="badge ${r.quantity <= 0 ? 'badge-red' : r.low_stock ? 'badge-amber' : 'badge-green'}">${num(r.quantity)} ${esc(r.unit)}</span>` },
      { k: 'min_stock', label: 'الحد الأدنى', cls: 'num', fmt: r => `${num(r.min_stock)} ${r.unit}` },
      { k: 'purchase_price', label: 'سعر الشراء', cls: 'num', fmt: r => `${money(r.purchase_price)} / ${r.unit}` },
      { k: 'stock_cost', label: 'قيمة المخزون', cls: 'num', fmt: r => money(r.stock_cost) },
      { k: 'supplier_name', label: 'المورد', fmt: r => r.supplier_name || '—' },
      { k: 'last_purchase_at', label: 'آخر شراء', fmt: r => r.last_purchase_at || '—' },
    ];
    if (canEdit) {
      cols.push({
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-edit="${r.id}" type="button">✏️</button>
          <button class="btn btn-sm" data-adj="${r.id}" type="button">⚖️ تسوية</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>`,
      });
    }
    box.innerHTML = `<div class="card-body">
        <div class="toolbar" style="margin-bottom:12px">
          <input class="input grow" id="i-search" type="search" placeholder="🔍 بحث في المواد الخام..." value="${esc(q)}">
          <div style="font-weight:800">إجمالي قيمة المخزون: <span style="color:var(--primary)">${money(ingredients.reduce((s, r) => s + r.stock_cost, 0))}</span></div>
        </div>
        ${tableHTML(cols, ingredients)}
      </div>`;
    qs('#i-search').addEventListener('input', e => {
      q = e.target.value;
      clearTimeout(root._t);
      root._t = setTimeout(loadAll, 250);
    });
    if (canEdit) {
      box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openIngredient(Number(b.dataset.edit)));
      box.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => openAdjust(Number(b.dataset.adj)));
      box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const ing = ingredients.find(x => x.id === Number(b.dataset.del));
        if (!await confirmDlg(`حذف المادة "${ing.name}"؟`)) return;
        try { await api(`/ingredients/${ing.id}`, { method: 'DELETE' }); toast('تم الحذف', 'success'); await loadAll(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  }

  function renderMoves(box) {
    box.innerHTML = `
      <div class="card-body">
        <div class="toolbar">
          <input class="input" id="m-from" type="date" value="${monthStartISO()}">
          <input class="input" id="m-to" type="date" value="${todayISO()}">
          <select class="select" id="m-ing"><option value="">كل المواد</option>
            ${ingredients.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="m-go" type="button">عرض</button>
        </div>
        <div id="moves-table"></div>
      </div>`;
    qs('#m-go').onclick = async () => {
      try {
        await loadMoves();
        renderMovesTable();
      } catch (e) { toast(e.message, 'error'); }
    };
    renderMovesTable();
  }

  function renderMovesTable() {
    const typeLabel = t => ({
      purchase: '<span class="badge badge-green">شراء</span>',
      sale: '<span class="badge badge-teal">بيع</span>',
      adjust: '<span class="badge badge-amber">تسوية</span>',
      cancel: '<span class="badge badge-gray">إلغاء بيع</span>',
      refund: '<span class="badge badge-gray">استرجاع</span>',
      create: '<span class="badge badge-blue">رصيد افتتاحي</span>',
    }[t] || `<span class="badge badge-gray">${esc(t)}</span>`);
    const cols = [
      { k: 'created_at', label: 'التاريخ والوقت', fmt: r => dateTimeFmt(r.created_at) },
      { k: 'ingredient_name', label: 'المادة', fmt: r => r.ingredient_name },
      { k: 'type', label: 'النوع', raw: true, fmt: r => typeLabel(r.type) },
      { k: 'delta', label: 'الكمية', cls: 'num', raw: true, fmt: r => `<span style="color:${r.delta >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:800">${r.delta >= 0 ? '+' : ''}${num(r.delta)}</span> ${esc(r.unit)}` },
      { k: 'quantity_after', label: 'الرصيد بعد الحركة', cls: 'num', fmt: r => `${num(r.quantity_after)} ${r.unit}` },
      { k: 'notes', label: 'ملاحظات', fmt: r => r.notes || '—' },
      { k: 'username', label: 'المستخدم', fmt: r => r.username || '—' },
    ];
    qs('#moves-table').innerHTML = tableHTML(cols, moves);
  }

  function renderSuppliers(box) {
    const cols = [
      { k: 'name', label: 'اسم المورد', raw: true, fmt: r => `<b>${esc(r.name)}</b>` },
      { k: 'phone', label: 'الهاتف', fmt: r => r.phone || '—' },
      { k: 'notes', label: 'ملاحظات', fmt: r => r.notes || '—' },
    ];
    if (canEdit) {
      cols.push({
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-edit="${r.id}" type="button">✏️ تعديل</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>`,
      });
    }
    box.innerHTML = `<div class="card-body">${tableHTML(cols, suppliers)}</div>`;
    if (canEdit) {
      box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openSupplier(Number(b.dataset.edit)));
      box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const s = suppliers.find(x => x.id === Number(b.dataset.del));
        if (!await confirmDlg(`حذف المورد "${s.name}"؟`)) return;
        try { await api(`/suppliers/${s.id}`, { method: 'DELETE' }); await loadAll(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  }

  function supplierOptions(selected) {
    return `<option value="">بدون مورد</option>` +
      suppliers.map(s => `<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  function openIngredient(id) {
    const ex = id ? ingredients.find(i => i.id === id) : null;
    const m = openModal({
      title: ex ? `تعديل: ${ex.name}` : 'مادة خام جديدة',
      body: `
        <div class="field"><label>الاسم *</label><input class="input" id="i-name" value="${esc(ex?.name || '')}"></div>
        <div class="form-grid">
          <div class="field"><label>وحدة القياس *</label>
            <select class="select" id="i-unit">
              ${['جم', 'كجم', 'مل', 'لتر', 'قطعة', 'علبة', 'كرتونة'].map(u => `<option ${ex?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select></div>
          <div class="field"><label>سعر الشراء (ج.م للوحدة) *</label>
            <input class="input" id="i-price" type="number" min="0" step="any" value="${ex?.purchase_price ?? ''}"></div>
          <div class="field"><label>${ex ? 'الكمية الحالية (عدّلها من التسوية)' : 'الكمية الافتتاحية'}</label>
            <input class="input" id="i-qty" type="number" step="any" value="${ex?.quantity ?? 0}" ${ex ? 'disabled' : ''}></div>
          <div class="field"><label>الحد الأدنى للمخزون</label>
            <input class="input" id="i-min" type="number" min="0" step="any" value="${ex?.min_stock ?? 0}"></div>
          <div class="field"><label>المورد</label>
            <select class="select" id="i-sup">${supplierOptions(ex?.supplier_id)}</select>
            <div class="hint">أضف موردين من تبويب "الموردون"</div></div>
          <div class="field"><label>الحالة</label>
            <select class="select" id="i-active">
              <option value="1" ${!ex || ex.active ? 'selected' : ''}>نشط</option>
              <option value="0" ${ex && !ex.active ? 'selected' : ''}>موقوف</option>
            </select></div>
        </div>`,
      footer: `<button class="btn btn-primary" id="i-save" type="button">💾 حفظ</button>
               <button class="btn" id="i-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#i-cancel').onclick = () => m.close();
    m.foot.querySelector('#i-save').onclick = async () => {
      const body = {
        name: m.body.querySelector('#i-name').value.trim(),
        unit: m.body.querySelector('#i-unit').value,
        purchase_price: Number(m.body.querySelector('#i-price').value),
        quantity: Number(m.body.querySelector('#i-qty').value),
        min_stock: Number(m.body.querySelector('#i-min').value),
        supplier_id: m.body.querySelector('#i-sup').value ? Number(m.body.querySelector('#i-sup').value) : null,
        active: m.body.querySelector('#i-active').value === '1',
      };
      if (!body.name) return toast('اكتب اسم المادة', 'error');
      if (!Number.isFinite(body.purchase_price) || body.purchase_price < 0) return toast('سعر الشراء غير صحيح', 'error');
      try {
        if (id) await api(`/ingredients/${id}`, { method: 'PUT', body });
        else await api('/ingredients', { method: 'POST', body });
        toast('تم الحفظ', 'success');
        m.close();
        await loadAll();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  function openAdjust(id) {
    const ing = ingredients.find(i => i.id === id);
    const m = openModal({
      title: `تسوية مخزون: ${ing.name}`,
      body: `
        <div class="kv"><span>الكمية الحالية</span><b>${num(ing.quantity)} ${esc(ing.unit)}</b></div>
        <div class="field" style="margin-top:14px">
          <label>التغيير (+ للإضافة / − للخصم)</label>
          <input class="input" id="a-delta" type="number" step="any" placeholder="مثال: 50 أو -20">
        </div>
        <div class="field"><label>سبب التسوية</label><input class="input" id="a-notes" placeholder="مثال: فاقد، تبديد، جرد..."></div>`,
      footer: `<button class="btn btn-primary" id="a-save" type="button">حفظ التسوية</button>
               <button class="btn" id="a-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#a-cancel').onclick = () => m.close();
    m.foot.querySelector('#a-save').onclick = async () => {
      const delta = Number(m.body.querySelector('#a-delta').value);
      if (!delta) return toast('أدخل كمية التغيير', 'error');
      try {
        await api('/inventory/adjust', {
          method: 'POST',
          body: { ingredient_id: id, delta, notes: m.body.querySelector('#a-notes').value.trim() },
        });
        toast('تمت التسوية', 'success');
        m.close();
        await loadAll();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  function openSupplier(id) {
    const ex = id ? suppliers.find(s => s.id === id) : null;
    const m = openModal({
      title: ex ? 'تعديل المورد' : 'مورد جديد',
      body: `
        <div class="field"><label>اسم المورد *</label><input class="input" id="s-name" value="${esc(ex?.name || '')}"></div>
        <div class="field"><label>الهاتف</label><input class="input" id="s-phone" value="${esc(ex?.phone || '')}"></div>
        <div class="field"><label>ملاحظات</label><textarea class="textarea" id="s-notes">${esc(ex?.notes || '')}</textarea></div>`,
      footer: `<button class="btn btn-primary" id="s-save" type="button">💾 حفظ</button>
               <button class="btn" id="s-cancel" type="button">إلغاء</button>`,
    });
    m.foot.querySelector('#s-cancel').onclick = () => m.close();
    m.foot.querySelector('#s-save').onclick = async () => {
      const body = {
        name: m.body.querySelector('#s-name').value.trim(),
        phone: m.body.querySelector('#s-phone').value.trim(),
        notes: m.body.querySelector('#s-notes').value.trim(),
      };
      if (!body.name) return toast('اكتب اسم المورد', 'error');
      try {
        if (id) await api(`/suppliers/${id}`, { method: 'PUT', body });
        else await api('/suppliers', { method: 'POST', body });
        m.close();
        await loadAll();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  qs('#inv-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    tab = btn.dataset.t;
    qs('#inv-tabs').querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    render();
  });

  loadAll();
}
