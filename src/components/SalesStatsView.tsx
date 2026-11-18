import { useMemo, useState, type ReactNode } from 'react';
import { TrendingUp, Receipt, ShoppingBasket, Undo2, Wallet, Crown, Clock, Users, Coins } from 'lucide-react';
import type { Invoice, Product, ProductGroup } from '../types';
import { invoiceRemaining, isReturnDoc, round2, splitParts } from '../utils/invoiceMath';
import DatePeriodFilter, { inPeriod, type PeriodState } from './DatePeriodFilter';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

/**
 * الملخص: مبيعات الفترة (اليوم افتراضياً) — المؤشرات، المبيعات حسب الساعة،
 * الأصناف الأكثر مبيعاً، المجموعات، طرق الدفع، والكاشير.
 */
interface Props {
  invoices: Invoice[];
  products: Product[];
  groups: ProductGroup[];
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalesStatsView({ invoices, products, groups }: Props) {
  const [period, setPeriod] = useState<PeriodState>({ mode: 'today', from: '', to: '' });
  const [rankBy, setRankBy] = useState<'qty' | 'revenue'>('qty');

  const s = useMemo(() => {
    const docs = invoices.filter((i) => inPeriod(i.date, period));
    const sales = docs.filter((i) => !isReturnDoc(i));
    const returns = docs.filter(isReturnDoc);
    const net = round2(docs.reduce((t, i) => t + (Number(i.total) || 0), 0));
    const gross = round2(sales.reduce((t, i) => t + (Number(i.total) || 0), 0));
    const returned = round2(returns.reduce((t, i) => t + Math.abs(Number(i.total) || 0), 0));
    const discount = round2(sales.reduce((t, i) => t + (Number(i.discount) || 0), 0));
    const credit = round2(sales.reduce((t, i) => t + invoiceRemaining(i), 0));
    const byId = new Map(products.map((p) => [p.id, p]));
    const groupName = (id?: string) => groups.find((g) => g.id === id)?.nameAr || 'بدون مجموعة';

    // الأصناف: الكمية والإيراد (شامل) والتكلفة — المرتجع يُطرح
    const items = new Map<string, { name: string; qty: number; revenue: number; cost: number; group: string }>();
    const grp = new Map<string, number>();
    let qtyTotal = 0, costTotal = 0, netBeforeTax = 0;
    for (const inv of docs) {
      const ret = isReturnDoc(inv);
      netBeforeTax += Number(inv.subtotal) || 0;
      for (const it of inv.items || []) {
        const qty = Math.abs(Number(it.qty) || 0) * (ret ? -1 : 1);
        const total = Math.abs(Number(it.total) || 0) * (ret ? -1 : 1);
        const key = it.productId ? `${it.productId}|${it.name}` : it.name;
        const p = it.productId ? byId.get(it.productId) : undefined;
        const g = groupName(p?.groupId);
        const row = items.get(key) || { name: it.name, qty: 0, revenue: 0, cost: 0, group: g };
        row.qty += qty; row.revenue += total;
        const unitCost = it.cost ?? (p?.cost || 0) * (it.factor || 1);
        row.cost += unitCost * qty; costTotal += unitCost * qty;
        items.set(key, row);
        grp.set(g, (grp.get(g) || 0) + total);
        qtyTotal += qty;
      }
    }
    const top = [...items.values()].filter((r) => r.qty > 0).sort((a, b) => (rankBy === 'qty' ? b.qty - a.qty : b.revenue - a.revenue)).slice(0, 10);
    const groupsRank = [...grp.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // طرق الدفع (ما حُصِّل فعلاً)
    const pay = { cash: 0, card: 0, bank: 0 };
    for (const i of docs) {
      const sp = splitParts(i);
      const collected = (Number(i.total) || 0) - (isReturnDoc(i) ? 0 : invoiceRemaining(i));
      if (sp) { pay.cash += sp.cash; pay.card += sp.card; }
      else if (i.paymentMethod === 'card') pay.card += collected;
      else if (i.paymentMethod === 'bank') pay.bank += collected;
      else pay.cash += collected;
    }

    // حسب الساعة
    const hours = Array.from({ length: 24 }, () => 0);
    for (const i of docs) {
      const h = Number(String(i.date || '').replace('T', ' ').slice(11, 13));
      if (Number.isFinite(h) && h >= 0 && h < 24) hours[h] += Number(i.total) || 0;
    }
    const firstH = hours.findIndex((v) => v !== 0), lastH = 23 - [...hours].reverse().findIndex((v) => v !== 0);
    const hourRange = firstH < 0 ? [] : Array.from({ length: lastH - firstH + 1 }, (_, k) => ({ h: firstH + k, v: round2(hours[firstH + k]) }));
    const peak = hourRange.reduce((m, x) => (x.v > m.v ? x : m), { h: -1, v: 0 });

    // الكاشير
    const cashiers = new Map<string, { n: number; v: number }>();
    for (const i of sales) { const k = i.cashierName || 'غير محدد'; const c = cashiers.get(k) || { n: 0, v: 0 }; c.n++; c.v += Number(i.total) || 0; cashiers.set(k, c); }

    return {
      net, gross, returned, discount, credit, count: sales.length, returnsCount: returns.length,
      avg: sales.length ? round2(gross / sales.length) : 0, qtyTotal: round2(qtyTotal),
      profit: round2(netBeforeTax - costTotal), hasCost: costTotal > 0,
      top, groupsRank, pay, hourRange, peak, cashiers: [...cashiers.entries()].sort((a, b) => b[1].v - a[1].v),
    };
  }, [invoices, products, groups, period, rankBy]);

  const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm';
  const kpis: { label: string; value: string; icon: ReactNode; tone: string; sub?: string; money?: boolean }[] = [
    { label: 'صافي المبيعات', value: money(s.net), icon: <TrendingUp className="w-5 h-5" />, tone: 'emerald', money: true, sub: s.returned ? `بعد مرتجعات ${money(s.returned)}` : undefined },
    { label: 'عدد الفواتير', value: String(s.count), icon: <Receipt className="w-5 h-5" />, tone: 'cyan', sub: `متوسط الفاتورة ${money(s.avg)}` },
    { label: 'القطع المباعة', value: String(s.qtyTotal), icon: <ShoppingBasket className="w-5 h-5" />, tone: 'indigo' },
    { label: 'المرتجعات', value: money(s.returned), icon: <Undo2 className="w-5 h-5" />, tone: 'rose', money: true, sub: `${s.returnsCount} مستند` },
    ...(s.hasCost ? [{ label: 'الربح التقديري', value: money(s.profit), icon: <Coins className="w-5 h-5" />, tone: 'amber', money: true, sub: 'الصافي قبل الضريبة − التكلفة' }] : []),
    { label: 'الخصومات', value: money(s.discount), icon: <Wallet className="w-5 h-5" />, tone: 'slate', money: true, sub: s.credit ? `آجل غير محصّل ${money(s.credit)}` : undefined },
  ];
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  };
  const maxTop = Math.max(1, ...s.top.map((r) => (rankBy === 'qty' ? r.qty : r.revenue)));
  const maxHour = Math.max(1, ...s.hourRange.map((x) => x.v));
  const maxGroup = Math.max(1, ...s.groupsRank.map(([, v]) => v));
  const payTotal = Math.max(0.01, s.pay.cash + s.pay.card + s.pay.bank);

  return (
    <div className="p-4 2xl:p-6 h-full overflow-y-auto flex flex-col gap-4 text-right dark:text-white" dir="rtl" data-testid="sales-stats">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">الملخص</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold">ملخص المبيعات والأصناف الأكثر مبيعاً</p>
        </div>
        <DatePeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={card} data-testid="stat-kpi">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{k.label}</span>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[k.tone]}`}>{k.icon}</span>
            </div>
            <div className="mt-2 text-2xl font-black font-mono inline-flex items-center gap-1" dir="ltr">{k.value}{k.money && <SaudiRiyalSymbol className="w-4 h-4 opacity-70" />}</div>
            {k.sub && <div className="text-[11px] font-bold text-slate-400 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* الأصناف الأكثر مبيعاً */}
        <div className={`${card} xl:col-span-2`} data-testid="top-items">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-black flex items-center gap-2"><Crown className="w-5 h-5 text-amber-500" /> الأصناف الأكثر مبيعاً</h3>
            <div className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 text-xs font-black">
              {([['qty', 'بالكمية'], ['revenue', 'بالمبلغ']] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setRankBy(k)} className={`px-3 py-1.5 rounded-lg ${rankBy === k ? 'bg-white dark:bg-slate-800 shadow text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{t}</button>
              ))}
            </div>
          </div>
          {s.top.length === 0 ? <p className="text-sm text-slate-500 font-bold py-8 text-center">لا توجد مبيعات في هذه الفترة</p> : (
            <div className="space-y-2">
              {s.top.map((r, i) => {
                const v = rankBy === 'qty' ? r.qty : r.revenue;
                return (
                  <div key={r.name + i} className="flex items-center gap-3" data-testid="top-item">
                    <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-amber-400 text-slate-900' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-orange-300 text-slate-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-bold truncate">{r.name} <span className="text-[11px] font-semibold text-slate-400">· {r.group}</span></span>
                        <span className="font-mono font-black shrink-0" dir="ltr">{rankBy === 'qty' ? `${round2(r.qty)} قطعة` : money(r.revenue)}</span>
                      </div>
                      <div className="h-2 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400" style={{ width: `${Math.max(3, (v / maxTop) * 100)}%` }} />
                      </div>
                      <div className="text-[11px] font-semibold text-slate-400 mt-0.5">{rankBy === 'qty' ? `المبلغ ${money(r.revenue)}` : `الكمية ${round2(r.qty)}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* طرق الدفع + الكاشير */}
        <div className="flex flex-col gap-4">
          <div className={card}>
            <h3 className="font-black mb-3 flex items-center gap-2"><Wallet className="w-5 h-5 text-cyan-500" /> طرق الدفع</h3>
            {([['نقدي', s.pay.cash, 'bg-emerald-500'], ['شبكة', s.pay.card, 'bg-indigo-500'], ['تحويل بنكي', s.pay.bank, 'bg-sky-500']] as const).map(([t, v, c]) => (
              <div key={t} className="mb-2">
                <div className="flex justify-between text-sm font-bold"><span>{t}</span><span className="font-mono" dir="ltr">{money(v)}</span></div>
                <div className="h-2 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className={`h-full ${c}`} style={{ width: `${Math.max(0, (v / payTotal) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className={card}>
            <h3 className="font-black mb-2 flex items-center gap-2"><Users className="w-5 h-5 text-violet-500" /> المبيعات حسب الكاشير</h3>
            {s.cashiers.length === 0 ? <p className="text-xs text-slate-500 font-bold">—</p> : s.cashiers.map(([n, c]) => (
              <div key={n} className="flex justify-between text-sm font-bold py-1 border-b last:border-0 border-slate-100 dark:border-slate-700">
                <span>{n} <span className="text-[11px] text-slate-400">({c.n} فاتورة)</span></span><span className="font-mono" dir="ltr">{money(c.v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* حسب الساعة */}
        <div className={`${card} xl:col-span-2`} data-testid="hourly">
          <h3 className="font-black mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-500" /> المبيعات حسب الساعة {s.peak.h >= 0 && <span className="text-xs font-bold text-slate-500">— الذروة {String(s.peak.h).padStart(2, '0')}:00</span>}</h3>
          {s.hourRange.length === 0 ? <p className="text-sm text-slate-500 font-bold py-6 text-center">لا توجد مبيعات</p> : (
            <div className="flex items-end gap-1.5 h-44" dir="ltr">
              {s.hourRange.map((x) => (
                <div key={x.h} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group" title={`${String(x.h).padStart(2, '0')}:00 — ${money(x.v)}`}>
                  <span className="text-[9px] font-mono font-bold text-slate-400 opacity-0 group-hover:opacity-100">{Math.round(x.v)}</span>
                  <div className={`w-full rounded-t-md ${x.h === s.peak.h ? 'bg-amber-400' : 'bg-emerald-500/80'}`} style={{ height: `${Math.max(2, (Math.max(0, x.v) / maxHour) * 100)}%` }} />
                  <span className="text-[10px] font-mono text-slate-500 mt-1">{x.h}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* المجموعات */}
        <div className={card}>
          <h3 className="font-black mb-3">المبيعات حسب المجموعة</h3>
          {s.groupsRank.length === 0 ? <p className="text-xs text-slate-500 font-bold">—</p> : s.groupsRank.map(([g, v]) => (
            <div key={g} className="mb-2">
              <div className="flex justify-between text-sm font-bold"><span className="truncate">{g}</span><span className="font-mono" dir="ltr">{money(v)}</span></div>
              <div className="h-2 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-gradient-to-l from-cyan-500 to-sky-400" style={{ width: `${Math.max(3, (v / maxGroup) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
