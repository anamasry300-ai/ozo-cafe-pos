import { esc } from './js/ui.js';

const $ = sel => document.querySelector(sel);

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

  function productCard(p) {
    const img = p.image
      ? `<img class="m-pimg" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<div class="m-pimg m-ph">${esc((p.name || '?').charAt(0))}</div>`;
    return `
      <div class="m-item">
        ${img}
        <div class="m-pinfo">
          <div class="m-pname">${esc(p.name)}</div>
          ${p.description ? `<div class="m-pdesc">${esc(p.description)}</div>` : ''}
        </div>
        <div class="m-price">${p.price.toFixed(p.price % 1 ? 2 : 0)} <span>ج.م</span></div>
      </div>`;
  }

  function renderChips(activeCat) {
    $('#m-chips').innerHTML = [{ id: null, name: 'الكل' }, ...data.categories].map(c => `
      <button class="m-chip ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id ?? ''}" type="button">${esc(c.name)}</button>
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
          <h2 class="m-cat">${esc(c.name)}</h2>
          ${filtered.length ? `<div class="m-grid">${filtered.map(productCard).join('')}</div>`
                            : '<div class="m-sec-empty">لا توجد أصناف مطابقة</div>'}
        </section>`;
    }).join('');
    $('#m-main').innerHTML = sections;
  }

  renderChips(null);
  renderSections(null);
  $('#m-search').addEventListener('input', () => renderSections(null));
}

boot();