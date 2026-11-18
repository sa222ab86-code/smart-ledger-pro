/**
 * لغة الواجهة الثانية (English) — ترجمة وقت التشغيل:
 * الكود والنصوص تبقى بالعربية، وعند اختيار الإنجليزية يُترجم كل نص ظاهر في الصفحة من القاموس (en.json)
 * ويُراقَب أي نص جديد فيُترجم فوراً. الرجوع للعربية يعيد النصوص الأصلية.
 * الفواتير والإيصالات المطبوعة تبقى عربية: كل عنصر عليه translate="no" أو data-no-translate لا يُلمس.
 */
import dict from './en.json';

export type UiLang = 'ar' | 'en';

const AR = /[؀-ۿ]/;
const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string }[] = [];
let built = false;
function build() {
  if (built) return;
  built = true;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [ar, en] of Object.entries(dict as Record<string, string>)) {
    if (/\{\d\}/.test(ar)) {
      const parts = ar.split(/(\{\d\})/);
      let re = '^';
      const order: number[] = [];
      for (const p of parts) {
        const m = p.match(/^\{(\d)\}$/);
        if (m) { re += '([\\s\\S]+?)'; order.push(+m[1]); } else re += esc(p);
      }
      // ترتيب المجموعات قد يختلف عن ترتيب {n} في النص العربي
      let out = en;
      order.forEach((n, gi) => { out = out.split(`{${n}}`).join(`\u0000${gi + 1}\u0000`); });
      patterns.push({ re: new RegExp(re + '$'), out });
    } else exact.set(ar, en);
  }
  // الأطول أولاً (الأكثر تحديداً)
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
}

const cache = new Map<string, string>();
/** ترجمة نص واحد (يحافظ على المسافات حوله). يعيد النص نفسه إن لم يوجد له مقابل. */
export function tr(s: string): string {
  if (!s || !AR.test(s)) return s;
  const c = cache.get(s);
  if (c !== undefined) return c;
  build();
  const lead = s.match(/^\s*/)![0], trail = s.match(/\s*$/)![0];
  const core = s.trim().replace(/\s+/g, ' ');
  let out = translateCore(core, 0);
  out = out === core ? s : lead + out + trail;
  if (cache.size > 20000) cache.clear();
  cache.set(s, out);
  return out;
}

function translateCore(t: string, depth: number): string {
  const e = exact.get(t);
  if (e !== undefined) return e;
  // علامة ترقيم في الآخر: «الإجمالي:» ← «Total:»
  const pm = t.match(/^(.*?)([:：.!؟?،]+)$/);
  if (pm && pm[1]) { const b = exact.get(pm[1].trim()); if (b !== undefined) return b + pm[2].replace('؟', '?').replace('،', ','); }
  if (depth > 2) return t;
  for (const p of patterns) {
    const m = t.match(p.re);
    if (!m) continue;
    let out = p.out;
    for (let i = 1; i < m.length; i++) out = out.split(`\u0000${i}\u0000`).join(AR.test(m[i]) ? translateCore(m[i].trim(), depth + 1) : m[i]);
    return out;
  }
  return t;
}

/* ------------------------------------------------------------------ */
let lang: UiLang = 'ar';
let observer: MutationObserver | null = null;
const origText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

const skipped = (el: Element | null): boolean => {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (e.getAttribute('translate') === 'no' || e.hasAttribute('data-no-translate') || e.id === 'printable-invoice-body') return true;
    if ((e as HTMLElement).isContentEditable) return true;
  }
  return false;
};

function doText(n: Text) {
  const v = n.nodeValue || '';
  if (!AR.test(v)) return;
  if (skipped(n.parentElement)) return;
  const t = tr(v);
  if (t !== v) { origText.set(n, v); n.nodeValue = t; }
}
function doAttrs(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !AR.test(v)) continue;
    const t = tr(v);
    if (t !== v) { const rec = origAttr.get(el) || {}; rec[a] = v; origAttr.set(el, rec); el.setAttribute(a, t); }
  }
  if (el.getAttribute('dir') === 'rtl' && !skipped(el)) { const rec = origAttr.get(el) || {}; rec.dir = 'rtl'; origAttr.set(el, rec); el.setAttribute('dir', 'ltr'); }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  doAttrs(el);
  const it = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (SKIP_TAGS.has(e.tagName) || e.getAttribute('translate') === 'no' || e.hasAttribute('data-no-translate') || e.id === 'printable-invoice-body') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null = it.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element);
    n = it.nextNode();
  }
}

function restoreAll() {
  const it = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null = it.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) { const o = origText.get(n as Text); if (o !== undefined) { (n as Text).nodeValue = o; origText.delete(n as Text); } }
    else { const rec = origAttr.get(n as Element); if (rec) { for (const [a, v] of Object.entries(rec)) (n as Element).setAttribute(a, v); origAttr.delete(n as Element); } }
    n = it.nextNode();
  }
}

export const getLanguage = () => lang;

export function setLanguage(next: UiLang) {
  if (next === lang && (next === 'ar' || observer)) return;
  lang = next;
  const html = document.documentElement;
  if (next === 'en') {
    html.lang = 'en'; html.dir = 'ltr';
    walk(document.body);
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
        else m.addedNodes.forEach((n) => walk(n));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'dir'] });
  } else {
    observer?.disconnect(); observer = null;
    html.lang = 'ar'; html.dir = 'rtl';
    restoreAll();
  }
}

/** رسائل alert/confirm/prompt */
export const trMsg = (m: unknown) => (lang === 'en' && typeof m === 'string' ? m.split('\n').map(tr).join('\n') : m);
