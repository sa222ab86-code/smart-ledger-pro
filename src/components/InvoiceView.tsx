import React, { useState, useMemo } from 'react';
import { hasVehicle, vehicleRows } from '../utils/vehicle';
import { Invoice, MultiCurrencySettings, CurrencyConfig, CompanySettings } from '../types';
import { defaultCurrencies } from '../data';
import { generateZatcaTlvBase64 } from '../utils/zatca';
import { tafqeet } from '../utils/tafqeet';
import ZatcaQrCodeViewer from './ZatcaQrCodeViewer';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import { customerLabel, paymentLabel, splitParts, bundleQty } from '../utils/invoiceMath';
import { 
  X, Printer, Calendar, User, CreditCard, Receipt, Percent, 
  Coins, ArrowRightLeft, Globe, Check, ShieldCheck, Tag, Zap, Banknote
} from 'lucide-react';

interface InvoiceViewProps {
  invoice: Invoice;
  onClose: () => void;
  onPrint?: (invoice: Invoice, currencyCode?: string) => void;
  multiCurrencySettings?: MultiCurrencySettings;
  companySettings?: CompanySettings;
}

export default function InvoiceView({ 
  invoice, 
  onClose, 
  onPrint, 
  multiCurrencySettings,
  companySettings
}: InvoiceViewProps) {
  const invoiceNum = invoice.invoiceNumber || invoice.number || 'INV-0000';
  const subTotalAmount = invoice.subtotal !== undefined ? invoice.subtotal : (invoice.total / 1.15);
  const taxAmount = invoice.tax !== undefined ? invoice.tax : (invoice.total - subTotalAmount);

  // Available currencies
  // تعدد العملات مغلق (أو لم يفعّله المستخدم): العملة الأساسية فقط
  const multiOn = !!(multiCurrencySettings?.enabled && multiCurrencySettings?.configured);
  const allCurrencies: CurrencyConfig[] = multiCurrencySettings?.currencies && multiCurrencySettings.currencies.length > 0 ? multiCurrencySettings.currencies : defaultCurrencies;
  const baseCodeForList = multiCurrencySettings?.baseCurrency || 'SAR';
  const availableCurrencies: CurrencyConfig[] = (() => {
    const l = allCurrencies.filter(c => c.code === baseCodeForList || (multiOn && c.isEnabled));
    return l.length ? l : [{ code: baseCodeForList, nameAr: baseCodeForList, symbol: baseCodeForList === 'SAR' ? '﷼' : baseCodeForList, exchangeRate: 1, isBase: true, isEnabled: true }];
  })();

  const baseCurrencyCode = multiCurrencySettings?.baseCurrency || 'SAR';
  
  // Active selected display currency
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(
    multiOn && availableCurrencies.some(c => c.code === invoice.currency) ? invoice.currency! : baseCurrencyCode
  );
  
  // Show dual currency preview toggle
  const [showDualCurrency, setShowDualCurrency] = useState(true);

  const baseCurrObj = availableCurrencies.find(c => c.code === baseCurrencyCode) || availableCurrencies[0];
  const activeCurrObj = availableCurrencies.find(c => c.code === selectedCurrencyCode) || baseCurrObj;

  const renderCurr = (code?: string, symbol?: string, className = "w-3.5 h-3.5 inline-block mx-0.5 align-middle") => {
    if (code === 'SAR' || symbol === 'ر.س' || symbol === '⃁' || symbol === '﷼') {
      return <SaudiRiyalSymbol raw className={className} />;
    }
    return <span>{symbol || code}</span>;
  };

  const isNonBase = activeCurrObj.code !== baseCurrObj.code;
  // Exchange rate: 1 activeCurr = rate baseCurr. (e.g. 1 USD = 3.75 SAR)
  const exchangeRate = activeCurrObj.exchangeRate || 1.0;

  // Calculation helpers
  const convertAmount = (amountInBase: number) => {
    if (!isNonBase || exchangeRate <= 0) return amountInBase;
    return amountInBase / exchangeRate;
  };

  const convertedSubTotal = convertAmount(subTotalAmount);
  const convertedTax = convertAmount(taxAmount);
  const convertedTotal = convertAmount(invoice.total);

  // Official ZATCA Phase 1 TLV Base64 computation
  const zatcaQrBase64 = useMemo(() => {
    if (invoice.zatca?.qr) return invoice.zatca.qr; // المرحلة الثانية: الرمز المختوم
    return generateZatcaTlvBase64({
      sellerName: companySettings?.companyName || 'مؤسسة كاشير البدر للتجارة',
      vatNumber: companySettings?.vatNumber || '300000000000003',
      timestamp: invoice.date || new Date().toISOString(),
      totalWithVat: Math.abs(invoice.total),
      vatAmount: Math.abs(taxAmount)
    });
  }, [invoice, companySettings, taxAmount]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center pt-4 px-4 overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* النافذة تنزلق من الأسفل، وأزرار الإجراءات مثبّتة أسفلها أثناء التمرير */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-b-0 rounded-t-3xl px-6 pt-6 text-slate-800 dark:text-slate-100 w-full max-w-2xl mx-auto space-y-5 text-right shadow-2xl relative max-h-[94vh] overflow-y-auto animate-in slide-in-from-bottom-16 fade-in duration-300" dir="rtl" data-testid="invoice-view">
        
        {/* Decorative Blur Backgrounds */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            {companySettings?.logoUrl && (
              <img 
                src={companySettings.logoUrl} 
                alt="شعار الشركة" 
                className="h-12 w-12 object-contain rounded-xl bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 p-1 shrink-0 shadow-sm"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black uppercase tracking-wider ${invoice.docType === 'return' ? 'text-rose-600 dark:text-rose-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                  {invoice.docType === 'return' ? `إشعار دائن — مرتجع عن ${invoice.originalInvoiceNumber}` : invoice.zatca?.kind === 'standard' ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة'}
                </span>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>متوافقة مع هيئة الزكاة والضريبة والجمارك</span>
                </span>
                {isNonBase && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                    معاينة بعملة {activeCurrObj.nameAr}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">{invoiceNum}</h2>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Currency Selection Bar */}
        {availableCurrencies.length > 1 && <div className="bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <Coins className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>عرض الفاتورة بعملة:</span>
            </div>
            
            {/* Currency selector chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {availableCurrencies.map(curr => {
                const isSelected = curr.code === selectedCurrencyCode;
                return (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => setSelectedCurrencyCode(curr.code)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/60 dark:border-slate-700/60'
                    }`}
                  >
                    <span>{curr.nameAr}</span>
                    <span className="font-mono text-[11px] opacity-80 inline-flex items-center gap-0.5">({renderCurr(curr.code, curr.symbol, "w-2.5 h-2.5")})</span>
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rate Conversion Banner if foreign currency is active */}
          {isNonBase && (
            <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300">
              <div className="flex items-center gap-2 font-mono">
                <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span className="font-bold flex items-center gap-1">
                  سعر الصرف المعتمد: 1 {activeCurrObj.code} = {exchangeRate} {renderCurr(baseCurrObj.code, baseCurrObj.symbol)}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-0.5">
                  (1 {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2.5 h-2.5")} ≈ {(1 / exchangeRate).toFixed(4)} {activeCurrObj.code})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDualCurrency(!showDualCurrency)}
                className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                {showDualCurrency ? 'إخفاء العملة الأساسية' : 'إظهار العملة الأساسية والمحولة معاً'}
              </button>
            </div>
          )}
        </div>}

        {/* Metadata Panel */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-white/40 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-xs font-bold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            <div>
              <span className="block text-[10px] text-slate-500">العميل</span>
              <span className="text-slate-700 dark:text-slate-200">{customerLabel(invoice.customerName)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <div>
              <span className="block text-[10px] text-slate-500">التاريخ والوقت</span>
              <span className="text-slate-700 dark:text-slate-200 font-mono">{invoice.date}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 col-span-2 md:col-span-1">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <div>
              <span className="block text-[10px] text-slate-500">طريقة الدفع</span>
              <span className="text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 uppercase inline-flex items-center gap-1">
                {invoice.paymentMethod === 'cash' && !((invoice.remainingAmount || 0) > 0) ? (
                  <>
                    <Banknote className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>نقدي</span>
                    {invoice.isQuickPay && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 rounded font-bold flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5" />
                        <span>سريع</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span>{paymentLabel(invoice)}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden text-xs">
          <div className="grid grid-cols-12 gap-1 bg-white dark:bg-slate-900 p-2.5 text-slate-500 dark:text-slate-400 font-black text-center border-b border-slate-200 dark:border-slate-800">
            <div className="col-span-5 text-right pr-2">الصنف / الخدمة</div>
            <div className="col-span-2 flex items-center justify-center gap-0.5">
              <span>السعر (</span>{renderCurr(activeCurrObj.code, activeCurrObj.symbol)}<span>)</span>
            </div>
            <div className="col-span-1">الكمية</div>
            <div className="col-span-2">الضريبة (15%)</div>
            <div className="col-span-2 flex items-center justify-center gap-0.5">
              <span>الإجمالي (</span>{renderCurr(activeCurrObj.code, activeCurrObj.symbol)}<span>)</span>
            </div>
          </div>
          <div className="divide-y divide-slate-200/40 dark:divide-slate-800/40 bg-slate-50/40 dark:bg-slate-950/40 max-h-48 overflow-y-auto">
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item, index) => {
                const itemPrice = item.price || 0;
                const itemQty = item.qty || 1;
                const itemTax = item.tax !== undefined ? item.tax : (itemPrice * itemQty * 0.15);
                const itemTotal = item.total !== undefined ? item.total : (itemPrice * itemQty + itemTax);

                const convPrice = convertAmount(itemPrice);
                const convTax = convertAmount(itemTax);
                const convTotal = convertAmount(itemTotal);

                return (
                  <div key={index} className="grid grid-cols-12 gap-1 p-3 text-center font-bold text-slate-600 dark:text-slate-300 items-center hover:bg-white/30 dark:hover:bg-slate-900/30">
                    <div className="col-span-5 text-right pr-2 text-slate-900 dark:text-white font-bold">
                      {item.name}
                      {item.description && <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{item.description}</span>}
                      {item.serial && <span className="block text-[10px] font-normal font-mono text-slate-500 dark:text-slate-400" dir="ltr">S/N: {item.serial}</span>}
                      {item.bundle?.length ? <span className="block text-[10px] font-bold text-purple-600 dark:text-purple-400">يشمل: {item.bundle.map((b) => `${bundleQty(b.qty, item.qty)}× ${b.name}`).join(' + ')}</span> : null}
                      {item.bundleSaving ? <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">توفير العرض: {item.bundleSaving.toFixed(2)}</span> : null}
                    </div>
                    <div className="col-span-2 font-mono">
                      <span className="inline-flex items-center gap-0.5">{convPrice.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol, "w-2.5 h-2.5")}</span>
                      {isNonBase && showDualCurrency && (
                        <span className="block text-[10px] text-slate-500 font-mono">
                          {itemPrice.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2 h-2")}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 font-mono text-slate-700 dark:text-slate-200">{itemQty}</div>
                    <div className="col-span-2 font-mono text-rose-600 dark:text-rose-400">
                      <span className="inline-flex items-center gap-0.5">{convTax.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol, "w-2.5 h-2.5")}</span>
                      {isNonBase && showDualCurrency && (
                        <span className="block text-[10px] text-rose-500/60 font-mono">
                          {itemTax.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2 h-2")}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 font-mono text-slate-900 dark:text-white font-bold">
                      <span className="inline-flex items-center gap-0.5">{convTotal.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol, "w-2.5 h-2.5")}</span>
                      {isNonBase && showDualCurrency && (
                        <span className="block text-[10px] text-slate-500 font-mono">
                          {itemTotal.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2 h-2")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-slate-500">لا توجد أصناف في هذه الفاتورة</div>
            )}
          </div>
        </div>

        {/* Summary calculation boxes */}
        <div className="border-t border-slate-200/80 dark:border-slate-800/80 pt-3 space-y-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          {invoice.discount && invoice.discount > 0 && (
            <>
              <div className="flex justify-between items-center">
                <span>المجموع قبل الخصم:</span>
                <div className="text-left font-mono" dir="ltr">
                  <span className="text-slate-600 dark:text-slate-300 font-bold text-sm inline-flex items-center gap-1">
                    {convertAmount(invoice.rawSubtotal || (subTotalAmount + invoice.discount)).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}
                  </span>
                  {isNonBase && showDualCurrency && (
                    <span className="text-slate-500 text-xs ml-2 inline-flex items-center gap-0.5">
                      ({(invoice.rawSubtotal || (subTotalAmount + invoice.discount)).toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2.5 h-2.5")})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>
                    الخصم (
                    {invoice.discountType === 'percent'
                      ? `${invoice.discountValue}%`
                      : (invoice.discountScope === 'total' ? `مبلغ ثابت ${invoice.discountValue || invoice.discount} ﷼ من الإجمالي` : `مبلغ ثابت ${invoice.discountValue || invoice.discount} ﷼`)}
                    ):
                  </span>
                </span>
                <div className="text-left font-mono font-black" dir="ltr">
                  <span className="inline-flex items-center gap-1">- {convertAmount(invoice.discount).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}</span>
                  {isNonBase && showDualCurrency && (
                    <span className="text-amber-500/60 text-xs ml-2 inline-flex items-center gap-0.5">
                      (-{invoice.discount.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2.5 h-2.5")})
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between items-center">
            <span>المجموع الخاضع للضريبة (الفرعي):</span>
            <div className="text-left font-mono" dir="ltr">
              <span className="text-slate-700 dark:text-slate-200 font-bold text-sm inline-flex items-center gap-1">
                {convertedSubTotal.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}
              </span>
              {isNonBase && showDualCurrency && (
                <span className="text-slate-500 text-xs ml-2 inline-flex items-center gap-0.5">
                  ({subTotalAmount.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2.5 h-2.5")})
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
            <span className="flex items-center gap-1">
              <Percent className="w-3.5 h-3.5" />
              <span>ضريبة القيمة المضافة (15%):</span>
            </span>
            <div className="text-left font-mono" dir="ltr">
              <span className="font-bold text-sm inline-flex items-center gap-1">
                {convertedTax.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}
              </span>
              {isNonBase && showDualCurrency && (
                <span className="text-rose-500/60 text-xs ml-2 inline-flex items-center gap-0.5">
                  ({taxAmount.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-2.5 h-2.5")})
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center text-base font-black text-slate-900 dark:text-white pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
            <span className="flex items-center gap-1.5">
              <Receipt className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <span>الإجمالي النهائي المستحق:</span>
            </span>
            <div className="text-left font-mono" dir="ltr">
              <span className="text-cyan-600 dark:text-cyan-400 text-2xl font-black inline-flex items-center gap-1.5">
                {convertedTotal.toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol, "w-6 h-6")}
              </span>
              {isNonBase && (
                <span className="text-slate-500 dark:text-slate-400 text-xs block font-bold mt-0.5">
                  ما يعادله: {invoice.total.toFixed(2)} {renderCurr(baseCurrObj.code, baseCurrObj.symbol, "w-3 h-3")}
                </span>
              )}
            </div>
          </div>

          {!isNonBase && tafqeet(invoice.total, baseCurrencyCode) && (
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2" data-testid="tafqeet">{tafqeet(invoice.total, baseCurrencyCode)}</div>
          )}

          {hasVehicle(invoice.vehicle) && (
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 mt-2 text-xs font-bold flex flex-wrap gap-x-5 gap-y-1">
              {vehicleRows(invoice.vehicle).map(([k, v]) => <span key={k}><span className="text-sky-600 dark:text-sky-400">{k}: </span><span dir="auto">{v}</span></span>)}
            </div>
          )}
          {invoice.note && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mt-2 text-xs font-bold text-amber-200">
              <span className="text-amber-600 dark:text-amber-400">ملاحظة: </span>{invoice.note}
            </div>
          )}
          {invoice.remainingAmount !== undefined && invoice.remainingAmount > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 mt-2 flex justify-between items-center text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">المدفوع:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200 text-sm font-black">{convertAmount(invoice.total - invoice.remainingAmount).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}</span>
              </div>
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
                <span>المتبقي على العميل:</span>
                <span className="font-mono text-sm font-black">{convertAmount(invoice.remainingAmount).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}</span>
              </div>
            </div>
          )}
          {(() => { const sp = splitParts(invoice); return sp ? (
            <div className="bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mt-2 flex flex-wrap justify-between items-center gap-2 text-xs font-bold" data-testid="view-split">
              <span className="flex items-center gap-1.5"><Banknote className="w-4 h-4 text-emerald-600" /> نقدي: <span className="font-mono text-sm font-black">{convertAmount(sp.cash).toFixed(2)}</span></span>
              <span className="flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-indigo-600" /> شبكة: <span className="font-mono text-sm font-black">{convertAmount(sp.card).toFixed(2)}</span></span>
              {(invoice.changeAmount || 0) > 0 && <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Coins className="w-4 h-4" /> الباقي: <span className="font-mono text-sm font-black">{convertAmount(invoice.changeAmount || 0).toFixed(2)}</span></span>}
            </div>
          ) : null; })()}
          {invoice.paymentMethod === 'cash' && invoice.paidAmount !== undefined && !(invoice.remainingAmount && invoice.remainingAmount > 0) && (
            <div className="bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mt-2 flex justify-between items-center text-xs font-bold">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-slate-500 dark:text-slate-400">المبلغ المدفوع نقداً:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200 text-sm font-black inline-flex items-center gap-1">{convertAmount(invoice.paidAmount).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>الباقي للعميل:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm font-black inline-flex items-center gap-1">{convertAmount(invoice.changeAmount || 0).toFixed(2)} {renderCurr(activeCurrObj.code, activeCurrObj.symbol)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ZATCA Phase 1 QR Code Viewer & TLV Inspector */}
        <ZatcaQrCodeViewer 
          base64Payload={zatcaQrBase64} 
          title="رمز الاستجابة السريعة لهيئة الزكاة والضريبة والجمارك (ZATCA QR)"
          subtitle={`مشفر بنظام TLV (فاتورة مبسطة #${invoiceNum})`}
        />

        {/* Action triggers — مثبّتة أسفل النافذة */}
        <div className="sticky bottom-0 -mx-6 px-6 py-3 flex gap-3 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.25)]" data-testid="invoice-actions">
          <button 
            onClick={() => onPrint && onPrint(invoice, selectedCurrencyCode)}
            className="flex-1 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/15 active:scale-95"
          >
            <Printer className="w-5 h-5" />
            <span className="inline-flex items-center gap-1">معاينة وطباعة / حفظ PDF ({renderCurr(activeCurrObj.code, activeCurrObj.symbol)})</span>
          </button>
          <button 
            onClick={onClose} 
            className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm transition border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            <span>إغلاق النافذة</span>
          </button>
        </div>

      </div>
    </div>
  );
}
