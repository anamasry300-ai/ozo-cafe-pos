import { api, isAdmin } from '../api.js';
import { esc, money, num, qs, openModal, confirmDlg, toast, tableHTML } from '../ui.js';

export function renderProducts(root) {
  const canEdit = isAdmin();
  let products = [];
  let categories = [];
  let ingredients = [];
  let q = '';
  let catFilter = 0;

  root.innerHTML = `
    <div class="toolbar">
      <input class="input grow" id="f-search" type="search" placeholder="🔍 بحث في المنتجات...">
      <select class="select" id="f-cat"><option value="0">كل التصنيفات</option></select>
      <div style="flex:1"></div>
      ${canEdit ? `<button class="btn" id="btn-cat" type="button">+ تصنيف</button>` : ''}
      ${canEdit ? `<button class="btn btn-primary" id="btn-new" type="button">+ منتج جديد</button>` : ''}
    </div>
    <div class="card"><div class="card-body tight" id="table-box"><div class="empty">جارٍ التحميل...</div></div></div>`;

  async function load() {
    try {
      const [p, c, i] = await Promise.all([
        api(`/products?q=${encodeURIComponent(q)}${catFilter ? `&category_id=${catFilter}` : ''}`),
        api('/categories'),
        api('/ingredients?active_only=1'),
      ]);
      products = p;
      categories = c;
      ingredients = i;
      renderSelect();
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderSelect() {
    const sel = qs('#f-cat');
    const cur = catFilter;
    sel.innerHTML = `<option value="0">كل التصنيفات</option>` +
      categories.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}${c.active ? '' : ' (موقوف)'}</option>`).join('');
  }

  function renderTable() {
    const cols = [
      { k: 'image', label: '', cls: '', raw: true, fmt: r => r.image ? `<img src="${r.image}" style="width:38px;height:38px;border-radius:9px;object-fit:cover">` : `<div style="width:38px;height:38px;border-radius:9px;background:var(--primary-light);color:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:800">${esc(r.name.charAt(0))}</div>` },
      { k: 'name', label: 'المنتج', raw: true, fmt: r => `<b>${esc(r.name)}</b>${r.description ? `<div class="muted" style="font-size:12px">${esc(r.description)}</div>` : ''}` },
      { k: 'category_name', label: 'التصنيف', fmt: r => r.category_name || '—' },
      { k: 'price', label: 'السعر', cls: 'num', fmt: r => money(r.price) },
    ];
    if (canEdit) {
      cols.push(
        { k: 'cost', label: 'التكلفة', cls: 'num', fmt: r => `${money(r.cost)}${r.has_recipe ? ' <span class="badge badge-teal">وصفتك</span>' : ''}` },
        { k: 'margin', label: 'هامش الربح', cls: 'num', raw: true, fmt: r => `<span style="color:${r.margin >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(r.margin)}</span><div class="muted" style="font-size:11.5px">${num(r.margin_percent, 0)}%</div>` },
      );
    }
    cols.push({ k: 'active', label: 'الحالة', raw: true, fmt: r => r.active ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-gray">موقوف</span>' });
    if (canEdit) {
      cols.push({
        k: 'id', label: 'إجراءات', raw: true, cls: 'right', fmt: r => `
          <button class="btn btn-sm" data-edit="${r.id}" type="button">✏️ تعديل</button>
          <button class="btn btn-sm" data-toggle="${r.id}" type="button">${r.active ? '⏸ إيقاف' : '▶ تفعيل'}</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" type="button" style="color:var(--danger)">🗑</button>`,
      });
    }
    qs('#table-box').innerHTML = tableHTML(cols, products);

    if (canEdit) {
      qs('#table-box').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openProduct(Number(b.dataset.edit)));
      qs('#table-box').querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
        try { await api(`/products/${b.dataset.toggle}/toggle`, { method: 'PATCH' }); await load(); }
        catch (e) { toast(e.message, 'error'); }
      });
      qs('#table-box').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const p = products.find(x => x.id === Number(b.dataset.del));
        if (!await confirmDlg(`حذف المنتج "${p.name}"؟`)) return;
        try { await api(`/products/${p.id}`, { method: 'DELETE' }); toast('تم الحذف', 'success'); await load(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  }

  // ---------- category modal ----------
  function openCategories() {
    const m = openModal({
      title: 'التصنيفات',
      body: `
        <div id="cat-list">${categories.map(c => `
          <div class="list-row">
            <div class="grow"><b>${esc(c.name)}</b> <span class="muted" style="font-size:12px">(ترتيب ${c.sort_order})</span></div>
            <button class="btn btn-sm" data-cedit="${c.id}" type="button">تعديل</button>
            <button class="btn btn-sm btn-ghost" data-cdel="${c.id}" type="button" style="color:var(--danger)">حذف</button>
          </div>`).join('')}</div>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">
        <div class="field"><label>تصنيف جديد</label>
          <div style="display:flex;gap:8px">
            <input class="input" id="new-cat-name" placeholder="اسم التصنيف">
            <input class="input" id="new-cat-order" type="number" value="0" style="width:90px" title="الترتيب">
            <button class="btn btn-primary" id="add-cat" type="button">إضافة</button>
          </div>
        </div>`,
      footer: `<button class="btn" id="cat-close">إغلاق</button>`,
    });
    m.foot.querySelector('#cat-close').onclick = () => { m.close(); load(); };
    m.body.querySelector('#add-cat').onclick = async () => {
      const name = m.body.querySelector('#new-cat-name').value.trim();
      const sort = Number(m.body.querySelector('#new-cat-order').value) || 0;
      if (!name) return toast('اكتب اسم التصنيف', 'error');
      try {
        await api('/categories', { method: 'POST', body: { name, sort_order: sort } });
        categories = await api('/categories');
        m.close();
        openCategories();
        renderSelect();
      } catch (e) { toast(e.message, 'error'); }
    };
    m.body.querySelectorAll('[data-cedit]').forEach(b => b.onclick = async () => {
      const c = categories.find(x => x.id === Number(b.dataset.cedit));
      const name = prompt('اسم التصنيف:', c.name);
      if (name === null) return;
      try {
        await api(`/categories/${c.id}`, { method: 'PUT', body: { name, sort_order: c.sort_order, active: c.active } });
        categories = await api('/categories');
        m.close(); openCategories(); renderSelect();
      } catch (e) { toast(e.message, 'error'); }
    });
    m.body.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      const c = categories.find(x => x.id === Number(b.dataset.cdel));
      if (!await confirmDlg(`حذف التصنيف "${c.name}"؟ ستبقى المنتجات بدون تصنيف.`)) return;
      try {
        await api(`/categories/${c.id}`, { method: 'DELETE' });
        categories = await api('/categories');
        m.close(); openCategories(); renderSelect();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ---------- product modal ----------
  function openProduct(id = null) {
    const existing = id ? products.find(p => p.id === id) : null;
    let recipe = [];
    let image = existing ? existing.image : '';
    let recipeLoaded = !id;

    const m = openModal({
      title: existing ? `تعديل: ${existing.name}` : 'منتج جديد',
      wide: true,
      body: `
        <div class="form-grid">
          <div class="field"><label>اسم المنتج *</label><input class="input" id="p-name" value="${esc(existing?.name || '')}"></div>
          <div class="field"><label>التصنيف</label><select class="select" id="p-cat">
            <option value="">بدون تصنيف</option>
            ${categories.map(c => `<option value="${c.id}" ${existing?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label>السعر (ج.م) *</label><input class="input" id="p-price" type="number" min="0" step="0.5" value="${existing?.price ?? ''}"></div>
          <div class="field"><label>التكلفة اليدوية (ج.م)</label><input class="input" id="p-cost" type="number" min="0" step="0.01" value="${existing?.manual_cost ?? 0}" ${existing?.has_recipe ? 'disabled' : ''}>
            <div class="hint" id="cost-hint">${existing?.has_recipe ? 'التكلفة محسوبة تلقائيًا من الوصفة' : 'تُستخدم فقط إذا لم يكن للمنتج وصفة'}</div>
          </div>
        </div>
        <div class="field"><label>الوصف</label><textarea class="textarea" id="p-desc">${esc(existing?.description || '')}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>صورة المنتج</label>
            <input class="input" id="p-image" type="file" accept="image/*">
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
              <div id="p-preview" style="width:56px;height:56px;border-radius:10px;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center">
                ${image ? `<img src="${image}" style="width:100%;height:100%;object-fit:cover">` : '<span class="muted">لا صورة</span>'}
              </div>
              ${image ? '<button class="btn btn-sm" id="p-rmimg" type="button">حذف الصورة</button>' : ''}
            </div>
          </div>
          <div class="field"><label>الحالة</label>
            <select class="select" id="p-active">
              <option value="1" ${!existing || existing.active ? 'selected' : ''}>نشط (يظهر في الكاشير)</option>
              <option value="0" ${existing && !existing.active ? 'selected' : ''}>موقوف</option>
            </select>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:14px;margin-top:6px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <b>🧾 الوصفة والتكلفة</b>
            <span class="muted" style="font-size:12.5px">يتم حساب التكلفة من كميات المكوّنات × سعر الشراء</span>
          </div>
          <div id="recipe-rows"></div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-sm" id="add-recipe" type="button">+ إضافة مكوّن</button>
            <div style="flex:1"></div>
            <div style="font-weight:800" id="recipe-cost"></div>
          </div>
        </div>`,
      footer: `
        <button class="btn btn-primary" id="p-save" type="button">💾 حفظ</button>
        <button class="btn" id="p-cancel" type="button">إلغاء</button>`,
    });

    function renderRecipe() {
      const box = m.body.querySelector('#recipe-rows');
      if (!recipe.length) {
        box.innerHTML = `<div class="muted" style="font-size:13px;padding:6px 0">لا توجد مكوّنات — سيُستخدم الحقل "التكلفة اليدوية"</div>`;
      } else {
        box.innerHTML = recipe.map((r, idx) => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          const lineCost = ing ? ing.purchase_price * r.quantity : 0;
          return `
          <div class="list-row" data-row="${idx}">
            <select class="select input-sm" data-ing="${idx}" style="flex:2;min-width:0">
              ${ingredients.map(i => `<option value="${i.id}" ${i.id === r.ingredient_id ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('')}
            </select>
            <input class="input input-sm" data-qty="${idx}" type="number" min="0" step="any" value="${r.quantity}" style="flex:1;min-width:70px" title="الكمية">
            <span class="muted" style="font-size:12px;min-width:74px">${num(lineCost)} ج.م</span>
            <button class="o-del" data-rdel="${idx}" type="button">🗑</button>
          </div>`;
        }).join('');
      }
      const cost = recipe.reduce((s, r) => {
        const ing = ingredients.find(i => i.id === r.ingredient_id);
        return s + (ing ? ing.purchase_price * r.quantity : 0);
      }, 0);
      m.body.querySelector('#recipe-cost').innerHTML = recipe.length
        ? `تكلفة الوصفة: <span style="color:var(--primary)">${money(cost)}</span>`
        : '';
      box.querySelectorAll('[data-ing]').forEach(el => el.onchange = () => {
        recipe[Number(el.dataset.ing)].ingredient_id = Number(el.value);
        renderRecipe();
      });
      box.querySelectorAll('[data-qty]').forEach(el => el.oninput = () => {
        recipe[Number(el.dataset.qty)].quantity = Number(el.value) || 0;
        const idx = Number(el.dataset.qty);
        const ing = ingredients.find(i => i.id === recipe[idx].ingredient_id);
        const span = el.parentElement.querySelector('span');
        if (span && ing) span.textContent = num(ing.purchase_price * recipe[idx].quantity) + ' ج.م';
        updateCostHint();
      });
      box.querySelectorAll('[data-rdel]').forEach(el => el.onclick = () => {
        recipe.splice(Number(el.dataset.rdel), 1);
        renderRecipe();
      });
      updateCostHint();
    }

    function updateCostHint() {
      const hasRecipe = recipe.length > 0;
      const costField = m.body.querySelector('#p-cost');
      costField.disabled = hasRecipe;
      m.body.querySelector('#cost-hint').textContent = hasRecipe
        ? 'التكلفة محسوبة تلقائيًا من الوصفة'
        : 'تُستخدم فقط إذا لم يكن للمنتج وصفة';
    }

    async function loadRecipe() {
      if (recipeLoaded) return;
      try {
        const d = await api(`/products/${id}/recipe`);
        recipe = d.items.map(i => ({ ingredient_id: i.ingredient_id, quantity: i.quantity }));
      } catch (_) { recipe = []; }
      recipeLoaded = true;
      renderRecipe();
    }

    m.body.querySelector('#add-recipe').onclick = () => {
      if (!ingredients.length) return toast('أضف مواد خام أولًا من صفحة المخزون', 'error');
      recipe.push({ ingredient_id: ingredients[0].id, quantity: 1 });
      renderRecipe();
    };

    const fileInput = m.body.querySelector('#p-image');
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 2.5 * 1024 * 1024) return toast('حجم الصورة كبير (الحد 2.5 ميجا)', 'error');
      const reader = new FileReader();
      reader.onload = () => {
        image = reader.result;
        m.body.querySelector('#p-preview').innerHTML = `<img src="${image}" style="width:100%;height:100%;object-fit:cover">`;
        const rm = m.body.querySelector('#p-rmimg');
        if (rm) rm.style.display = '';
      };
      reader.readAsDataURL(file);
    };

    m.foot.querySelector('#p-cancel').onclick = () => m.close();

    m.foot.querySelector('#p-save').onclick = async () => {
      const name = m.body.querySelector('#p-name').value.trim();
      const price = Number(m.body.querySelector('#p-price').value);
      if (!name) return toast('اكتب اسم المنتج', 'error');
      if (!Number.isFinite(price) || price < 0) return toast('أدخل سعرًا صحيحًا', 'error');
      const body = {
        name,
        category_id: m.body.querySelector('#p-cat').value ? Number(m.body.querySelector('#p-cat').value) : null,
        price,
        manual_cost: Number(m.body.querySelector('#p-cost').value) || 0,
        description: m.body.querySelector('#p-desc').value.trim(),
        image,
        active: m.body.querySelector('#p-active').value === '1',
      };
      const btn = m.foot.querySelector('#p-save');
      btn.disabled = true;
      try {
        let pid = id;
        if (id) await api(`/products/${id}`, { method: 'PUT', body });
        else pid = (await api('/products', { method: 'POST', body })).id;
        await api(`/products/${pid}/recipe`, {
          method: 'PUT',
          body: { items: recipe.filter(r => r.ingredient_id && r.quantity > 0) },
        });
        toast('تم الحفظ بنجاح', 'success');
        m.close();
        await load();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    };

    renderRecipe();
    if (id) loadRecipe();
  }

  qs('#f-search').addEventListener('input', e => {
    q = e.target.value;
    clearTimeout(root._t);
    root._t = setTimeout(load, 220);
  });
  qs('#f-cat').addEventListener('change', e => { catFilter = Number(e.target.value); load(); });
  if (canEdit) {
    qs('#btn-new').onclick = () => openProduct(null);
    qs('#btn-cat').onclick = openCategories;
  }

  load();
}
