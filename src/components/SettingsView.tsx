import React, { useState, useRef, useEffect } from 'react';
import { generateBrandLogo, BRAND_LOGO_VARIANTS, BRAND_ICONS, brandIconDataUrl, activityIcon, type BrandIcon } from '../utils/brandLogo';
import { 
  Building2, Save, Sparkles, Phone, MapPin, Receipt, ShieldCheck, 
  Coins, RefreshCw, Plus, Trash2, CheckCircle2, ArrowRightLeft, 
  Globe, Calculator, X, AlertCircle, Upload, Image as ImageIcon,
  RotateCcw, Wand2, FileImage,
  FileText, Mail,
} from 'lucide-react';
import { CompanySettings, CurrencyConfig } from '../types';
import { defaultCurrencies, defaultCompanyLogoAsset } from '../data';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

interface SettingsViewProps {
  settings: CompanySettings;
  onSaveSettings: (settings: CompanySettings) => void;
  /** سبب قفل نسبة الضريبة (ربط بالفوترة الإلكترونية أو وجود فواتير بضريبة) — فارغ = غير مقفلة */
  taxLockReason?: string;
}

export default function SettingsView({ settings, onSaveSettings, taxLockReason: lockReasonIn }: SettingsViewProps) {
  // فتح القفل يدوياً (تغيير رسمي في النسبة) — غير متاح عند الربط بالفوترة الإلكترونية
  const [taxUnlocked, setTaxUnlocked] = useState(false);
  const canUnlockTax = !!lockReasonIn && !/الفوترة الإلكترونية/.test(lockReasonIn);
  const taxLockReason = taxUnlocked && canUnlockTax ? undefined : lockReasonIn;
  const [activeTab, setActiveTab] = useState<'general' | 'currency' | 'tobacco'>('general');

  // General Settings State
  const [companyName, setCompanyName] = useState(settings.companyName || '');
  const [companyNameEn, setCompanyNameEn] = useState(settings.companyNameEn || '');
  // شعار محذوف ('') يبقى محذوفاً — الافتراضي فقط لمنشأة لم تحدد شعاراً قط
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? defaultCompanyLogoAsset ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState(settings.address || '');
  const [shortAddress, setShortAddress] = useState(settings.shortAddress || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [mobile, setMobile] = useState(settings.mobile || '');
  const [email, setEmail] = useState(settings.email || '');
  const [vatNumber, setVatNumber] = useState(settings.vatNumber || '');
  // منشأة غير مسجّلة في ضريبة القيمة المضافة
  const [vatUnregistered, setVatUnregistered] = useState(!!settings.vatUnregistered);
  const [grNumber, setGrNumber] = useState(settings.grNumber || '');
  const [moNumber, setMoNumber] = useState(settings.moNumber || '');
  const [footer, setFooter] = useState(settings.footer || '');
  const [bankName, setBankName] = useState(settings.bankName || '');
  const [bankAccountName, setBankAccountName] = useState(settings.bankAccountName || '');
  const [bankIban, setBankIban] = useState(settings.bankIban || '');
  const [bankAccountNo, setBankAccountNo] = useState(settings.bankAccountNo || '');
  const [bankOnA4, setBankOnA4] = useState(settings.bankOnA4 ?? true);
  const [bankOnReceipt, setBankOnReceipt] = useState(settings.bankOnReceipt ?? false);
  const [invoiceTerms, setInvoiceTerms] = useState(settings.invoiceTerms || '');
  const [showTerms, setShowTerms] = useState(settings.showTerms ?? true);
  const [taxRate, setTaxRate] = useState(settings.taxRate?.toString() ?? '15');
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean>(!!settings.pricesIncludeTax);
  // رسوم تقديم منتجات التبغ (نسخة Pro)
  const [tobaccoEnabled, setTobaccoEnabled] = useState<boolean>(!!settings.tobaccoFee?.enabled);
  const [tobaccoRate, setTobaccoRate] = useState(String(settings.tobaccoFee?.ratePercent ?? 100));
  const [tobaccoMin, setTobaccoMin] = useState(String(settings.tobaccoFee?.minPerUnit ?? 25));
  const [activityType, setActivityType] = useState<CompanySettings['activityType']>(settings.activityType || 'restaurant');
  const [oilChangeKm, setOilChangeKm] = useState<string>(String(settings.oilChangeKm ?? 5000));

  // Handle Logo file upload (supports png, jpg, webp, svg)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('حجم الصورة كبير، يرجى اختيار ملف أصغر من 4 ميغابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setLogoUrl(result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // توليد شعار رمزي من اسم المنشأة ونشاطها — كل ضغطة تعطي شكلاً آخر (ختم / درع / إطار)
  const [badgeVariant, setBadgeVariant] = useState(0);
  const [badgeIcon, setBadgeIcon] = useState<BrandIcon | 'auto'>('auto');
  const handleGenerateBrandBadge = () => {
    setLogoUrl(generateBrandLogo({ name: companyName, nameEn: companyNameEn, activity: activityType, icon: badgeIcon, variant: badgeVariant }));
    setBadgeVariant((v) => v + 1);
  };
  /** اختيار رمز الشعار: يُعاد توليد الشكل الحالي بالرمز الجديد */
  const pickBadgeIcon = (id: BrandIcon | 'auto') => {
    setBadgeIcon(id);
    setLogoUrl(generateBrandLogo({ name: companyName, nameEn: companyNameEn, activity: activityType, icon: id, variant: Math.max(0, badgeVariant - 1) }));
    if (badgeVariant === 0) setBadgeVariant(1);
  };

  // Multi-Currency Settings State
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState<boolean>(
    !!(settings.multiCurrency?.enabled && settings.multiCurrency?.configured)
  );
  const [baseCurrency, setBaseCurrency] = useState<string>(
    settings.multiCurrency?.baseCurrency || 'SAR'
  );
  const [currencies, setCurrencies] = useState<CurrencyConfig[]>(
    settings.multiCurrency?.currencies && settings.multiCurrency.currencies.length > 0
      ? settings.multiCurrency.currencies
      : defaultCurrencies
  );

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isUpdatingRates, setIsUpdatingRates] = useState(false);
  const [rateUpdateMessage, setRateUpdateMessage] = useState<string | null>(null);

  // Quick Currency Converter state
  const [calcAmount, setCalcAmount] = useState<number>(100);
  const [calcSourceCurrency, setCalcSourceCurrency] = useState<string>(baseCurrency);

  // Add Currency Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencyNameAr, setNewCurrencyNameAr] = useState('');
  const [newCurrencyNameEn, setNewCurrencyNameEn] = useState('');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
  const [newCurrencyRate, setNewCurrencyRate] = useState('1.00');

  // Pre-configured list for quick selection in modal
  const popularPresets = [
    { code: 'CAD', nameAr: 'دولار كندي', nameEn: 'Canadian Dollar', symbol: 'C$', rate: 2.76 },
    { code: 'JPY', nameAr: 'ين ياباني', nameEn: 'Japanese Yen', symbol: '¥', rate: 0.025 },
    { code: 'TRY', nameAr: 'ليرة تركية', nameEn: 'Turkish Lira', symbol: '₺', rate: 0.11 },
    { code: 'CHF', nameAr: 'فرنك سويسري', nameEn: 'Swiss Franc', symbol: 'CHF', rate: 4.38 },
    { code: 'JOD', nameAr: 'دينار أردني', nameEn: 'Jordanian Dinar', symbol: 'د.أ', rate: 5.29 },
    { code: 'INR', nameAr: 'روبية هندية', nameEn: 'Indian Rupee', symbol: '₹', rate: 0.045 },
  ];

  const buildPayload = (updatedCurrencies?: CurrencyConfig[], newBase?: string, newEnabled?: boolean): CompanySettings => {
    const currsToSave = updatedCurrencies || currencies;
    const baseToSave = newBase || baseCurrency;
    const enabledToSave = newEnabled !== undefined ? newEnabled : multiCurrencyEnabled;
    return {
      companyName,
      companyNameEn: companyNameEn.trim(),
      address,
      shortAddress: shortAddress.trim().toUpperCase() || undefined,
      phone,
      mobile,
      email: email.trim() || undefined,
      vatNumber: vatUnregistered ? '' : vatNumber,
      vatUnregistered: vatUnregistered || undefined,
      grNumber,
      moNumber,
      footer,
      bankName: bankName.trim(),
      bankAccountName: bankAccountName.trim(),
      bankIban: bankIban.replace(/\s+/g, '').toUpperCase(),
      bankAccountNo: bankAccountNo.trim(),
      bankOnA4,
      bankOnReceipt,
      invoiceTerms: invoiceTerms.trim(),
      showTerms,
      // 0% مسموح (منشأة غير مسجّلة في الضريبة) — لا نحوّله إلى 15
      // مقفلة: تبقى كما هي مهما كُتب في الحقل
      taxRate: vatUnregistered ? 0 : taxLockReason ? (settings.taxRate ?? 15) : Number.isFinite(parseFloat(taxRate)) && parseFloat(taxRate) >= 0 ? parseFloat(taxRate) : (settings.taxRate ?? 15),
      pricesIncludeTax,
      activityType,
      oilChangeKm: Math.max(0, parseInt(oilChangeKm, 10) || 5000),
      logoUrl,
      tobaccoFee: { enabled: tobaccoEnabled, ratePercent: Math.max(0, parseFloat(tobaccoRate) || 0), minPerUnit: Math.max(0, parseFloat(tobaccoMin) || 0) },
      printerSettings: settings.printerSettings || {},
      multiCurrency: {
        enabled: enabledToSave,
        configured: true,
        baseCurrency: baseToSave,
        currencies: currsToSave,
      },
    } as CompanySettings;
  };
  // تغييرات غير محفوظة: مقارنة بما حُفظ آخر مرة (أو عند فتح الشاشة)
  const savedSnap = useRef<string | null>(null);
  const currentSnap = JSON.stringify(buildPayload());
  if (savedSnap.current === null) savedSnap.current = currentSnap;
  const dirty = currentSnap !== savedSnap.current;

  const handleSave = (updatedCurrencies?: CurrencyConfig[], newBase?: string, newEnabled?: boolean) => {
    const p = buildPayload(updatedCurrencies, newBase, newEnabled);
    onSaveSettings(p);
    savedSnap.current = JSON.stringify(p);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Ctrl+S: حفظ من أي مكان في الشاشة
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) { e.preventDefault(); saveRef.current(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const handleGeneralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  // Toggle currency enabled/disabled
  const handleToggleCurrency = (code: string) => {
    if (code === baseCurrency) return; // Base currency cannot be disabled
    const updated = currencies.map(c => 
      c.code === code ? { ...c, isEnabled: !c.isEnabled } : c
    );
    setCurrencies(updated);
    handleSave(updated);
  };

  // Update a single currency exchange rate
  const handleUpdateRate = (code: string, newRate: number) => {
    if (code === baseCurrency || isNaN(newRate) || newRate <= 0) return;
    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
    const updated = currencies.map(c => 
      c.code === code ? { ...c, exchangeRate: newRate, lastUpdated: timeStr } : c
    );
    setCurrencies(updated);
    handleSave(updated);
    setRateUpdateMessage(`تم تحديث سعر صرف ${code} إلى ${newRate}`);
    setTimeout(() => setRateUpdateMessage(null), 3000);
  };

  // Set new base currency
  const handleSetBaseCurrency = (code: string) => {
    const targetCurrency = currencies.find(c => c.code === code);
    if (!targetCurrency) return;

    const oldRate = targetCurrency.exchangeRate || 1;
    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;

    // Rebase all currencies against the new base currency
    const updated = currencies.map(c => {
      if (c.code === code) {
        return { ...c, isBase: true, isEnabled: true, exchangeRate: 1.0, lastUpdated: timeStr };
      }
      return {
        ...c,
        isBase: false,
        exchangeRate: Number((c.exchangeRate / oldRate).toFixed(4)),
        lastUpdated: timeStr,
      };
    });

    setBaseCurrency(code);
    setCurrencies(updated);
    setCalcSourceCurrency(code);
    handleSave(updated, code);
    setRateUpdateMessage(`تم تعيين ${targetCurrency.nameAr} (${code}) كعملة أساسية للمنشأة بنجاح!`);
    setTimeout(() => setRateUpdateMessage(null), 3500);
  };

  // Live Exchange Rates Refresh Simulation
  const handleRefreshLiveRates = () => {
    setIsUpdatingRates(true);
    setTimeout(() => {
      const now = new Date();
      const timeStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
      
      const updated = currencies.map(c => {
        if (c.code === baseCurrency || c.isBase) {
          return { ...c, exchangeRate: 1.0, lastUpdated: timeStr };
        }
        // Small market fluctuation simulation (±0.3%)
        const delta = (Math.random() * 0.006 - 0.003);
        const newRate = Number((c.exchangeRate * (1 + delta)).toFixed(4));
        return {
          ...c,
          exchangeRate: newRate > 0 ? newRate : c.exchangeRate,
          lastUpdated: timeStr,
        };
      });

      setCurrencies(updated);
      setIsUpdatingRates(false);
      handleSave(updated);
      setRateUpdateMessage('تم تحديث أسعار الصرف الحية لجميع العملات بنجاح!');
      setTimeout(() => setRateUpdateMessage(null), 4000);
    }, 800);
  };

  // Add new currency
  const handleAddCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrencyCode.trim()) return;

    const code = newCurrencyCode.trim().toUpperCase();
    if (currencies.some(c => c.code === code)) {
      alert('هذه العملة موجودة بالفعل في القائمة!');
      return;
    }

    const now = new Date();
    const timeStr = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;

    const newCurr: CurrencyConfig = {
      code,
      nameAr: newCurrencyNameAr.trim() || code,
      nameEn: newCurrencyNameEn.trim() || code,
      symbol: newCurrencySymbol.trim() || code,
      exchangeRate: parseFloat(newCurrencyRate) || 1.0,
      isBase: false,
      isEnabled: true,
      lastUpdated: timeStr,
    };

    const updated = [...currencies, newCurr];
    setCurrencies(updated);
    handleSave(updated);

    setShowAddModal(false);
    setNewCurrencyCode('');
    setNewCurrencyNameAr('');
    setNewCurrencyNameEn('');
    setNewCurrencySymbol('');
    setNewCurrencyRate('1.00');
    setRateUpdateMessage(`تمت إضافة عملة ${newCurr.nameAr} (${code}) بنجاح!`);
    setTimeout(() => setRateUpdateMessage(null), 3000);
  };

  // Delete custom currency
  const handleDeleteCurrency = (code: string) => {
    if (code === baseCurrency) {
      alert('لا يمكن حذف العملة الأساسية للمنشأة!');
      return;
    }
    if (confirm(`هل أنت متأكد من حذف عملة (${code})؟`)) {
      const updated = currencies.filter(c => c.code !== code);
      setCurrencies(updated);
      handleSave(updated);
    }
  };

  // Helper calculation
  const getConvertedAmount = (amount: number, fromCode: string, toCode: string) => {
    const fromCurr = currencies.find(c => c.code === fromCode);
    const toCurr = currencies.find(c => c.code === toCode);
    if (!fromCurr || !toCurr) return amount;
    // fromCurr.exchangeRate = rate to base
    // amount in base = amount * fromCurr.exchangeRate
    // amount in toCurr = (amount * fromCurr.exchangeRate) / toCurr.exchangeRate
    const amountInBase = amount * (fromCurr.exchangeRate || 1);
    return amountInBase / (toCurr.exchangeRate || 1);
  };

  const activeCurrenciesCount = currencies.filter(c => c.isEnabled).length;
  const currentBaseCurrObj = currencies.find(c => c.code === baseCurrency) || currencies[0];

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full space-y-6" dir="rtl">
      
      {/* Header — ثابت أعلى الشاشة أثناء التمرير: زر الحفظ ظاهر دائماً */}
      <div data-testid="settings-sticky-header" className="sticky -top-4 2xl:-top-6 z-30 -mx-4 2xl:-mx-6 px-4 2xl:px-6 pt-4 2xl:pt-6 -mt-4 2xl:-mt-6 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 shadow-[0_6px_12px_-10px_rgba(0,0,0,0.25)]">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            <span>إعدادات المنشأة وتعدد العملات</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            إدارة بيانات المنشأة الضريبية، دعم تعدد العملات، تحديث أسعار الصرف وعرض الفواتير بالعملات العالمية.
          </p>
        </div>

        {/* Global Save Button */}
        <div className="flex items-center gap-3 shrink-0">
          {dirty ? (
            <span data-testid="settings-dirty" className="text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300/70 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> تغييرات غير محفوظة
            </span>
          ) : savedSuccess ? (
            <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> محفوظ</span>
          ) : null}
          <button
            type="button"
            data-testid="settings-save"
            onClick={() => handleSave()}
            title="حفظ (Ctrl+S)"
            className={`px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition active:scale-95 cursor-pointer ${dirty ? 'ring-4 ring-amber-400/50' : ''}`}
          >
            <Save className="w-4.5 h-4.5" />
            <span>حفظ جميع الإعدادات</span>
            <kbd className="hidden lg:inline text-[10px] font-mono font-bold bg-white/20 rounded px-1.5 py-0.5">Ctrl+S</kbd>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 rounded-t-xl'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-900/50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>بيانات المنشأة والضريبة</span>
        </button>

        <button
          onClick={() => setActiveTab('currency')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer relative ${
            activeTab === 'currency'
              ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 rounded-t-xl'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-900/50'
          }`}
        >
          <Coins className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>إدارة العملات وأسعار الصرف</span>
          <span className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[11px] font-black px-2 py-0.5 rounded-full border border-cyan-500/30">
            {activeCurrenciesCount} نشطة
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tobacco')}
          data-testid="settings-tab-tobacco"
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === 'tobacco'
              ? 'border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-t-xl'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-900/50'
          }`}
        >
          <span className="text-base leading-none">🚬</span>
          <span>رسوم التبغ</span>
          {tobaccoEnabled && <span className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-black px-2 py-0.5 rounded-full border border-amber-500/30">مفعّلة</span>}
        </button>
      </div>

      {/* Status Notifications */}
      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>تم حفظ الإعدادات بنجاح وتطبيقها في جميع الفواتير ونقاط البيع!</span>
        </div>
      )}

      {rateUpdateMessage && (
        <div className="p-4 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <RefreshCw className="w-4 h-4 text-cyan-600 dark:text-cyan-400 animate-spin shrink-0" />
          <span>{rateUpdateMessage}</span>
        </div>
      )}

      {/* TAB 1: General & Tax Settings */}
      {activeTab === 'general' && (
        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 md:p-8 max-w-4xl shadow-xl">
          <form onSubmit={handleGeneralSubmit} className="space-y-6 font-bold text-slate-600 dark:text-slate-300">
            
            {/* Company Logo Section */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-md">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
                <div>
                  <label className="text-slate-900 dark:text-white text-sm font-black flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span>شعار المنشأة / الشركة (Company Logo)</span>
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                    يتم إدراج هذا الشعار تلقائياً في أعلى الفواتير المطبوعة (قالب A4 والإيصالات الحرارية 80 مم) وتقارير الإقفال Z-Report.
                  </p>
                </div>
                {logoUrl && (
                  <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] px-2.5 py-1 rounded-full font-bold self-start sm:self-auto flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>شعار مفعل في الطباعة</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-center gap-5">
                {/* Logo Preview Container */}
                <div className="relative group shrink-0">
                  <div className="w-32 h-32 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 flex items-center justify-center overflow-hidden p-2 shadow-inner">
                    {logoUrl ? (
                      <img 
                        src={logoUrl} 
                        alt="شعار الشركة" 
                        className="w-full h-full object-contain drop-shadow"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <FileImage className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-500 block">لا يوجد شعار</span>
                      </div>
                    )}
                  </div>
                  {logoUrl && (
                    <span className="absolute -bottom-2 -left-2 bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow">
                      معاينة
                    </span>
                  )}
                </div>

                {/* Upload & Generator Controls */}
                <div className="flex-1 space-y-3 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Hidden file input */}
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden" 
                      id="company-logo-upload-input"
                    />

                    {/* Upload from device */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
                    >
                      <Upload className="w-4 h-4" />
                      <span>تحميل صورة شعار (Upload)</span>
                    </button>

                    {/* Generate Brand Badge */}
                    <button
                      type="button"
                      onClick={handleGenerateBrandBadge}
                      className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-300 border border-slate-300 dark:border-slate-700 hover:border-cyan-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      title="توليد شعار رمزي بالاسم التجاري"
                    >
                      <Wand2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      <span>{badgeVariant > 0 ? `شكل آخر للشعار (${((badgeVariant - 1) % BRAND_LOGO_VARIANTS) + 1}/${BRAND_LOGO_VARIANTS})` : 'توليد شعار رمزي للنشاط'}</span>
                    </button>

                    {/* Restore Default Generated Logo */}
                    {defaultCompanyLogoAsset && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl(defaultCompanyLogoAsset)}
                        className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-slate-300 dark:border-slate-700 hover:border-indigo-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                        title="استعادة الشعار النموذجي المولد"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>الشعار النموذجي المعتمد</span>
                      </button>
                    )}

                    {/* Remove Logo */}
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="إلغاء الشعار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>إزالة</span>
                      </button>
                    )}
                  </div>

                  {/* رمز الشعار الرمزي: تلقائي حسب النشاط أو اختيار يدوي */}
                  <div className="space-y-1.5" data-testid="badge-icons">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">رمز الشعار الرمزي:</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => pickBadgeIcon('auto')} data-testid="badge-icon-auto"
                        className={`h-9 px-2.5 rounded-lg border-2 text-[11px] font-black flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 ${badgeIcon === 'auto' ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                        title="حسب نوع النشاط">
                        <img src={brandIconDataUrl(activityIcon(activityType))} alt="" className="w-5 h-5" />
                        تلقائي
                      </button>
                      {BRAND_ICONS.map((ic) => (
                        <button key={ic.id} type="button" onClick={() => pickBadgeIcon(ic.id)} data-testid={`badge-icon-${ic.id}`} title={ic.label}
                          className={`h-9 px-2 rounded-lg border-2 text-[11px] font-bold flex items-center gap-1 cursor-pointer bg-white dark:bg-slate-900 ${badgeIcon === ic.id ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                          <img src={brandIconDataUrl(ic.id)} alt="" className="w-5 h-5" />
                          <span className="hidden sm:inline">{ic.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    الصيغ المدعومة: PNG, JPG, WebP, SVG. يُفضل أن تكون الصورة بخلفية بيضاء أو مفرغة (شفافة) لضمان وضوح عالي في الطابعات الحرارية والورقية.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Store Name */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>اسم المتجر / الشركة *</span>
                </label>
                <input 
                  type="text" 
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200"
                />
              </div>

              {/* اسم المنشأة بالإنجليزي (اختياري) — يُطبع تحت الاسم العربي */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>اسم المنشأة بالإنجليزي (اختياري — يُطبع تحت الاسم العربي)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={companyNameEn}
                  onChange={(e) => setCompanyNameEn(e.target.value)}
                  placeholder="e.g. Al Badr Trading Est."
                  data-testid="company-name-en"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200 text-left"
                />
              </div>

              {/* Activity Type */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>نوع النشاط التجاري *</span>
                </label>
                <select 
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="restaurant">مطعم / مقهى</option>
                  <option value="retail">محلات تجزئة</option>
                  <option value="grocery">بقالة / سوبرماركت (شاشة بيع بالقائمة)</option>
                  <option value="auto">بنشر وتغيير زيوت وكفرات (شاشة بيع بالقائمة + بيانات السيارة)</option>
                  <option value="furniture">تفصيل أثاث ومفروشات (شاشة بيع بالقائمة)</option>
                  <option value="electrical">أدوات الكهرباء والسباكة (شاشة بيع بالقائمة)</option>
                  <option value="perfumes">عطورات وإكسسوارات</option>
                  <option value="pharmacy">صيدلية ومستلزمات طبية</option>
                  <option value="metals">معادن وخردة</option>
                  <option value="other">أنشطة وخدمات أخرى</option>
                </select>
                {activityType === 'auto' && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300" data-testid="oil-km-setting">
                    <span>تغيير الزيت القادم بعد</span>
                    <input type="number" min={0} step={500} value={oilChangeKm} onChange={(e) => setOilChangeKm(e.target.value)}
                      className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 font-mono text-sm" dir="ltr" />
                    <span>كم من قراءة العداد (يُقترح تلقائياً في الفاتورة)</span>
                  </label>
                )}
              </div>

              {/* منشأة غير مسجّلة في ضريبة القيمة المضافة */}
              <div className="md:col-span-2 p-4 rounded-xl border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20" data-testid="setting-vat-unregistered">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">🚫</span>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">منشأتي غير مسجّلة في ضريبة القيمة المضافة</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{vatUnregistered
                        ? 'مفعّل: تُصدر «فاتورة مبيعات» بلا ضريبة ولا رقم ضريبي ولا رمز QR، والربط مع هيئة الزكاة مقفل.'
                        : 'مغلق: تُصدر فاتورة ضريبية مبسطة بالضريبة ورمز QR. فعّله إن لم تكن مسجّلاً في الضريبة.'}</p>
                      {vatUnregistered && <p className="text-[11px] font-black text-amber-700 dark:text-amber-400 mt-1">عند تسجيلك في الضريبة: أزل هذا الاختيار ثم أدخل رقمك الضريبي ونسبة الضريبة.</p>}
                    </div>
                  </div>
                  <button type="button" data-testid="toggle-vat-unregistered" aria-pressed={vatUnregistered}
                    onClick={() => { if (!vatUnregistered && !window.confirm('تفعيل هذا الخيار يوقف إصدار الفواتير الضريبية ويلغي الضريبة من الفواتير الجديدة.\nلا تفعّله إلا إذا كانت منشأتك غير مسجّلة في ضريبة القيمة المضافة. متابعة؟')) return; const next = !vatUnregistered; if (!next && !(parseFloat(taxRate) > 0)) setTaxRate('15'); setVatUnregistered(next); }}
                    className={`w-12 h-6 rounded-full relative shrink-0 ${vatUnregistered ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${vatUnregistered ? 'left-1' : 'right-1'}`} />
                  </button>
                </div>
              </div>

              {/* VAT Number */}
              {!vatUnregistered && <>
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>الرقم الضريبي للهيئة (VAT) *</span>
                </label>
                <input 
                  type="text" 
                  required
                  maxLength={15}
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                  placeholder="مثال: 301234567800003"
                />
              </div>

              {/* Tax Rate */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>نسبة ضريبة القيمة المضافة (%) *</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    required
                    min="0"
                    step="0.01"
                    value={taxLockReason ? String(settings.taxRate ?? 15) : taxRate}
                    readOnly={!!taxLockReason}
                    onChange={(e) => { if (!taxLockReason) setTaxRate(e.target.value); }}
                    data-testid="tax-rate"
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none font-mono ${taxLockReason ? 'bg-slate-100 dark:bg-slate-900 border-amber-400 text-slate-500 cursor-not-allowed pl-10' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:border-indigo-500 text-slate-700 dark:text-slate-200'}`}
                  />
                  {taxLockReason && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg" title="مقفلة">🔒</span>}
                </div>
                {taxLockReason && <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400" data-testid="tax-lock">🔒 مقفلة: {taxLockReason}</p>}
                {taxLockReason && canUnlockTax && (
                  <button type="button" data-testid="tax-unlock" className="text-[11px] font-black text-rose-600 underline"
                    onClick={() => { if (window.confirm('تغيير نسبة الضريبة يؤثر على الفواتير الجديدة فقط.\nلا تغيّرها إلا عند صدور قرار رسمي بتغيير النسبة. متابعة؟')) { setTaxRate(String(settings.taxRate ?? 15)); setTaxUnlocked(true); } }}>
                    تغيير النسبة (عند قرار رسمي فقط)
                  </button>
                )}
              </div>

              {/* Prices include VAT? */}
              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>أسعار البيع المُدخلة للأصناف</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    { v: true, title: 'شاملة الضريبة', ex: (r: number) => `صنف بسعر 100 ← يدفع العميل 100 (منها ضريبة ${(100 - 100 / (1 + r)).toFixed(2)})` },
                    { v: false, title: 'غير شاملة الضريبة', ex: (r: number) => `صنف بسعر 100 ← تُضاف الضريبة فيدفع العميل ${(100 * (1 + r)).toFixed(2)}` },
                  ] as const).map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => setPricesIncludeTax(o.v)}
                      className={`text-right p-3 rounded-xl border transition cursor-pointer ${
                        pricesIncludeTax === o.v
                          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-indigo-400'
                      }`}
                    >
                      <div className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full border-2 ${pricesIncludeTax === o.v ? 'border-indigo-500 bg-indigo-500' : 'border-slate-400'}`} />
                        {o.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-bold">{o.ex(Math.max(0, parseFloat(taxRate) || 0) / 100)}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">ينطبق على شاشة البيع وعروض الأسعار. الفواتير السابقة لا تتغير.</p>
              </div>
              </>}

              {/* G.R. Number */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رقم السجل التجاري (C.R / G.R)</span>
                </label>
                <input 
                  type="text" 
                  value={grNumber}
                  onChange={(e) => setGrNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                  placeholder="رقم السجل التجاري"
                />
              </div>

              {/* M.O. Number */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رقم رخصة المنشأة (M.O)</span>
                </label>
                <input 
                  type="text" 
                  value={moNumber}
                  onChange={(e) => setMoNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                  placeholder="رقم ترخيص البلدية / المنشأة"
                />
              </div>

              {/* Address */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>العنوان الجغرافي *</span>
                </label>
                <input 
                  type="text" 
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200"
                />
              </div>

              {/* العنوان المختصر */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>العنوان المختصر (اختياري)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={20}
                  placeholder="RRRD2929"
                  value={shortAddress}
                  onChange={(e) => setShortAddress(e.target.value.toUpperCase())}
                  data-testid="settings-short-address"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-mono tracking-wider text-right focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200"
                />
                <p className="text-[11px] text-slate-400">من العنوان الوطني (سبل) — يظهر في الفواتير تحت عنوان المنشأة عند تعبئته</p>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رقم الهاتف الثابت (اختياري — يظهر باسم «الهاتف»)</span>
                </label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                />
              </div>

              {/* Mobile */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رقم الجوال (يظهر في الفاتورة باسم «الجوال»)</span>
                </label>
                <input 
                  type="text" 
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>البريد الإلكتروني (اختياري — يظهر في الفاتورة)</span>
                </label>
                <input 
                  type="email" 
                  value={email}
                  data-testid="company-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@example.com"
                  dir="ltr"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 font-mono text-slate-700 dark:text-slate-200"
                />
              </div>

              {/* Invoice Footer */}
              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>رسالة تذييل الفاتورة الضريبية</span>
                </label>
                <input 
                  type="text" 
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200"
                  placeholder="مثال: شكراً لزيارتكم - الفاتورة قابلة للاسترجاع خلال 3 أيام"
                />
              </div>

              {/* الشروط والأحكام */}
              <div className="space-y-2 md:col-span-2" data-testid="terms-settings">
                <label className="block text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>الشروط والأحكام (تظهر في الفاتورة — سطر لكل شرط)</span>
                </label>
                <textarea value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} rows={4} data-testid="terms-input"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200 resize-y"
                  placeholder={'البضاعة المباعة لا ترد ولا تستبدل بعد 7 أيام\nيجب الاحتفاظ بالفاتورة عند الاستبدال'} />
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                  <input type="checkbox" checked={showTerms} onChange={(e) => setShowTerms(e.target.checked)} className="w-4 h-4" data-testid="terms-toggle" />
                  إظهار الشروط والأحكام في الفاتورة
                </label>
              </div>

              {/* الحساب البنكي */}
              <div className="md:col-span-2 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-3" data-testid="bank-settings">
                <div className="text-sm font-black text-indigo-700 dark:text-indigo-300">🏦 الحساب البنكي للتحويل</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="اسم البنك" className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" data-testid="bank-name" />
                  <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="اسم صاحب الحساب" className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                  <input value={bankIban} onChange={(e) => setBankIban(e.target.value.toUpperCase())} dir="ltr" placeholder="IBAN: SA00 0000 0000 0000 0000 0000" className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-right focus:outline-none focus:border-indigo-500" data-testid="bank-iban" />
                  <input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} dir="ltr" placeholder="رقم الحساب (اختياري)" className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-right focus:outline-none focus:border-indigo-500" />
                </div>
                {bankIban.trim() && !/^SA\d{22}$/.test(bankIban.replace(/\s+/g, '')) && <div className="text-xs font-bold text-amber-600">تنبيه: الآيبان السعودي يبدأ بـ SA ويتكون من 24 خانة</div>}
                <div className="flex flex-wrap gap-4 text-sm font-bold">
                  <span className="text-slate-500 text-xs self-center">مكان الظهور:</span>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={bankOnA4} onChange={(e) => setBankOnA4(e.target.checked)} className="w-4 h-4" /> فاتورة A4 (أسفل الإجماليات)</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={bankOnReceipt} onChange={(e) => setBankOnReceipt(e.target.checked)} className="w-4 h-4" /> الإيصال الحراري 80مم</label>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-5 h-5" />
                <span>حفظ التعديلات والبيانات الضريبية</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Multi-Currency & Exchange Rates Settings */}
      {/* TAB 3: رسوم تقديم منتجات التبغ — عند التفعيل يظهر خيار «منتج تبغ» في بطاقة الصنف */}
      {activeTab === 'tobacco' && (
        <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4" data-testid="tobacco-tab">
              {/* رسوم تقديم منتجات التبغ */}
          <div className="space-y-3 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-900/10 p-4" data-testid="tobacco-settings">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tobaccoEnabled} onChange={(e) => setTobaccoEnabled(e.target.checked)} className="w-4 h-4 accent-amber-600" />
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">🚬 رسوم تقديم منتجات التبغ</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-5">
              للمنشآت المرخّصة لتقديم التبغ (مقاهي الشيشة). تُضاف تلقائياً سطراً مستقلاً في الفاتورة عند بيع صنف مُعلَّم «منتج تبغ» في شاشة الأصناف:
              الرسم = نسبة من سعر المنتج قبل الضريبة، بحد أدنى لكل وحدة، وتُحسب ضريبة القيمة المضافة على السعر مع الرسم. الخصم على الفاتورة لا يشمل الرسوم.
            </p>
            {tobaccoEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-slate-500">النسبة من سعر المنتج (%)
                  <input type="number" min="0" step="1" value={tobaccoRate} onChange={(e) => setTobaccoRate(e.target.value)} className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-mono" />
                </label>
                <label className="space-y-1 text-xs text-slate-500">الحد الأدنى لكل وحدة (ريال، قبل الضريبة)
                  <input type="number" min="0" step="0.01" value={tobaccoMin} onChange={(e) => setTobaccoMin(e.target.value)} className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-mono" />
                </label>
                <p className="col-span-2 text-[11px] text-slate-400">الافتراضي حسب لائحة رسوم تقديم منتجات التبغ: 100% وبحد أدنى 25 ريالاً لكل وحدة. مثال: معسّل بـ 18 ريال ← رسم 25، الخاضع للضريبة 43، الضريبة 6.45، الإجمالي 49.45.</p>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">بعد التفعيل والحفظ يظهر خيار «🚬 منتج تبغ» في شاشة إضافة/تعديل الصنف؛ علّم به الأصناف (معسّل، سجائر...) لتُضاف الرسوم تلقائياً عند بيعها.</p>
        </div>
      )}

      {activeTab === 'currency' && (
        <div className="space-y-6">

          {/* Master Enable & Base Currency Banner */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/70 dark:border-slate-800/70 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>نظام تعدد العملات والتحويل الفوري</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      multiCurrencyEnabled 
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                    }`}>
                      {multiCurrencyEnabled ? 'مفعل نشط' : 'معطّل'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    اختر العملة الأساسية لمنشأتك (تعمل دائماً). عند التفعيل تظهر العملات المفعّلة بجانب الإجمالي في شاشة المبيعات وفي الفواتير.
                  </p>
                  {!multiCurrencyEnabled && <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1" data-testid="multi-currency-off-hint">تعدد العملات مغلق: البيع والفواتير بالعملة الأساسية فقط.</p>}
                </div>
              </div>

              {/* Master Toggle */}
              <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">تفعيل تعدد العملات:</span>
                <button
                  type="button"
                  onClick={() => {
                    const newVal = !multiCurrencyEnabled;
                    setMultiCurrencyEnabled(newVal);
                    handleSave(currencies, baseCurrency, newVal);
                  }}
                  className={`w-14 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer flex items-center ${
                    multiCurrencyEnabled ? 'bg-cyan-500 justify-end' : 'bg-slate-200 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-white shadow-md"></div>
                </button>
              </div>
            </div>

            {/* Base Currency Selector & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>العملة الأساسية للنظام (Base Currency)</span>
                </span>
                <div className="flex items-center gap-3">
                  <select
                    value={baseCurrency}
                    onChange={(e) => handleSetBaseCurrency(e.target.value)}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-black text-sm focus:border-cyan-500 outline-none cursor-pointer"
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.nameAr} ({c.code} - {c.symbol})
                      </option>
                    ))}
                  </select>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 font-black text-base px-2 py-1 bg-cyan-950/50 border border-cyan-800/40 rounded-lg inline-flex items-center gap-1">
                    {currentBaseCurrObj.code === 'SAR' || currentBaseCurrObj.symbol === 'ر.س' || currentBaseCurrObj.symbol === '⃁' || currentBaseCurrObj.symbol === '﷼' ? (
                      <SaudiRiyalSymbol raw className="w-4 h-4" />
                    ) : (
                      currentBaseCurrObj.symbol
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  يتم حفظ جميع القيود المحاسبية ومخزون المنتجات بهذه العملة الأساسية.
                </p>
              </div>

              {/* Exchange Rates Live Sync Action */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block flex items-center gap-1.5 mb-1">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>تحديث أسعار الصرف الحية</span>
                  </span>
                  <p className="text-[11px] text-slate-500">
                    مزامنة فورية لأسعار العملات مقابل {currentBaseCurrObj.nameAr} بناءً على أسعار البنوك والأسواق.
                  </p>
                </div>
                <div className="pt-3">
                  <button
                    onClick={handleRefreshLiveRates}
                    disabled={isUpdatingRates}
                    className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-cyan-700 dark:text-cyan-300 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingRates ? 'animate-spin text-cyan-600 dark:text-cyan-400' : ''}`} />
                    <span>{isUpdatingRates ? 'جاري جلب أسعار الصرف...' : 'تحديث أسعار الصرف الآن'}</span>
                  </button>
                </div>
              </div>

              {/* Add Custom Currency Quick Trigger */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block flex items-center gap-1.5 mb-1">
                    <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>إضافة عملة جديدة</span>
                  </span>
                  <p className="text-[11px] text-slate-500">
                    أضف أي عملة دولية أو إقليمية مخصصة وتحديد سعر الصرف المعتمد لها.
                  </p>
                </div>
                <div className="pt-3">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة عملة مخصصة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Currency Converter Simulator */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
                <Calculator className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>حاسبة تحويل العملات المباشرة (Live Converter)</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                اختبر أسعار الصرف المحسوبة قبل تطبيقها على الفواتير
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block">المبلغ المراد تحويله:</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white font-mono font-bold text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block">من عملة:</label>
                <select
                  value={calcSourceCurrency}
                  onChange={(e) => setCalcSourceCurrency(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-cyan-600 dark:text-cyan-400 font-bold text-sm focus:border-cyan-500 outline-none cursor-pointer"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.nameAr} ({c.code} {c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Conversion results strip */}
              <div className="md:col-span-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3 flex items-center justify-between overflow-x-auto gap-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span>النتائج:</span>
                </div>
                <div className="flex gap-4">
                  {currencies.filter(c => c.isEnabled && c.code !== calcSourceCurrency).slice(0, 4).map(c => {
                    const converted = getConvertedAmount(calcAmount, calcSourceCurrency, c.code);
                    return (
                      <div key={c.code} className="text-center px-3 py-1 bg-white/60 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">{c.code}</span>
                        <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {converted.toFixed(2)} {c.symbol}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Currencies Management Table */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white/30 dark:bg-slate-900/30">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  <span>قائمة العملات المعتمدة وأسعار الصرف</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  تعديل أسعار الصرف المباشرة مقابل ({currentBaseCurrObj.nameAr}) وتفعيل العملات لعرض الفواتير.
                </p>
              </div>

              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                1 {currentBaseCurrObj.code} = العملة الأساسية
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-black">
                    <th className="p-4 pr-6">العملة والرمز</th>
                    <th className="p-4">كود العملة</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">سعر الصرف المعتمد (مقابل {currentBaseCurrObj.symbol})</th>
                    <th className="p-4">المعادلة المباشرة</th>
                    <th className="p-4">آخر تحديث</th>
                    <th className="p-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-bold text-slate-600 dark:text-slate-300">
                  {currencies.map(currency => {
                    const isBase = currency.code === baseCurrency;
                    return (
                      <tr 
                        key={currency.code} 
                        className={`hover:bg-white/40 dark:hover:bg-slate-900/40 transition-colors ${
                          isBase ? 'bg-cyan-500/5' : ''
                        }`}
                      >
                        {/* Name & Symbol */}
                        <td className="p-4 pr-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-mono font-black text-slate-900 dark:text-white text-sm">
                              {currency.code === 'SAR' || currency.symbol === 'ر.س' || currency.symbol === '⃁' || currency.symbol === '﷼' ? (
                                <SaudiRiyalSymbol raw className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                              ) : (
                                currency.symbol
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-900 dark:text-white font-black text-sm">{currency.nameAr}</span>
                                {isBase && (
                                  <span className="text-[10px] bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
                                    الأساسية
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500">{currency.nameEn || currency.code}</span>
                            </div>
                          </div>
                        </td>

                        {/* Currency Code */}
                        <td className="p-4 font-mono font-black text-slate-700 dark:text-slate-200">
                          <span className="px-2 py-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 text-xs">
                            {currency.code}
                          </span>
                        </td>

                        {/* Status Toggle */}
                        <td className="p-4">
                          {isBase ? (
                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>دائماً نشطة</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleCurrency(currency.code)}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                currency.isEnabled
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${currency.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                              <span>{currency.isEnabled ? 'مفعلة بالفواتير' : 'معطلة'}</span>
                            </button>
                          )}
                        </td>

                        {/* Exchange Rate Input */}
                        <td className="p-4">
                          {isBase ? (
                            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-black text-sm">
                              1.0000 {currentBaseCurrObj.symbol}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2 max-w-[200px]">
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">1 {currency.code} =</span>
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                defaultValue={currency.exchangeRate}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val > 0 && val !== currency.exchangeRate) {
                                    handleUpdateRate(currency.code, val);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    if (!isNaN(val) && val > 0) {
                                      handleUpdateRate(currency.code, val);
                                    }
                                  }
                                }}
                                className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white font-mono font-bold text-xs focus:border-cyan-500 outline-none text-center"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{currentBaseCurrObj.symbol}</span>
                            </div>
                          )}
                        </td>

                        {/* Inverted Rate Helper */}
                        <td className="p-4 font-mono text-slate-500 dark:text-slate-400 text-xs">
                          {isBase ? (
                            <span>1 {currentBaseCurrObj.symbol} = 1.00</span>
                          ) : (
                            <span>
                              100 {currentBaseCurrObj.symbol} = {(100 / currency.exchangeRate).toFixed(2)} {currency.symbol}
                            </span>
                          )}
                        </td>

                        {/* Last updated */}
                        <td className="p-4 font-mono text-[11px] text-slate-500">
                          {currency.lastUpdated || 'محدث تلقائياً'}
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isBase && (
                              <>
                                <button
                                  onClick={() => handleSetBaseCurrency(currency.code)}
                                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                                  title="تعيين هذه العملة كأساس للنظام"
                                >
                                  تعيين كأساس
                                </button>
                                <button
                                  onClick={() => handleDeleteCurrency(currency.code)}
                                  className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer"
                                  title="حذف العملة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer info */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/20 dark:bg-slate-900/20 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>
                  ملاحظة: عند تفعيل العملات، سيظهر محول العملات أعلى شاشة الفاتورة لطباعتها أو عرضها بالعملة المطلوبة فوراً.
                </span>
              </div>
              <button
                onClick={() => handleSave()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>حفظ العملات وأسعار الصرف</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Add Currency Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 text-right shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-lg">
                <Coins className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <span>إضافة عملة جديدة وتحديد سعر الصرف</span>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Popular Presets Quick Pick */}
            <div className="space-y-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block">عملات شائعة جاهزة للاختيار السريع:</label>
              <div className="grid grid-cols-3 gap-2">
                {popularPresets.map(preset => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => {
                      setNewCurrencyCode(preset.code);
                      setNewCurrencyNameAr(preset.nameAr);
                      setNewCurrencyNameEn(preset.nameEn);
                      setNewCurrencySymbol(preset.symbol);
                      setNewCurrencyRate(preset.rate.toString());
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      newCurrencyCode === preset.code
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-black'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="font-mono block text-xs font-black">{preset.code}</span>
                    <span className="text-[11px] block text-slate-500 dark:text-slate-400">{preset.nameAr}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddCurrency} className="space-y-4 pt-1 font-bold">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">رمز العملة الدولي (ISO Code) *</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    placeholder="مثال: CAD"
                    value={newCurrencyCode}
                    onChange={(e) => setNewCurrencyCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white font-mono uppercase focus:border-cyan-500 outline-none text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">رمز العملة (Symbol) *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: C$ أو $"
                    value={newCurrencySymbol}
                    onChange={(e) => setNewCurrencySymbol(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white font-mono focus:border-cyan-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">الاسم بالعربية *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: دولار كندي"
                    value={newCurrencyNameAr}
                    onChange={(e) => setNewCurrencyNameAr(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:border-cyan-500 outline-none text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    placeholder="مثال: Canadian Dollar"
                    value={newCurrencyNameEn}
                    onChange={(e) => setNewCurrencyNameEn(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:border-cyan-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  سعر الصرف (1 {newCurrencyCode || 'العملة'} = كم {currentBaseCurrObj.symbol}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  placeholder={`سعر الصرف مقابل ${currentBaseCurrObj.nameAr}`}
                  value={newCurrencyRate}
                  onChange={(e) => setNewCurrencyRate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white font-mono text-sm focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-sm transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  إضافة العملة وحفظها
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
