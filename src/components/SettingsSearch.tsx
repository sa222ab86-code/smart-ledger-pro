import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

/**
 * بحث في صفحة الإعدادات مع قائمة منسدلة: يجمع عناوين الإعدادات من الصفحة نفسها
 * (.setting-block وعناوين h3)، والنقر على نتيجة يمرّر إليها ويُبرزها.
 */
interface Item { title: string; el: HTMLElement; text: string }

function collect(rootId: string): Item[] {
  const root = document.getElementById(rootId);
  if (!root) return [];
  const out: Item[] = [];
  root.querySelectorAll<HTMLElement>('.setting-block').forEach((el) => {
    const t = el.querySelector('p.font-bold')?.textContent?.trim();
    if (t) out.push({ title: t, el, text: el.textContent || t });
  });
  root.querySelectorAll<HTMLElement>('h3').forEach((h) => {
    const t = h.textContent?.trim();
    const card = (h.closest('.rounded-2xl') as HTMLElement) || h;
    if (t) out.push({ title: t, el: card, text: t });
  });
  return out;
}

export default function SettingsSearch({ rootId }: { rootId: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setItems(collect(rootId)); }, [open, rootId]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  // البحث في العنوان ومحتوى الإعداد (مثل «تحويل» داخل أزرار الدفع)
  const list = items.filter((i) => !q.trim() || norm(i.text).includes(norm(q.trim())));
  useEffect(() => { setHi(0); }, [q]);

  const go = (i: Item) => {
    setOpen(false); setQ('');
    i.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    i.el.classList.add('setting-flash');
    setTimeout(() => i.el.classList.remove('setting-flash'), 1800);
  };

  return (
    <div ref={box} className="relative w-full sm:w-80" data-testid="settings-search">
      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus-within:border-cyan-500">
        <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Enter' && list[hi]) go(list[hi]);
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="ابحث في الإعدادات…" className="flex-1 min-w-0 bg-transparent py-2.5 text-sm font-bold outline-none" />
        <button type="button" onClick={() => setOpen((o) => !o)} title="كل الإعدادات" data-testid="settings-search-toggle"
          className="px-2.5 py-2 text-slate-500 hover:text-cyan-600"><ChevronDown className={`w-5 h-5 transition ${open ? 'rotate-180' : ''}`} /></button>
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl" data-testid="settings-search-list">
          {list.length === 0 && <div className="px-4 py-3 text-sm text-slate-500 font-bold">لا توجد نتائج</div>}
          {list.map((i, idx) => (
            <button key={`${i.title}-${idx}`} type="button" onMouseEnter={() => setHi(idx)} onClick={() => go(i)}
              className={`w-full text-right px-4 py-2.5 text-sm font-bold border-b border-slate-100 dark:border-slate-800 last:border-0 ${idx === hi ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {i.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
