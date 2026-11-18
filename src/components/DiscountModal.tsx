import React, { useState, useEffect } from 'react';
import { 
  X, Tag, Percent, Check, Trash2, ArrowRight, Calculator, 
  HelpCircle, Sparkles, CheckCircle2, ShieldCheck, Banknote
} from 'lucide-react';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawSubtotal: number;
  taxRatePercent: number; // e.g. 15
  initialType?: 'fixed' | 'percent';
  initialValue?: number;
  initialScope?: 'total' | 'subtotal';
  onApplyDiscount: (type: 'fixed' | 'percent', value: number, scope: 'total' | 'subtotal') => void;
  onClearDiscount: () => void;
  /** قواعد الخصم: تعيد رسالة خطأ إن كان الخصم غير مسموح */
  validate?: (type: 'fixed' | 'percent', value: number, scope: 'total' | 'subtotal') => string | null;
}

export default function DiscountModal({
  isOpen,
  onClose,
  rawSubtotal,
  taxRatePercent,
  initialType = 'fixed',
  initialValue = 0,
  initialScope = 'total',
  onApplyDiscount,
  onClearDiscount,
  validate
}: DiscountModalProps) {
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>(initialType);
  const [discountValueInput, setDiscountValueInput] = useState<string>(
    initialValue > 0 ? String(initialValue) : ''
  );
  const [discountScope, setDiscountScope] = useState<'total' | 'subtotal'>(initialScope);

  useEffect(() => {
    if (isOpen) {
      setDiscountType(initialType);
      setDiscountValueInput(initialValue > 0 ? String(initialValue) : '');
      setDiscountScope(initialScope);
    }
  }, [isOpen, initialType, initialValue, initialScope]);

  if (!isOpen) return null;

  const taxRate = (taxRatePercent ?? 15) / 100;
  const rawTotalWithTax = rawSubtotal * (1 + taxRate);
  const cleanVal = Math.max(0, parseFloat(discountValueInput) || 0);

  // Real-time calculations
  let discountAmount = 0;       // Taxable subtotal deduction
  let discountedSubtotal = rawSubtotal;
  let calculatedTax = rawSubtotal * taxRate;
  let calculatedTotal = rawTotalWithTax;
  let totalSavings = 0;         // Customer savings in base currency

  if (rawSubtotal > 0 && cleanVal > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, cleanVal);
      discountAmount = (rawSubtotal * pct) / 100;
      discountedSubtotal = Math.max(0, rawSubtotal - discountAmount);
      calculatedTax = discountedSubtotal * taxRate;
      calculatedTotal = discountedSubtotal + calculatedTax;
      totalSavings = rawTotalWithTax - calculatedTotal;
    } else {
      // Fixed financial amount discount
      if (discountScope === 'total') {
        // Fixed discount directly on invoice grand total (inclusive of VAT)
        totalSavings = Math.min(rawTotalWithTax, cleanVal);
        calculatedTotal = Math.max(0, rawTotalWithTax - totalSavings);
        discountedSubtotal = calculatedTotal / (1 + taxRate);
        calculatedTax = calculatedTotal - discountedSubtotal;
        discountAmount = rawSubtotal - discountedSubtotal;
      } else {
        // Fixed discount on pre-tax subtotal
        discountAmount = Math.min(rawSubtotal, cleanVal);
        discountedSubtotal = Math.max(0, rawSubtotal - discountAmount);
        calculatedTax = discountedSubtotal * taxRate;
        calculatedTotal = discountedSubtotal + calculatedTax;
        totalSavings = rawTotalWithTax - calculatedTotal;
      }
    }
  }

  const handleKeypadPress = (key: string) => {
    if (key === 'C') {
      setDiscountValueInput('');
      return;
    }
    if (key === 'BACK') {
      setDiscountValueInput(prev => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (discountValueInput.includes('.')) return;
      setDiscountValueInput(prev => (prev === '' ? '0.' : prev + '.'));
      return;
    }
    // Prevent typing > 100 in percent mode
    if (discountType === 'percent') {
      const newVal = parseFloat(discountValueInput + key);
      if (newVal > 100) {
        setDiscountValueInput('100');
        return;
      }
    }
    setDiscountValueInput(prev => prev + key);
  };

  const ruleError = validate ? validate(discountType, cleanVal, discountScope) : null;
  const handleApply = () => {
    if (ruleError) return;
    onApplyDiscount(discountType, cleanVal, discountScope);
    onClose();
  };

  const handleClear = () => {
    setDiscountValueInput('');
    onClearDiscount();
    onClose();
  };

  // Fixed presets
  const fixedPresets = [5, 10, 15, 20, 25, 50, 100];
  const percentPresets = [5, 10, 15, 20, 25, 50];

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[90] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 my-auto text-right" 
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 via-slate-850 to-slate-900 p-4 text-white flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl shadow-inner">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base">واجهة خصم الفاتورة</h3>
              <p className="text-xs text-slate-400">تطبيق خصم مالي ثابت على الإجمالي أو نسبة مئوية</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[82vh]">
          
          {/* Main Mode Switcher: Fixed Financial Amount vs Percentage */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setDiscountType('fixed');
              }}
              className={`py-3 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                discountType === 'fixed'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/60'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60'
              }`}
            >
              <Banknote className="w-4 h-4" />
              <span>مبلغ مالي ثابت (﷼)</span>
              <span className="text-[10px] bg-slate-950/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono font-bold">
                موصى به
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscountType('percent');
                if (parseFloat(discountValueInput) > 100) {
                  setDiscountValueInput('10');
                }
              }}
              className={`py-3 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                discountType === 'percent'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/60'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60'
              }`}
            >
              <Percent className="w-4 h-4" />
              <span>نسبة مئوية (%)</span>
            </button>
          </div>

          {/* Sub-scope option when Fixed Amount is active */}
          {discountType === 'fixed' ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 space-y-2">
              <span className="block text-xs font-black text-amber-900 dark:text-amber-300">
                طريقة احتساب الخصم المالي الثابت:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label 
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                    discountScope === 'total'
                      ? 'bg-white dark:bg-slate-800 border-amber-500 shadow-sm text-slate-900 dark:text-white ring-1 ring-amber-500/50'
                      : 'bg-white/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="discountScope"
                    checked={discountScope === 'total'}
                    onChange={() => setDiscountScope('total')}
                    className="mt-1 accent-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black block text-amber-600 dark:text-amber-400">
                      على إجمالي الفاتورة النهائي (شامل الضريبة)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                      يُخصم المبلغ مباشرة من المطلوب دفعه (مثال: الإجمالي 115 ﷼ - خصم 15 ﷼ = المطلوب 100 ﷼ تماماً).
                    </span>
                  </div>
                </label>

                <label 
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                    discountScope === 'subtotal'
                      ? 'bg-white dark:bg-slate-800 border-amber-500 shadow-sm text-slate-900 dark:text-white ring-1 ring-amber-500/50'
                      : 'bg-white/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="discountScope"
                    checked={discountScope === 'subtotal'}
                    onChange={() => setDiscountScope('subtotal')}
                    className="mt-1 accent-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black block text-slate-800 dark:text-slate-200">
                      على المجموع قبل الضريبة (خاضع للضريبة)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                      يُخصم المبلغ من قيمة السلع قبل احتساب ضريبة القيمة المضافة 15%.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-3 text-xs text-cyan-800 dark:text-cyan-300 font-bold flex items-center gap-2">
              <Percent className="w-4 h-4 text-cyan-500 shrink-0" />
              <span>سيتم احتساب النسبة المئوية المحددة وخصمها تلقائياً من قيمة الفاتورة.</span>
            </div>
          )}

          {/* Amount Input with Large Display */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>{discountType === 'fixed' ? 'قيمة الخصم المالي الثابت المطلوب:' : 'نسبة الخصم المئوية:'}</span>
              {cleanVal > 0 && (
                <span className="text-amber-500 font-black">
                  وفر العميل: {totalSavings.toFixed(2)} ﷼
                </span>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? 100 : (discountScope === 'total' ? rawTotalWithTax : rawSubtotal)}
                step={discountType === 'percent' ? '1' : '0.5'}
                value={discountValueInput}
                onChange={(e) => setDiscountValueInput(e.target.value)}
                placeholder="0.00"
                className="w-full text-center font-mono font-black text-3xl sm:text-4xl py-3 px-12 bg-white dark:bg-slate-900 border-2 border-amber-500/40 focus:border-amber-500 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-amber-500/20 tracking-tight"
                dir="ltr"
                autoFocus
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                {discountType === 'fixed' ? (
                  <SaudiRiyalSymbol className="w-6 h-6 text-amber-500" />
                ) : (
                  <span className="text-2xl font-black text-amber-500">%</span>
                )}
              </div>
              {discountValueInput && (
                <button
                  type="button"
                  onClick={() => setDiscountValueInput('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-rose-500 transition cursor-pointer"
                  title="مسح الحقل"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              اختيار سريع من القيم الجاهزة:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {discountType === 'fixed' ? (
                <>
                  {fixedPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDiscountValueInput(String(preset))}
                      className={`px-3 py-1.5 text-xs font-mono font-black rounded-xl transition cursor-pointer border flex items-center gap-1 active:scale-95 ${
                        cleanVal === preset
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md ring-2 ring-amber-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                      }`}
                    >
                      <span>{preset}</span>
                      <SaudiRiyalSymbol className="w-2.5 h-2.5" />
                    </button>
                  ))}

                  {/* Smart Button: Waive Tax by applying exact Tax as fixed discount */}
                  {rawTotalWithTax > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const taxAmt = rawSubtotal * taxRate;
                        setDiscountScope('total');
                        setDiscountValueInput(taxAmt.toFixed(2));
                      }}
                      className="px-3 py-1.5 text-xs font-black rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 transition cursor-pointer flex items-center gap-1"
                      title="تطبيق خصم بقيمة الضريبة كاملة"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>خصم قيمة الضريبة ({(rawSubtotal * taxRate).toFixed(2)} ﷼)</span>
                    </button>
                  )}
                </>
              ) : (
                percentPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDiscountValueInput(String(preset))}
                    className={`px-3.5 py-1.5 text-xs font-mono font-black rounded-xl transition cursor-pointer border flex items-center gap-0.5 active:scale-95 ${
                      cleanVal === preset
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md ring-2 ring-amber-400'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                    }`}
                  >
                    <span>{preset}%</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Touch-Friendly Compact Keypad */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '00'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl font-mono font-black text-sm text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 transition cursor-pointer active:scale-95"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleKeypadPress('BACK')}
              className="col-span-2 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 flex items-center justify-center gap-1"
            >
              <span>حذف ⌫</span>
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('C')}
              className="col-span-2 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 rounded-xl text-xs font-black text-rose-600 dark:text-rose-300 transition cursor-pointer active:scale-95 flex items-center justify-center gap-1 border border-rose-200 dark:border-rose-800/40"
            >
              <span>تفريغ (C)</span>
            </button>
          </div>

          {/* Real-time Calculation Comparison Card */}
          <div className="bg-slate-50 dark:bg-slate-850 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs font-bold">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>الإجمالي قبل الخصم:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                {rawTotalWithTax.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" />
              </span>
            </div>

            {cleanVal > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-black">
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>
                    الخصم المطبق (
                    {discountType === 'fixed'
                      ? (discountScope === 'total' ? 'مبلغ ثابت من الإجمالي' : 'مبلغ ثابت قبل الضريبة')
                      : `${cleanVal}%`}
                    ):
                  </span>
                </span>
                <span className="font-mono inline-flex items-center gap-1">
                  - {totalSavings.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3" />
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>المبلغ الخاضع للضريبة:</span>
              <span className="font-mono inline-flex items-center gap-1">
                {discountedSubtotal.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 opacity-70" />
              </span>
            </div>

            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>ضريبة القيمة المضافة ({taxRatePercent}%):</span>
              <span className="font-mono inline-flex items-center gap-1">
                {calculatedTax.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 opacity-70" />
              </span>
            </div>

            <div className="flex justify-between items-center text-sm font-black pt-2 border-t border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400">
              <span className="text-slate-900 dark:text-white">الإجمالي النهائي المطلوب دفعه:</span>
              <span className="font-mono text-xl inline-flex items-center gap-1.5 font-black">
                <span>{calculatedTotal.toFixed(2)}</span>
                <SaudiRiyalSymbol className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        {ruleError && <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-black" data-testid="discount-error">⛔ {ruleError}</div>}
        <div className="p-4 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={!!ruleError}
            className="disabled:opacity-40 disabled:cursor-not-allowed flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-sm transition cursor-pointer shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-98"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>تأكيد وتطبيق الخصم</span>
            {cleanVal > 0 && (
              <span className="font-mono text-xs opacity-90">({calculatedTotal.toFixed(2)} ﷼)</span>
            )}
          </button>

          {cleanVal > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="py-3 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>إلغاء الخصم</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
