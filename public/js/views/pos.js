import { api } from '../api.js';
import { esc, money, num, openModal, toast, confirmDlg, receiptHTML, printHTML, qs } from '../ui.js';

export function renderPOS(root) {
  let categories = [];
  let products = [];
  let cart = [];
  let activeCat = 0;
  let search = '';
  let discount = 0;
  let fees = 0;
  let payment = 'cash';
  let orderNote = '';
  let settings = {};
  let nextInvoice = '';

  root.innerHTML = `
    <div class="pos">
      <div class="pos-catalog">
        <div class="pos-toolbar">
          <input class="input" id="pos-search" type="search" placeholder="🔍 ابحث عن صنف..." autocomplete="off">
        </div>
        <div class="chips" id="pos-chips"></div>
        <div class="product-grid" id="pos-grid"></div>
      </div>

      <div class="pos-order" id="pos-order">
        <div class="order-head">
          <h3>🛒 الطلب الحالي</h3>
          <span class="badge badge-teal" id="inv-no"></span>
          <button class="btn btn-sm btn-ghost" id="btn-clear" type="button">تفريغ</button>
          <button class="btn btn-sm btn-ghost no-print" id="btn-close-order" type="button" style="display:none">✕</button>
        </div>
        <div class="order-items" id="order-items"></div>
        <div class="order-summary">
          <div class="sum-row"><span>الإجمالي الفرعي</span><b id="sum-sub" class="num">0.00 ج.م</b></div>
          <div class="sum-row"><span>الخصم (ج.م)</span><input class="sum-input" id="in-discount" type="number" min="0" step="0.5" value="0"></div>
          <div class="sum-row"><span>رسوم إضافية (ج.م)</span><input class="sum-input" id="in-fees" type="number" min="0" step="0.5" value="0"></div>
          <div class="sum-row total"><span>الإجمالي</span><span id="sum-total" class="num">0.00 ج.م</span></div>
          <div class="pay-methods">
            <button class="pay-btn active" data-method="cash" type="button">نقدي</button>
            <button class="pay-btn" data-method="card" type="button">بطاقة</button>
            <button class="pay-btn" data-method="transfer" type="button">تحويل</button>
            <button class="pay-btn" data-method="other" type="button">أخرى</button>
          </div>
          <input class="input input-sm" id="in-note" placeholder="ملاحظة على الطلب (اختياري)" style="margin-bottom:10px">
          <button class="btn btn-success btn-lg btn-block" id="btn-checkout" type="button">✓ إتمام البيع</button>
        </div>
      </div>

      <button class="pos-mobile-bar" id="mobile-bar" type="button">
        <span id="mb-count">الطلب (0)</span>
        <span id="mb-total">0.00 ج.م</span>
        <span>عرض ⬆</span>
      </button>
    </div>`;

  // ---------- data ----------
  async function load() {
    try {
      const [cats, prods, st, nxt] = await Promise.all([
        api('/categories'),
        api('/pos/products'),
        api('/settings'),
        api('/sales/next-invoice'),
      ]);
      categories = cats.filter(c => c.active);
      products = prods;
      settings = st;
      nextInvoice = nxt.invoice_no;
      qs('#inv-no').textContent = nextInvoice;
      renderChips();
      renderGrid();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- catalog ----------
  function renderChips() {
    const el = qs('#pos-chips');
    el.innerHTML = `<button class="chip ${activeCat === 0 ? 'active' : ''}" data-cat="0" type="button">الكل</button>` +
      categories.map(c => `<button class="chip ${activeCat === c.id ? 'active' : ''}" data-cat="${c.id}" type="button">${esc(c.name)}</button>`).join('');
    el.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
      activeCat = Number(btn.dataset.cat);
      renderChips();
      renderGrid();
    }));
  }

  function renderGrid() {
    const el = qs('#pos-grid');
    const q = search.trim();
    const list = products.filter(p =>
      (activeCat === 0 || p.category_id === activeCat) &&
      (!q || p.name.includes(q) || (p.description || '').includes(q))
    );
    if (!list.length) {
      el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>لا توجد أصناف مطابقة</div>`;
      return;
    }
    el.innerHTML = list.map(p => `
      <button class="p-tile" data-id="${p.id}" type="button">
        <div class="p-img">${p.image ? `<img src="${p.image}" alt="">` : esc(p.name.charAt(0))}</div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-price">${num(p.price, p.price % 1 ? 2 : 0)} ج.م</div>
      </button>`).join('');
    el.querySelectorAll('.p-tile').forEach(tile => {
      tile.addEventListener('click', () => addToCart(Number(tile.dataset.id)));
    });
  }

  // ---------- cart ----------
  function addToCart(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const found = cart.find(c => c.product_id === id);
    if (found) found.quantity += 1;
    else cart.push({ product_id: p.id, name: p.name, price: p.price, quantity: 1, note: '' });
    renderCart();
  }

  function changeQty(id, delta) {
    const item = cart.find(c => c.product_id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) cart = cart.filter(c => c.product_id !== id);
    renderCart();
  }

  function removeItem(id) {
    cart = cart.filter(c => c.product_id !== id);
    renderCart();
  }

  function itemNote(id) {
    const item = cart.find(c => c.product_id === id);
    if (!item) return;
    const m = openModal({
      title: 'ملاحظة على الصنف',
      body: `<div class="field"><label>${esc(item.name)}</label>
             <textarea class="textarea" id="item-note-input" placeholder="مثال: بدون حار، زيادة صوص...">${esc(item.note)}</textarea></div>`,
      footer: `<button class="btn btn-primary" id="save-note">حفظ</button><button class="btn" id="cancel-note">إلغاء</button>`,
    });
    m.foot.querySelector('#save-note').addEventListener('click', () => {
      item.note = m.body.querySelector('#item-note-input').value.trim();
      m.close();
      renderCart();
    });
    m.foot.querySelector('#cancel-note').addEventListener('click', () => m.close());
  }

  function totals() {
    const sub = cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const d = Math.min(Math.max(discount, 0), sub);
    const f = Math.max(fees, 0);
    return { sub: Math.round(sub * 100) / 100, d, f, total: Math.round((sub - d + f) * 100) / 100 };
  }

  function renderCart() {
    const box = qs('#order-items');
    if (!cart.length) {
      box.innerHTML = `<div class="empty"><div class="big">🧺</div><div>الطلب فارغ</div><div style="font-size:13px">اضغط على أي صنف لإضافته</div></div>`;
    } else {
      box.innerHTML = cart.map(c => `
        <div class="o-item">
          <div class="o-item-top">
            <span class="o-item-name">${esc(c.name)}</span>
            <button class="o-note-btn" data-note="${c.product_id}" title="ملاحظة">📝</button>
            <button class="o-del" data-del="${c.product_id}" title="حذف">🗑</button>
          </div>
          ${c.note ? `<div class="o-item-note">${esc(c.note)}</div>` : ''}
          <div class="o-item-bot">
            <span class="muted num">${num(c.price, c.price % 1 ? 2 : 0)} ج.م</span>
            <div class="qty-ctl">
              <button class="qty-btn" data-plus="${c.product_id}" type="button">+</button>
              <span class="qty-val">${c.quantity}</span>
              <button class="qty-btn" data-minus="${c.product_id}" type="button">−</button>
            </div>
            <span class="o-line-total">${money(c.price * c.quantity)}</span>
          </div>
        </div>`).join('');
      box.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => changeQty(Number(b.dataset.plus), 1));
      box.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => changeQty(Number(b.dataset.minus), -1));
      box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => removeItem(Number(b.dataset.del)));
      box.querySelectorAll('[data-note]').forEach(b => b.onclick = () => itemNote(Number(b.dataset.note)));
    }

    const t = totals();
    qs('#sum-sub').textContent = money(t.sub);
    qs('#sum-total').textContent = money(t.total);
    qs('#mb-count').textContent = `الطلب (${cart.length})`;
    qs('#mb-total').textContent = money(t.total);
    const inv = qs('#inv-no');
    if (inv) inv.textContent = nextInvoice;
  }

  // ---------- checkout ----------
  async function checkout() {
    if (!cart.length) return toast('الطلب فارغ، أضف أصنافًا أولًا', 'error');
    const t = totals();
    const btn = qs('#btn-checkout');
    btn.disabled = true;
    try {
      const sale = await api('/sales', {
        method: 'POST',
        body: {
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, note: c.note })),
          discount: t.d,
          extra_fees: t.f,
          payment_method: payment,
          notes: qs('#in-note').value.trim(),
        },
      });
      cart = [];
      discount = 0;
      fees = 0;
      orderNote = '';
      qs('#in-discount').value = '0';
      qs('#in-fees').value = '0';
      qs('#in-note').value = '';
      renderCart();
      const nxt = await api('/sales/next-invoice');
      nextInvoice = nxt.invoice_no;
      qs('#inv-no').textContent = nextInvoice;
      closeMobileOrder();
      showReceipt(sale);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function showReceipt(sale) {
    const html = receiptHTML(sale, settings);
    const m = openModal({
      title: `تم البيع بنجاح — ${sale.invoice_no}`,
      wide: true,
      body: `<div style="max-width:380px;margin:0 auto">${html}</div>`,
      footer: `
        <button class="btn btn-primary" id="r-print">🖨 طباعة الفاتورة</button>
        <button class="btn btn-success" id="r-new">+ بيع جديد</button>
        <button class="btn" id="r-close">إغلاق</button>`,
    });
    m.foot.querySelector('#r-print').addEventListener('click', () => printHTML(html));
    m.foot.querySelector('#r-new').addEventListener('click', () => m.close());
    m.foot.querySelector('#r-close').addEventListener('click', () => m.close());
    toast(`تم تسجيل الفاتورة ${sale.invoice_no} بإجمالي ${money(sale.total)}`, 'success');
  }

  function closeMobileOrder() {
    const order = qs('#pos-order');
    if (order) order.classList.remove('open');
  }

  // ---------- events ----------
  qs('#pos-search').addEventListener('input', e => { search = e.target.value; renderGrid(); });
  qs('#in-discount').addEventListener('input', e => { discount = Number(e.target.value) || 0; renderCart(); });
  qs('#in-fees').addEventListener('input', e => { fees = Number(e.target.value) || 0; renderCart(); });
  qs('#in-note').addEventListener('input', e => { orderNote = e.target.value; });
  qs('#btn-checkout').addEventListener('click', checkout);

  qs('#btn-clear').addEventListener('click', async () => {
    if (!cart.length) return;
    if (await confirmDlg('هل تريد تفريغ الطلب بالكامل؟')) {
      cart = [];
      discount = 0;
      fees = 0;
      qs('#in-discount').value = '0';
      qs('#in-fees').value = '0';
      renderCart();
    }
  });

  document.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', () => {
    payment = b.dataset.method;
    document.querySelectorAll('.pay-btn').forEach(x => x.classList.toggle('active', x === b));
  }));

  qs('#mobile-bar').addEventListener('click', () => qs('#pos-order').classList.toggle('open'));
  qs('#btn-close-order').addEventListener('click', closeMobileOrder);

  // init
  discount = 0;
  fees = 0;
  renderCart();
  load();
}
