/**
 * خانات الأرقام (input type=number/date/time) يرسمها المتصفح بأرقام لغة الصفحة (عربي ← ١٢٣).
 * نجعلها دائماً بالأرقام الإنجليزية 123 مثل باقي البرنامج وإعدادات الويندوز.
 */
const SEL = 'input[type="number"], input[type="date"], input[type="time"], input[type="datetime-local"], input[type="month"]';

function fix(root: ParentNode | Element) {
  if (root instanceof HTMLInputElement) { if (root.matches(SEL) && root.lang !== 'en') root.lang = 'en'; return; }
  if (!('querySelectorAll' in root)) return;
  root.querySelectorAll<HTMLInputElement>(SEL).forEach((el) => { if (el.lang !== 'en') el.lang = 'en'; });
}

export function installLatinDigits() {
  if (typeof document === 'undefined') return;
  fix(document);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') fix(m.target as Element);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 1) fix(n as Element); });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['type'] });
}
