/**
 * الباركود على الشاشة: عرض كل خط = عدد صحيح من بكسلات الشاشة.
 * بالمقاس بالمم يكون الخط 1.25 بكسل مثلاً فتُرسم الخطوط بعروض غير متساوية وتبدو «ترتعش».
 * يُطبَّق على الشاشة فقط (CSS ‎@media screen) — الطباعة وPDF تبقى بالمقاس بالمم.
 */
let queued = false;

export function snapBarcodes(root: ParentNode = document) {
  const dpr = window.devicePixelRatio || 1;
  root.querySelectorAll<HTMLElement>('[data-bc-modules]').forEach((el) => {
    const m = Number(el.dataset.bcModules) || 0;
    if (!m) return;
    el.style.removeProperty('--bcw');
    const natural = parseFloat(getComputedStyle(el).width) || 0;
    if (natural <= 0) return;
    const k = Math.max(1, Math.round((natural * dpr) / m));
    el.style.setProperty('--bcw', `${(k * m) / dpr}px`);
  });
}

const schedule = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; try { snapBarcodes(); } catch { /* */ } });
};

export function installBarcodeSnap() {
  if (typeof document === 'undefined') return;
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of Array.from(m.addedNodes)) {
      if (n.nodeType === 1 && ((n as Element).matches?.('[data-bc-modules]') || (n as Element).querySelector?.('[data-bc-modules]'))) { schedule(); return; }
    }
  }).observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('resize', schedule);
  schedule();
}

/** نسخة المستند للطباعة: تُزال قيم الشاشة فيعود الباركود لمقاسه بالمم */
export function unsnapClone(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-bc-modules]').forEach((el) => el.style.removeProperty('--bcw'));
}
