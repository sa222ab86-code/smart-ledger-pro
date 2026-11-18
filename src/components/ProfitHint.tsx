/** نسبة الربح عند إدخال سعر البيع والتكلفة (التكلفة بدون ضريبة دائماً) */
export default function ProfitHint({ price, cost, pricesIncludeTax, taxRatePercent = 15, unitLabel = 'للحبة', onStripTax, costIncludesTax }: {
  price: string | number;
  cost: string | number;
  pricesIncludeTax?: boolean;
  taxRatePercent?: number;
  /** «للحبة» أو «للكيلو» للأصناف الموزونة أو «للخدمة» */
  unitLabel?: string;
  /** زر: التكلفة المُدخلة شاملة الضريبة — يحوّلها إلى صافي */
  onStripTax?: (netCost: number) => void;
  /** خانة التكلفة تُدخل شاملة الضريبة (مثل سعر البيع) — تُحسب صافيةً هنا */
  costIncludesTax?: boolean;
}) {
  const p = Number(price) || 0, cIn = Number(cost) || 0;
  if (!(p > 0) || !(cIn > 0)) return null;
  const rate = pricesIncludeTax && (taxRatePercent || 0) > 0 ? taxRatePercent : 0;
  const c = rate && costIncludesTax ? cIn / (1 + rate / 100) : cIn;
  const net = rate ? p / (1 + rate / 100) : p;
  const profit = net - c;
  const margin = (profit / net) * 100, markup = (profit / c) * 100;
  const bad = profit < 0;
  // تكلفة يبدو أنها أُدخلت شاملة الضريبة: استبعادها يقلب الخسارة إلى ربح
  const netCost = rate ? Math.round((c / (1 + rate / 100)) * 100) / 100 : c;
  const looksIncludingTax = !costIncludesTax && bad && !!rate && net - netCost > 0;
  const num = (n: number) => <span className="font-mono" dir="ltr">{n.toFixed(2)}</span>;
  return (
    <div data-testid="profit-hint" className={`text-[11px] font-black rounded-lg px-2 py-1 border space-y-0.5 ${bad ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-300/70' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300/70'}`}>
      <div>
        {bad ? 'خسارة' : 'الربح'}: {num(profit)} {unitLabel} — <span className="font-mono" dir="ltr">{margin.toFixed(1)}%</span> من سعر البيع · <span className="font-mono" dir="ltr">{markup.toFixed(1)}%</span> على التكلفة
      </div>
      {rate ? (
        <div className="font-bold opacity-80" data-testid="profit-hint-calc">
          {costIncludesTax
            ? `صافي البيع ${net.toFixed(2)} ناقص صافي التكلفة ${c.toFixed(2)} (بعد استبعاد ضريبة ${taxRatePercent}% من السعر والتكلفة)`
            : `صافي البيع ${net.toFixed(2)} ناقص التكلفة ${c.toFixed(2)} (السعر ${p.toFixed(2)} بعد استبعاد ضريبة ${taxRatePercent}%)`}
        </div>
      ) : null}
      {looksIncludingTax ? (
        onStripTax ? (
          <button type="button" data-testid="profit-strip-tax" onClick={() => onStripTax(netCost)}
            className="underline font-black hover:opacity-80 cursor-pointer text-right block">
            {`تكلفتي في فاتورة الشراء شاملة الضريبة؟ اجعلها صافية ← ${netCost.toFixed(2)}`}
          </button>
        ) : (
          <div className="font-bold opacity-80">{`أدخل التكلفة بدون ضريبة — صافي تكلفتك ${netCost.toFixed(2)}`}</div>
        )
      ) : null}
    </div>
  );
}
