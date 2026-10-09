import { esc } from './js/ui.js';

const $ = sel => document.querySelector(sel);

const FOOD_ICONS = [
  [/صاروخ|صواريخ/, '🍟'],
  [/بطاطس|شيبس|شيبسي|فرايد أخضر/, '🍟'],
  [/برجر|برغر|هامبرغر/, '🍔'],
  [/بيتزا|بيتز/, '🍕'],
  [/شاورما|شاورمة/, '🌯'],
  [/دجاج|فرايد|كرسبي|ناجتس|ستربس/, '🍗'],
  [/ساندويتش|ساندوتش|توست|كلوب/, '🥪'],
  [/هوت ?دوج|هوتدوج/, '🌭'],
  [/سلطة|سلاط/, '🥗'],
  [/عصير|سموذي|فريش/, '🧃'],
  [/مشروب|مياه|ماء|كولا|بيبسي|سودا/, '🥤'],
  [/قهوة|قهوه|لاتيه|كابتشينو|إسبريسو|نسكافيه/, '☕'],
  [/شاي|شاى/, '🍵'],
  [/حلو|كيك|تورتة|تورت|بسكويت|دونات|وافل/, '🍰'],
  [/آيس|ايس|مثلجات|جيلاتي|شيك/, '🍦'],
  [/شوربة|شوربه|سوب/, '🍲'],
  [/كسكس|أرز|ارز|مكرونة|مكرونه|باستا/, '🍝'],
  [/فطير|فطائر|مشلتت|فطيرة/, '🥐'],
];
function foodIcon(name) {
  const n = String(name || '');
  for (const [re, ico] of FOOD_ICONS) if (re.test(n)) return ico;
  return '🍽️';
}
function catIcon(name) {
  const ico = foodIcon(name);
  return ico === '🍽️' ? (String(name || '').trim().charAt(0) || '📋') : ico;
}

async function boot() {
  let data;
  try {
    const r = await fetch('/api/menu');
    if (!r.ok) throw new Error(String(r.status));
    data = await r.json();
  } catch (e) {
    $('#m-main').innerHTML = '<div class="m-empty">تعذّر تحميل المنيو</div>';
    return;
  }

  const store = data.store || {};
  document.title = `المنيو | ${store.name || 'أوزو OZO'}`;
  $('#m-store').textContent = store.name || 'أوزو OZO';
  $('#m-sub').textContent = store.phone && store.address ? `📞 ${store.phone} · ${store.address}` : (store.phone ? `📞 ${store.phone}` : store.address || 'أهلاً بكم');
  $('#m-phone').textContent = store.phone ? `📞 ${store.phone}` : '';
  $('#m-address').textContent = store.address || '';
  $('#m-foot').style.display = (store.phone || store.address) ? 'block' : 'none';

  if (!data.categories.length) {
    $('#m-main').innerHTML = '<div class="m-empty">المنيو فارغ حاليًا</div>';
    return;
  }

  const q = () => ($('#m-search').value || '').trim().toLowerCase();
let waCart = [];
function waAddToCart(n, pv) {
  const x = waCart.find(i => i.name === n);
  if (x) x.qty++; else waCart.push({ name: n, price: pv, qty: 1 });
  waUpdateCart();
}
function waClearCart() { waCart = []; waUpdateCart(); }
function waUpdateCart() {
  const c = $('#wa-cart'), b = $('#wa-btn');
  if (!c || !b) return;
  if (!waCart.length) {
    c.innerHTML = ''; b.disabled = true;
    b.textContent = 'أرسل الطلب عبر واتساب';
    return;
  }
  let sum = 0, txt = '';
  for (const it of waCart) { sum += it.price * it.qty; txt += it.qty + ' × ' + it.name + '\n'; }
  c.innerHTML = '<div class="wa-cart-box">' + txt.replace(/\n/g, '<br>') + '<div class="wa-cart-total">الإجمالي: ' + sum.toFixed(sum % 1 ? 2 : 0) + ' ج.م</div></div>';
  b.disabled = false;
  const msg = encodeURIComponent('طلب من المنيو:\n' + waCart.map(i => i.qty + ' × ' + i.name + ' — ' + i.price.toFixed(2) + ' ج.م').join('\n') + '\n\nالإجمالي: ' + sum.toFixed(2) + ' ج.م');
  b.onclick = () => window.open('https://wa.me/201212255168?text=' + msg, '_blank');
}


  function productCard(p) {
    const img = p.image
      ? `<img class="m-pimg" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<div class="m-pimg m-ph"><span>${foodIcon(p.name)}</span></div>`;
    return `
      <div class="m-item">
        ${img}
        <div class="m-pinfo">
          <div class="m-pname">${esc(p.name)}</div>
          ${p.description ? `<div class="m-pdesc">${esc(p.description)}</div>` : ''}
        </div>
        <div class="m-side">
          <div class="m-price">${p.price.toFixed(p.price % 1 ? 2 : 0)} <span>ج.م</span></div>
          <button class="m-add" type="button" data-name="${esc(p.name)}" data-price="${p.price}">＋ إضافة</button>
        </div>
      </div>`;
  }

  function renderChips(activeCat) {
    $('#m-chips').innerHTML = [{ id: null, name: 'الكل' }, ...data.categories].map(c => `
      <button class="m-chip ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id ?? ''}" type="button"><span class="m-chip-ico">${c.id === null ? '🍽️' : catIcon(c.name)}</span>${esc(c.name)}</button>
    `).join('');
    $('#m-chips').querySelectorAll('.m-chip').forEach(b => b.onclick = () => {
      const id = b.dataset.cat;
      renderChips(id === '' ? null : Number(id));
      renderSections(id === '' ? null : Number(id));
    });
  }

  function renderSections(activeCat) {
    const cats = activeCat === null ? data.categories : data.categories.filter(c => c.id === activeCat);
    const term = q();
    const sections = cats.map(c => {
      const filtered = term ? c.products.filter(p =>
        p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term)) : c.products;
      return `
        <section class="m-sec">
          <h2 class="m-cat"><span class="m-cat-ico">${catIcon(c.name)}</span>${esc(c.name)}</h2>
          ${filtered.length ? `<div class="m-grid">${filtered.map(productCard).join('')}</div>`
                            : '<div class="m-sec-empty">لا توجد أصناف مطابقة</div>'}
        </section>`;
    }).join('');
    $('#m-main').innerHTML = sections;
    $('#m-main').querySelectorAll('.m-add').forEach(b => b.onclick = () => {
      waAddToCart(b.dataset.name, Number(b.dataset.price));
      b.classList.add('added');
      setTimeout(() => b.classList.remove('added'), 700);
    });
  }

  renderChips(null);
  renderSections(null);
  waUpdateCart();
  const qrImg = $('#m-qr');
  if (qrImg) qrImg.src = '/api/qr?data=' + encodeURIComponent(location.href);
  $('#m-search').addEventListener('input', () => renderSections(null));
}

boot();