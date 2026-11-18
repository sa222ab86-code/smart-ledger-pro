'use strict';
/* شاشة العميل: تعرض حالة السلة القادمة من نقطة البيع */
(function () {
  const $ = (id) => document.getElementById(id);
  const money = (n) => (Number(n) || 0).toFixed(2);
  let fontSet = false;

  function setText(id, v) { const el = $(id); if (el) el.textContent = v; }
  function setImg(id, src) { const el = $(id); if (!el) return; if (src) { el.src = src; el.hidden = false; } else el.hidden = true; }

  function render(s) {
    if (!s) return;
    if (s.fontCss && !fontSet) { $('font').textContent = s.fontCss; fontSet = true; }
    setText('co', s.company || '');
    setText('idleCo', s.company || '');
    setText('msg', s.message || 'أهلاً وسهلاً بكم');
    setImg('logo', s.logo);
    setImg('idleLogo', s.logo);
    setText('cur', s.currency || 'ر.س');

    document.body.className = s.mode === 'paid' ? 's-paid' : (s.items && s.items.length ? 's-cart' : 's-idle');

    const box = $('items');
    box.textContent = '';
    const items = (s.items || []).slice(-9);
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (i === items.length - 1 ? ' last' : '');
      const a = document.createElement('div');
      const n = document.createElement('div'); n.className = 'n'; n.textContent = it.name;
      const d = document.createElement('div'); d.className = 'd'; d.textContent = `${it.qty} × ${money(it.price)}`;
      a.append(n, d);
      const t = document.createElement('div'); t.className = 't'; t.textContent = money(it.total);
      row.append(a, t);
      box.append(row);
    });
    if (!items.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'السلة فارغة'; box.append(e); }

    setText('count', String(s.count || 0));
    setText('sub', money(s.subtotal));
    setText('vat', money(s.vat));
    setText('total', money(s.total));
    const dr = $('discRow'); if (dr) dr.hidden = !(s.discount > 0);
    setText('disc', money(s.discount));
    if (s.mode === 'paid') { setText('pTotal', money(s.paidTotal)); setText('pPaid', money(s.paid)); setText('pChange', money(s.change)); }
  }

  if (window.customerDisplay) window.customerDisplay.onState(render);
})();
