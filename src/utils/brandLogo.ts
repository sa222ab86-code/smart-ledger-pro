/**
 * توليد شعار رمزي (SVG) من اسم المنشأة ونوع نشاطها.
 * كل ضغطة على «توليد» تعطي شكلاً آخر (ختم دائري / درع / إطار حديث) — الاسم كاملاً في الشعار بلا حروف مقتطعة.
 * التصاميم بخطوط واضحة وخلفية بيضاء قدر الإمكان حتى تُطبع جيداً على الحرارية والأبيض والأسود.
 */
export type BrandActivity = 'restaurant' | 'retail' | 'grocery' | 'auto' | 'furniture' | 'electrical' | 'perfumes' | 'pharmacy' | 'metals' | 'other' | string;

export const BRAND_LOGO_VARIANTS = 3;

const PALETTE = ['#0f766e', '#1e3a8a', '#9f1239', '#047857', '#4338ca', '#b45309', '#334155', '#6d28d9'];
const LUX_PALETTE = ['#64748b', '#a16207', '#1f2937'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** رموز الشعار بخطوط (مربع 48×48) */
export type BrandIcon = 'cart' | 'dish' | 'wheel' | 'sofa' | 'bolt' | 'perfume' | 'ring' | 'diamond' | 'ingot' | 'cross' | 'store';

const ICONS: Record<BrandIcon, string> = {
  cart: '<path d="M4 8h6l5 22h22l5-16H13"/><circle cx="18" cy="38" r="3"/><circle cx="34" cy="38" r="3"/>',
  dish: '<path d="M6 34h36"/><path d="M10 34a14 14 0 0 1 28 0"/><path d="M24 20v-5"/><path d="M20 15h8"/><path d="M8 40h32"/>',
  wheel: '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="7"/><path d="M24 6v11M24 31v11M6 24h11M31 24h11"/>',
  sofa: '<path d="M9 22v-5a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v5"/><path d="M6 25a3 3 0 0 1 6 0v5h24v-5a3 3 0 0 1 6 0v9H6z"/><path d="M10 34v5M38 34v5"/>',
  // صاعقة (كهرباء) + قطرة (سباكة)
  bolt: '<path d="M20 5L8 26h9l-2 17 13-22h-9z"/><path d="M36 17c-5 7-7 10-7 14a7 7 0 0 0 14 0c0-4-2-7-7-14z"/>',
  perfume: '<path d="M19 5h10v6H19z"/><path d="M21 11v5M27 11v5"/><path d="M11 23a7 7 0 0 1 7-7h12a7 7 0 0 1 7 7v15a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4z"/><path d="M18 29h12"/><path d="M33 7l4-2M33 10h5"/>',
  // خاتم بفص — للفضة والمجوهرات والإكسسوار
  ring: '<circle cx="24" cy="31" r="12"/><circle cx="24" cy="31" r="8.5"/><path d="M18 9h12l4 5-10 7-10-7z"/><path d="M14 14h20"/><path d="M40 6l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"/>',
  diamond: '<path d="M14 9h20l9 11-19 21L5 20z"/><path d="M5 20h38"/><path d="M19 9l-4 11 9 21 9-21-4-11"/>',
  // سبائك — للمعادن
  ingot: '<path d="M3 41l4-10h14l4 10z"/><path d="M23 41l4-10h14l4 10z"/><path d="M13 29l4-10h14l4 10z"/><path d="M24 6v6M17 9l2.5 3M31 9l-2.5 3"/>',
  cross: '<path d="M19 8h10v11h11v10H29v11H19V29H8V19h11z"/>',
  store: '<path d="M6 18l4-10h28l4 10"/><path d="M6 18a6 6 0 0 0 12 0a6 6 0 0 0 12 0a6 6 0 0 0 12 0"/><path d="M9 24v16h30V24"/><path d="M20 40V30h8v10"/>',
};

/** الرموز المتاحة للاختيار في الإعدادات */
export const BRAND_ICONS: { id: BrandIcon; label: string }[] = [
  { id: 'ring', label: 'فضة ومجوهرات وإكسسوار' },
  { id: 'diamond', label: 'ألماس ومجوهرات' },
  { id: 'ingot', label: 'معادن' },
  { id: 'perfume', label: 'عطور' },
  { id: 'cart', label: 'تجزئة وبقالة' },
  { id: 'dish', label: 'مطعم ومقهى' },
  { id: 'wheel', label: 'سيارات وإطارات' },
  { id: 'sofa', label: 'أثاث' },
  { id: 'bolt', label: 'كهرباء وسباكة' },
  { id: 'cross', label: 'صيدلية' },
  { id: 'store', label: 'متجر عام' },
];

/** الرمز التلقائي حسب نوع النشاط */
export function activityIcon(activity: BrandActivity): BrandIcon {
  switch (activity) {
    case 'grocery': case 'retail': return 'cart';
    case 'restaurant': return 'dish';
    case 'auto': return 'wheel';
    case 'furniture': return 'sofa';
    case 'electrical': return 'bolt';
    case 'perfumes': return 'perfume';
    case 'pharmacy': return 'cross';
    case 'metals': return 'ingot';
    default: return 'store';
  }
}

const icon = (id: BrandIcon, cx: number, cy: number, size: number, color: string, sw = 3.4) => {
  const k = size / 48;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" fill="none" stroke="${color}" stroke-width="${(sw / k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ICONS.store}</g>`;
};

/** صورة صغيرة للرمز (لأزرار الاختيار) */
export function brandIconDataUrl(id: BrandIcon, color = '#0f766e'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><g fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** تقسيم الاسم لسطرين متوازنين إن كان طويلاً */
function splitName(name: string): string[] {
  const n = name.replace(/\s+/g, ' ').trim();
  if (n.length <= 11 || !n.includes(' ')) return [n];
  const words = n.split(' ');
  let best = [n, ''];
  let diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < diff) { diff = d; best = [a, b]; }
  }
  return best.filter(Boolean);
}

const AR_FONT = "'Segoe UI', Tahoma, Arial, sans-serif";
const fitSize = (text: string, width: number, max: number, min: number, factor: number) =>
  Math.max(min, Math.min(max, width / Math.max(1, text.length * factor)));

/** أسطر الاسم العربي متمركزة حول centerY */
function nameText(name: string, centerY: number, width: number, color: string, maxFs: number): { svg: string; bottom: number } {
  const lines = splitName(name);
  const fs = Math.min(...lines.map((l) => fitSize(l, width, maxFs, 13, 0.6)));
  const lh = fs * 1.18;
  const top = centerY - ((lines.length - 1) * lh) / 2;
  const svg = lines.map((l, i) =>
    `<text x="120" y="${(top + i * lh).toFixed(1)}" font-family="${AR_FONT}" font-size="${fs.toFixed(1)}" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="central" direction="rtl">${esc(l)}</text>`,
  ).join('');
  return { svg, bottom: top + (lines.length - 1) * lh + fs / 2 };
}

function enText(nameEn: string, y: number, width: number, color: string, min = 7): string {
  const t = nameEn.trim().toUpperCase();
  if (!t) return '';
  const fs = fitSize(t, width, 13, min, 0.68);
  return `<text x="120" y="${y.toFixed(1)}" font-family="'Segoe UI', Arial, sans-serif" font-size="${fs.toFixed(1)}" font-weight="700" letter-spacing="1" fill="${color}" text-anchor="middle" dominant-baseline="central" direction="ltr">${esc(t)}</text>`;
}

export function generateBrandLogo(o: { name: string; nameEn?: string; activity?: BrandActivity; icon?: BrandIcon | 'auto'; variant?: number }): string {
  const name = (o.name || '').trim() || 'متجري';
  const nameEn = (o.nameEn || '').trim();
  const activity: BrandIcon = o.icon && o.icon !== 'auto' && o.icon in ICONS ? o.icon : activityIcon(o.activity || 'other');
  const v = ((o.variant ?? 0) % BRAND_LOGO_VARIANTS + BRAND_LOGO_VARIANTS) % BRAND_LOGO_VARIANTS;
  // الفضة والمجوهرات والمعادن: ألوان فاخرة (فضي / ذهبي / فحمي)
  const pal = activity === 'ring' || activity === 'diamond' || activity === 'ingot' ? LUX_PALETTE : PALETTE;
  const c = pal[(hash(name) + v * (pal === PALETTE ? 3 : 1)) % pal.length];
  let body = '';

  if (v === 0) {
    // ختم دائري: حلقتان، أيقونة النشاط أعلى، الاسم في الوسط، فاصل ثم الاسم الإنجليزي
    const n = nameText(name, 132, 168, c, 34);
    const divY = Math.min(186, n.bottom + 14);
    body = `<circle cx="120" cy="120" r="112" fill="#fff" stroke="${c}" stroke-width="7"/>`
      + `<circle cx="120" cy="120" r="100" fill="none" stroke="${c}" stroke-width="1.6"/>`
      + icon(activity, 120, 66, 46, c)
      + n.svg
      + `<path d="M78 ${divY}h84" stroke="${c}" stroke-width="1.6"/><circle cx="70" cy="${divY}" r="2.6" fill="${c}"/><circle cx="170" cy="${divY}" r="2.6" fill="${c}"/>`
      + enText(nameEn, divY + 16, 132, c);
  } else if (v === 1) {
    // درع مملوء: أيقونة وكتابة بيضاء
    const n = nameText(name, 128, 140, '#fff', 30);
    body = `<path d="M120 12 L212 42 V116 C212 168 174 206 120 228 C66 206 28 168 28 116 V42 Z" fill="${c}"/>`
      + `<path d="M120 24 L200 50 V116 C200 161 167 194 120 214 C73 194 40 161 40 116 V50 Z" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.85"/>`
      + icon(activity, 120, 70, 44, '#fff')
      + n.svg
      + enText(nameEn, Math.min(184, n.bottom + 16), 100, '#fff', 5);
  } else {
    // إطار حديث: مربع بزوايا دائرية، شريط علوي ملوّن فيه الأيقونة، والاسم تحته
    const n = nameText(name, 150, 176, c, 32);
    body = `<rect x="10" y="10" width="220" height="220" rx="34" fill="#fff"/>`
      + `<path d="M10 44a34 34 0 0 1 34-34h152a34 34 0 0 1 34 34v52H10z" fill="${c}"/>`
      + `<rect x="10" y="10" width="220" height="220" rx="34" fill="none" stroke="${c}" stroke-width="6"/>`
      + icon(activity, 120, 56, 50, '#fff')
      + n.svg
      + enText(nameEn, Math.min(206, n.bottom + 18), 176, c);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
