import React, { useState, useEffect, useRef, useMemo, useDeferredValue, useCallback } from 'react';
import DateField from './components/DateField';
import SalesStatsView from './components/SalesStatsView';
import { usePagedList, Pagination } from './utils/usePagedList';
/** مفتاح بطاقة «أصناف أخرى» (أصناف بلا مجموعة) */
const UNGROUPED = '__ungrouped__';
import appIcon from './assets/app-icon.svg';
import { defaultAppIconSetting, toSquarePng, type AppIconSetting } from './utils/appIcon';
import { can, canView, firstAllowedView, type Permission } from './utils/auth';
import LoginScreen from './components/LoginScreen';
import NetworkSettings from './components/NetworkSettings';
import AccountingManager, { type BranchSource } from './components/AccountingManager';
import BranchesManager from './components/BranchesManager';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCT_SETTINGS, type Account, type AccountingSettings, type JournalEntry, type SourceData } from './utils/accounting';
import ApprovalModal from './components/ApprovalModal';
import { 
  ShoppingBag, User, Menu, Trash2, CreditCard, Printer, Banknote, 
  Plus, Minus, X, Keyboard, Building2, Package, Store, Utensils,
  Palette, BarChart3, History, LockKeyhole, ShieldAlert, MonitorCheck, Sun, Moon, 
  Search, PlusCircle, Edit, Layers, FolderTree, Server, CheckCircle2,
  Calendar, FileText, UserCircle, ChefHat, FileDigit, ArrowRightLeft,
  Truck, FileBox, UserCog, Receipt, Percent, Tag, BadgePercent,
  PauseCircle, Clock, RotateCcw, AlertCircle, AlertTriangle, Eye, Zap, Coins, Sparkles,
  ChevronDown, ChevronUp, Boxes, Ruler, Maximize2, Sliders,
  Inbox, Scale,
  MonitorSmartphone, ScanLine, ArrowRight, StickyNote,
  PencilLine, Car,
} from 'lucide-react';
import { Product, Customer, Invoice, Supplier, PurchaseInvoice, PurchaseReturn, CompanySettings, ParkedOrder, CartItem, ProductGroup, BundleItem, ProductUnit, VehicleInfo, PayMethod, CashMovement } from './types';
import { initialCustomers, initialInvoices, defaultCompanySettings, initialProductGroups } from './data';
import { usePersistentState, saveUrgently, replaceCollection, flushNow, getNetInfo } from './storage/persistence';
/** رمز واسم هذا الجهاز في المستندات الجديدة (عند ربط الأجهزة) */
/** أعمدة جدول شاشة البقالة: # · الصنف · الكمية · السعر · الإجمالي · حذف */
const GROCERY_COLS = '2.25rem minmax(0,1fr) 9.5rem 6rem 6.5rem 2.75rem';
/** نفس الأعمدة مع عمود «الضريبة» بعد السعر */
const GROCERY_COLS_VAT = '2.25rem minmax(0,1fr) 9.5rem 6rem 4.75rem 6.5rem 2.75rem';
const deviceStamp = (): { deviceTag?: string; deviceName?: string } => { const n = getNetInfo(); return n && n.role !== 'standalone' && n.tag ? { deviceTag: n.tag, deviceName: n.deviceName || undefined } : {}; };
import { TOBACCO_FEE_ID, TOBACCO_FEE_NAME, tobaccoFeePerUnit } from './utils/tobacco';
const DELIVERY_FEE_ID = '__delivery_fee__';
const DELIVERY_FEE_NAME = 'رسوم التوصيل';
/** أسطر النظام (رسوم التبغ / التوصيل): لا تُعدَّل كميتها ولا سعرها من السلة */
const isFeeLineId = (id: string) => id.startsWith(TOBACCO_FEE_ID) || id === DELIVERY_FEE_ID;
const isSysLine = (c: { isTobaccoFee?: boolean; isDeliveryFee?: boolean }) => !!(c.isTobaccoFee || c.isDeliveryFee);
import DataResetPanel, { type ResetChoice } from './components/DataResetPanel';
import ReportsView from './components/ReportsView';
import PrintersManager from './components/PrintersManager';
import BackupManager from './components/BackupManager';
import { PartialPaymentModal, InvoicePaymentModal, type PartialPaymentData } from './components/PaymentModals';
import SalesReturnModal from './components/SalesReturnModal';
import ScannedInvoicePanel from './components/ScannedInvoicePanel';
import PosInvoiceSearch from './components/PosInvoiceSearch';
import QuotationsManager, { type ConvertOptions } from './components/QuotationsManager';
import PosCustomerPicker from './components/PosCustomerPicker';
import QuickProductModal from './components/QuickProductModal';
import { belowCostProducts } from './utils/belowCost';
import EditItemPicker from './components/EditItemPicker';
import BarcodeLabelsDialog from './components/BarcodeLabelsDialog';
import PromotionsManager from './components/PromotionsManager';
import { bestPromo, type Promotion } from './utils/promotions';
import { isAutoActivity, cleanVehicle, hasVehicle, lastVisit, vehicleRows } from './utils/vehicle';
import type { Quotation, AppUser } from './types';
import type { ProductsImportResult } from './components/ProductsImportExport';
import PurchaseReturnsManager from './components/PurchaseReturnsManager';
import LicenseView from './components/LicenseView';
import LicenseBanner from './components/LicenseBanner';
import SettingsSearch from './components/SettingsSearch';
import { useLicense, hasFeature, hasLicensedFeature } from './utils/license';
import { expiryState, mergeExpiry } from './utils/expiry';
import DevicesSettings, { DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from './components/DevicesSettings';
import { DEFAULT_VFD_SETTINGS, vfdFrame, vfdLine, vfdLines } from './utils/vfd';
import { DEFAULT_SCALE_SETTINGS, parseScaleBarcode, parseScaleLine, type ScaleSettings } from './utils/scale';
import { defaultPrintSettings, printCurrentPage, printHtmlDocument, printKitchenTicket, PRINT_CANCELLED, isElectron, listOsPrinters, DEFAULT_KITCHEN_MAIN, type AfterSaleMode, setA4Theme, setReceiptLogo, setThermal, setDocBarcodes, docBarcodeOn, largePaper, setLargePaperOverride, letterhead, letterheadSettings, setLetterheadSuppressed, DEFAULT_LETTERHEAD, dotMatrix, dotMatrixCss, dotMatrixSetting, plainTheme, previewPaperOn, visiblePreviewPaper, setDotMatrixSuppressed, continuousPaper, CONTINUOUS_PAPERS, CONTINUOUS_SIDE_MM, thermalPdfPrep, type DotMatrixPaper, setPdfRender, printBilingual, setPrintBilingual, bilingualPrintOn, PAGE_NO_BI, extrasPdfOnlyActive, hidePrintExtras, thermalDims, receiptLogoMm, a4Colors, appFontCss, type PrintSettings } from './utils/printing';
import { docBarcodeHtml } from './utils/barcode';
import { displayTs } from './utils/shiftReport';
import { findInvoiceByCode, findQuotationByCode, scanCandidates, latinBarcodeKeyDown, useBarcodeScanner, type ScanRequest } from './utils/docScan';
import { localTimestamp } from './utils/files';
import { printStampCss } from './utils/printStamp';
import { contactParts, contactLine } from './utils/contact';
import { invoiceRemaining, isUnsettled, round2, customerLabel, GENERAL_CUSTOMER, paymentLabel, isReturnDoc, splitParts, bundleQty } from './utils/invoiceMath';
import { computeReturn, buildReturnDoc, hasReturnableQty, returnedQtyByLine } from './utils/returns';
import type { SalesReturnRequest } from './components/SalesReturnModal';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';

// Import newly activated manager components
import InvoicesList from './components/InvoicesList';
import CashBoxManager from './components/CashBoxManager';
import ProductsManager from './components/ProductsManager';
import InventoryManager from './components/InventoryManager';
import SettingsView from './components/SettingsView';
import CustomersManager from './components/CustomersManager';
import SuppliersManager from './components/SuppliersManager';
import PurchasesManager from './components/PurchasesManager';
import UsersManager from './components/UsersManager';
import InvoiceView from './components/InvoiceView';
import ZReportManager, { type ZReportRecord } from './components/ZReportManager';
import SaudiRiyalSymbol, { setBaseCurrencySymbol } from './components/SaudiRiyalSymbol';
import { currencyState, toCurrency } from './utils/currency';
import { englishNameOf, setProductsForNames } from './utils/itemNames';
import { beepError } from './utils/beep';
import OnScreenKeyboard from './components/OnScreenKeyboard';
import { setLanguage, tr as trUi, type UiLang } from './i18n';
import DiscountModal from './components/DiscountModal';
import { generateZatcaTlvBase64, generateQrDataUrl } from './utils/zatca';
import { buildZatcaDoc, isValidVat } from './utils/zatcaDoc';
import ShareMenu from './components/ShareMenu';
import { shareDocument, type ShareTarget } from './utils/share';
import { checkDiscount, DEFAULT_DISCOUNT_RULES, type DiscountRules } from './utils/discountRules';
import { renderToStaticMarkup } from 'react-dom/server';
import { tafqeet, amountInWordsEn } from './utils/tafqeet';
import ZatcaPanel from './components/ZatcaPanel';
import FeatureLocked from './components/FeatureLocked';
import AboutView from './components/AboutView';
import ZatcaUnsentBanner from './components/ZatcaUnsentBanner';
import type { CustomerDraft } from './components/CustomerForm';
import type { InvoiceZatca, InvoiceItem } from './types';

type ExtendedViewType = 
  | 'pos' 
  | 'barcodeLabels'
  | 'quotations'
  | 'dailyReports'
  | 'stats'
  | 'salesLog' 
  | 'dailyClosing' 
  | 'invoices' 
  | 'creditInvoices'
  | 'cashBox'
  | 'products' 
  | 'promotions'
  | 'productGroups'
  | 'inventory'
  | 'customers' 
  | 'suppliers' 
  | 'purchases' 
  | 'purchaseReturns'
  | 'users' 
  | 'printers' 
  | 'devices'
  | 'settings' 
  | 'appSettings'
  | 'network'
  | 'accounting'
  | 'branches'
  | 'einvoice'
  | 'backup'
  | 'about'
  | 'license';

type BusinessType = 'restaurant' | 'retail';

interface Variant { id: string; name: string; price: number; }
interface ExtendedProduct extends Product { variants?: Variant[]; units?: ProductUnit[]; }
interface AppPrinter { id: string; name: string; osPrinterName: string; type: 'cashier' | 'kitchen' | 'section'; template: 'thermal80' | 'A4' | 'kitchenTicket'; status: 'online' | 'offline'; silent?: boolean; offsetMm?: number; ticketTemplate?: 'ticket' | 'priced'; raw?: boolean; padRightMm?: number; padLeftMm?: number; fontPct?: number; copies?: number; }
interface AppCategory { id: string; name: string; printerId: string; }

export default function App() {
  const [productGroups, setProductGroups] = usePersistentState<ProductGroup[]>('productGroups', initialProductGroups);

  const [products, setProducts] = usePersistentState<ExtendedProduct[]>('products', []);
  useMemo(() => setProductsForNames(products), [products]);
  // لغة الواجهة: العربية (الافتراضي) أو الإنجليزية — القوائم والشاشات فقط، الفواتير المطبوعة تبقى كما هي
  const [uiLanguage, setUiLanguage] = usePersistentState<UiLang>('uiLanguage', 'ar');
  useEffect(() => { setLanguage(uiLanguage === 'en' ? 'en' : 'ar'); }, [uiLanguage]);
  // اتجاه الواجهة من حالة React نفسها (لا من المترجم) — فالقائمة الجانبية تثبت يساراً في الإنجليزية من أول رسم
  const uiDir: 'rtl' | 'ltr' = uiLanguage === 'en' ? 'ltr' : 'rtl';
  // مكان القائمة الجانبية: تلقائي (العربي يمين، الإنجليزي يسار) أو يمين/يسار دائماً
  const [sidebarSide, setSidebarSide] = usePersistentState<'auto' | 'right' | 'left'>('sidebarSide', 'auto');
  const sideIsLeft = sidebarSide === 'left' || (sidebarSide === 'auto' && uiDir === 'ltr');
  // في صف flex: أول عنصر يكون يميناً في rtl ويساراً في ltr — نعكس الصف عند الحاجة
  const sideReverse = sideIsLeft !== (uiDir === 'ltr');
  
  const [printersList, setPrintersList] = usePersistentState<AppPrinter[]>('printersList', []);
  const [printSettings, setPrintSettings] = usePersistentState<PrintSettings>('printSettings', defaultPrintSettings);
  // قالب ألوان A4 يُطبَّق على كل المستندات قبل رسمها/طباعتها
  setA4Theme(printSettings.a4Theme);
  setReceiptLogo(printSettings.receiptLogo);
  setThermal(printSettings);
  setDocBarcodes(printSettings);
  // اسم طابعة ويندوز الافتراضية (لمعرفة طريقة الطباعة المناسبة حين لا تُحدَّد طابعة الإيصالات) — بعد الإقلاع بقليل
  useEffect(() => { if (!isElectron() || printSettings.receiptPrinter) return; const t = setTimeout(() => { void listOsPrinters(); }, 5000); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [isPartialModalOpen, setIsPartialModalOpen] = useState<boolean>(false);
  const [invoiceNote, setInvoiceNote] = useState<string>('');
  const [vehicle, setVehicle] = useState<VehicleInfo>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState<boolean>(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState<boolean>(false);
  const [editPickerOpen, setEditPickerOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [quotations, setQuotations] = usePersistentState<Quotation[]>('quotations', []);
  // حركات الصندوق اليدوية (إدخال مبلغ / صرف مبلغ)
  const [cashMovements, setCashMovements] = usePersistentState<CashMovement[]>('cashMovements', []);
  // المحاسبة (Pro): دليل الحسابات، القيود اليدوية والسندات، والإعدادات — القيود الآلية تُشتق من المستندات
  const [accounts, setAccounts] = usePersistentState<Account[]>('accounts', DEFAULT_ACCOUNTS);
  const [journalEntries, setJournalEntries] = usePersistentState<JournalEntry[]>('journalEntries', []);
  const [acctSettings, setAcctSettings] = usePersistentState<AccountingSettings>('accountingSettings', DEFAULT_ACCT_SETTINGS);
  // ربط الفروع (Pro): في المركز تظهر الفروع في القوائم المالية (لكل فرع وموحّدة)
  const [hqBranches, setHqBranches] = useState<{ label: string; list: { id: string; code: string; name: string }[] } | null>(null);
  // العهدة: نقد يبدأ به الدرج كل وردية (مقفلة افتراضياً)
  const [cashFloat, setCashFloat] = usePersistentState<{ enabled: boolean; amount: number }>('cashFloat', { enabled: false, amount: 0 });

  const [categoriesList, setCategoriesList] = usePersistentState<AppCategory[]>('categoriesList', []);

  const [invoices, setInvoices] = usePersistentState<Invoice[]>('invoices', initialInvoices);
  // إعدادات البيع: قفل البيع بالسالب (افتراضياً مفتوح = يُسمح) وتنبيهات المخزون (افتراضياً مغلقة)
  const [blockNegativeStock, setBlockNegativeStock] = usePersistentState<boolean>('blockNegativeStock', false);
  // منع البيع بأقل من التكلفة (مفعّل افتراضياً من 2.2.68) + هامش ربح أدنى اختياري فوق التكلفة (0 = لا يُباع بأقل من التكلفة)
  // v: يُفعَّل المنع مرة واحدة للتثبيتات السابقة، وبعدها يُحترم اختيار المستخدم إن أوقفه
  const [belowCostRule, setBelowCostRule] = usePersistentState<{ enabled: boolean; minMarginPct: number; v?: number }>('belowCostRule', { enabled: true, minMarginPct: 0, v: 0 });
  useEffect(() => {
    if ((belowCostRule.v || 0) < 2) setBelowCostRule((r) => ({ ...r, enabled: true, v: 2 }));
  }, [belowCostRule.v]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showStockAlerts, setShowStockAlerts] = usePersistentState<boolean>('showStockAlerts', false);
  const [discountRules, setDiscountRules] = usePersistentState<DiscountRules>('discountRules', DEFAULT_DISCOUNT_RULES);
  // وضع اللمس: واجهة وأزرار أكبر لشاشات اللمس
  const [touchMode, setTouchMode] = usePersistentState<boolean>('touchMode', false);
  // لوحة مفاتيح على شاشة البيع (لأجهزة اللمس بلا لوحة مفاتيح): تُفعَّل من إعدادات التطبيق ويظهر زرها بجانب السلة
  const [posKeyboard, setPosKeyboard] = usePersistentState<boolean>('posKeyboard', false);
  const [oskOpen, setOskOpen] = useState(false);
  const lastInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest('[data-testid=pos-osk]')) return;
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(t.type) && !t.readOnly)) lastInputRef.current = t;
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);
  // إخفاء شريط مهام ويندوز (ملء الشاشة) — مغلق افتراضياً
  const [hideTaskbar, setHideTaskbar] = usePersistentState<boolean>('hideTaskbar', false);
  // السماح بتعديل سعر الصنف في السلة — مفعّل افتراضياً (مع صلاحية المستخدم)
  const [allowPriceEdit, setAllowPriceEdit] = usePersistentState<boolean>('allowPriceEdit', true);
  // شاشة البيع بالقائمة: زر تعليق على الصنف (مفعّل افتراضياً) وزر خصم الصنف (يُظهَر من الإعدادات)
  const [lineNoteBtn, setLineNoteBtn] = usePersistentState<boolean>('posLineNote', true);
  const [lineDiscBtn, setLineDiscBtn] = usePersistentState<boolean>('posLineDiscount', false);
  const [lineSerialBtn, setLineSerialBtn] = usePersistentState<boolean>('posLineSerial', false);
  // عمود «الضريبة» في شاشة البيع بالقائمة بعد السعر (مقفل افتراضياً)
  const [listVatCol, setListVatCol] = usePersistentState<boolean>('posListVatCol', false);
  // زر الرقم التسلسلي في شاشة البيع بالبطاقات (بجانب الوصف والخصم) — مخفي افتراضياً
  const [cardSerialBtn, setCardSerialBtn] = usePersistentState<boolean>('posCardSerial', false);
  // عكس زرّي «دفع كاش» و«دفع شبكة» (مفعّل افتراضياً: الشبكة أولاً)
  const [swapPayButtons, setSwapPayButtons] = usePersistentState<boolean>('swapPayButtons', true);
  // تأكيد الدفع: مقفل افتراضياً — عند تفعيله يُسأل الكاشير قبل حفظ الفاتورة
  const [confirmPayment, setConfirmPayment] = usePersistentState<boolean>('confirmPayment', false);
  const [payConfirm, setPayConfirm] = useState<null | { args: [CheckoutMethod, number | undefined, boolean | undefined, CheckoutPartial | undefined, CheckoutSplit | undefined]; total: number; paid: number; change: number; remaining: number; label: string; split?: CheckoutSplit }>(null);
  // رسوم التوصيل: مقفلة افتراضياً — سطر «رسوم التوصيل» في الفاتورة (خاضع للضريبة، خارج الخصم)
  const [deliverySettings, setDeliverySettings] = usePersistentState<{ enabled: boolean; amount: number }>('deliveryFee', { enabled: false, amount: 10 });
  const [deliveryOn, setDeliveryOn] = useState(false);
  // العروض والتخفيضات (مشتركة بين الأجهزة المربوطة)
  const [promotions, setPromotions] = usePersistentState<Promotion[]>('promotions', []);
  // تكلفة الصنف عند الشراء: متوسط مرجّح (الافتراضي) أو آخر سعر شراء
  const [costMethod, setCostMethod] = usePersistentState<'average' | 'last'>('costMethod', 'average');
  // ملصقات باركود أصناف فاتورة مشتريات
  const [purchaseLabels, setPurchaseLabels] = useState<PurchaseInvoice | null>(null);
  const [deliveryAmt, setDeliveryAmt] = useState<string>('');
  const [editingSerialId, setEditingSerialId] = useState<string | null>(null);
  // أجهزة نقطة البيع: درج النقود، شاشة العميل، الميزان
  const [savedDevices, setDeviceSettings] = usePersistentState<DeviceSettings>('deviceSettings', DEFAULT_DEVICE_SETTINGS);
  const deviceSettings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS, ...savedDevices };
  const [savedScale, setScaleSettings] = usePersistentState<ScaleSettings>('scaleSettings', DEFAULT_SCALE_SETTINGS);
  const scaleSettings: ScaleSettings = { ...DEFAULT_SCALE_SETTINGS, ...savedScale };
  const [liveWeight, setLiveWeight] = useState<number | null>(null);
  const [scaleStatus, setScaleStatus] = useState<{ connected: boolean; reason?: string }>({ connected: false });
  const [displayPaid, setDisplayPaid] = useState<{ total: number; paid: number; change: number } | null>(null);
  // الترخيص: تجربة / سنوي / شراء كامل — عند الانتهاء: قراءة فقط
  const license = useLicense();
  /** يمنع إنشاء المستندات (بيع، مرتجع، شراء، عرض سعر) خارج فترة الترخيص */
  const requireLicense = (): boolean => {
    if (license.licensed) return true;
    triggerPrintNotification('🔑 البرنامج في وضع القراءة فقط — فعّل الترخيص من شاشة «الترخيص والتفعيل»', 5000);
    return false;
  };
  // تاريخ الصلاحية: أيام التنبيه قبل الانتهاء، ومنع بيع المنتهي
  // أزرار الدفع الإضافية في شاشة البيع (إظهار/إخفاء من إعدادات التطبيق)
  const [savedPosButtons, setPosButtons] = usePersistentState<{ credit: boolean; bank: boolean; quickPay: boolean; split?: boolean }>('posButtons', { credit: true, bank: true, quickPay: true, split: true });
  const posButtons = Object.assign({ credit: true, bank: true, quickPay: true, split: true }, savedPosButtons);
  // المطعم: نوع الطلب (محلي/سفري/توصيل) ورقم الطلب المتسلسل (يُصفَّر عند الإقفال اليومي)
  type OrderType = 'dine_in' | 'takeaway' | 'delivery';
  const [savedRestOpts, setRestOpts] = usePersistentState<{ orderTypes: boolean; orderNumbers: boolean; resetOnClosing: boolean; defaultOrderType?: OrderType }>('restaurantOptions', { orderTypes: true, orderNumbers: true, resetOnClosing: true, defaultOrderType: 'dine_in' });
  const restOpts = Object.assign({ orderTypes: true, orderNumbers: true, resetOnClosing: true, defaultOrderType: 'dine_in' as OrderType }, savedRestOpts);
  const [orderCounter, setOrderCounter] = usePersistentState<number>('orderCounter', 0);
  const [orderType, setOrderType] = useState<OrderType>(restOpts.defaultOrderType);
  // نوع الطلب المفضّل: يُطبَّق عند التغيير في الإعدادات وبعد كل عملية بيع
  useEffect(() => { setOrderType(restOpts.defaultOrderType); }, [restOpts.defaultOrderType]);
  const [savedExpiry, setExpirySettings] = usePersistentState<{ warnDays: number; blockSale: boolean }>('expirySettings', { warnDays: 30, blockSale: false });
  const expirySettings = Object.assign({ warnDays: 30, blockSale: false }, savedExpiry);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState<boolean>('sidebarCollapsed', false);
  // مربع «الباقي» بعد البيع النقدي (مفعّل افتراضياً) — وقالب المعاينة عند إلغاء الطباعة الصامتة (A4 افتراضياً)
  const [showChangeBox, setShowChangeBox] = usePersistentState<boolean>('showChangeBox', true);
  const [previewTemplate, setPreviewTemplate] = usePersistentState<'A4' | 'thermal80'>('previewTemplate', 'A4');
  useEffect(() => { document.documentElement.classList.toggle('touch-mode', !!touchMode); }, [touchMode]);
  // نسبة تكبير الواجهة مع وضع شاشة اللمس — لكل جهاز (localStorage) لأن مقاس الشاشة يختلف بين الأجهزة المربوطة
  const [uiZoom, setUiZoomState] = useState<number>(() => { try { const v = Number(localStorage.getItem('sl-ui-zoom')); return v >= 60 && v <= 160 ? v : 100; } catch { return 100; } });
  const setUiZoom = (v: number) => { const z = Math.min(160, Math.max(60, Math.round(v / 5) * 5)); setUiZoomState(z); try { localStorage.setItem('sl-ui-zoom', String(z)); } catch { /* تجاهل */ } };
  useEffect(() => {
    const z = touchMode ? uiZoom / 100 : 1;
    if (window.ledger?.ui?.setZoom) window.ledger.ui.setZoom(z);
    else (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = z === 1 ? '' : String(z);
  }, [touchMode, uiZoom]);
  useEffect(() => { void window.ledger?.app.setFullScreen?.(!!hideTaskbar).catch(() => {}); }, [hideTaskbar]);
  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;

  // ==========================================
  // 🔢 تسلسل المستندات: INV-00001، RET-00001، QT-0001 — لا يتكرر الرقم ولا يُعاد استخدامه بعد الحذف
  // ==========================================
  const [docCounters, setDocCounters] = usePersistentState<Record<string, number>>('docCounters', {});
  const allocatedRef = useRef<Record<string, number>>({});
  const DOC_FORMAT: Record<'INV' | 'RET' | 'QT', { pad: number; re: RegExp }> = {
    INV: { pad: 5, re: /^INV-(\d{5})$/ }, // الأرقام القديمة العشوائية 6 خانات لا تدخل في التسلسل
    RET: { pad: 5, re: /^RET-(\d{5})$/ },
    QT: { pad: 4, re: /^QT-(\d+)$/ },
  };
  /**
   * ترقيم الفواتير والمرتجعات:
   *  - سنوي (الافتراضي): INV-27-00001 (السنة مختصرة) ويبدأ من 1 كل سنة (السنة جزء من الرقم فلا يتكرر)
   *  - مستمر: INV-00001 بلا بداية جديدة
   * سنة فيها فواتير بالصيغة المستمرة تكمل عليها (حتى لا تتغير الصيغة في منتصف السنة) — والسنوي يبدأ من السنة التالية.
   * عروض الأسعار تبقى بتسلسل مستمر (QT-0001).
   */
  const [docNumbering, setDocNumbering] = usePersistentState<'yearly' | 'continuous'>('docNumbering', 'yearly');
  type DocKind = 'INV' | 'RET' | 'QT';
  const docSlot = (kind: DocKind) => {
    const year = String(new Date().getFullYear());
    // نسخة Pro — أجهزة مربوطة: لكل جهاز رمز في الرقم (INV-B-27-00001) وتسلسل مستقل، فلا يتكرر رقم بين جهازين
    const tag = getNetInfo()?.tag || '';
    if (tag) {
      const p = `${kind}-${tag}`;
      if (kind === 'QT' || docNumbering !== 'yearly') {
        const pad = DOC_FORMAT[kind].pad;
        return { key: `${kind}@${tag}`, list: kind === 'QT' ? quotations.map(q => q.number) : invoices.map(i => i.invoiceNumber || i.number), re: new RegExp(`^${p}-(\\d{${pad},})$`), fmt: (n: number) => `${p}-${String(n).padStart(pad, '0')}` };
      }
      const yy = year.slice(2);
      return { key: `${kind}-${year}@${tag}`, list: invoices.map(i => i.invoiceNumber || i.number), re: new RegExp(`^${p}-${yy}-(\\d{5,})$`), fmt: (n: number) => `${p}-${yy}-${String(n).padStart(5, '0')}` };
    }
    const list = kind === 'QT' ? quotations.map(q => q.number) : invoices.map(i => i.invoiceNumber || i.number);
    const continuousThisYear = kind === 'QT' || docNumbering !== 'yearly'
      || invoices.some(i => String(i.date || '').startsWith(year) && DOC_FORMAT[kind].re.test(i.invoiceNumber || i.number || ''));
    if (continuousThisYear) {
      return { key: kind, list, re: DOC_FORMAT[kind].re, fmt: (n: number) => `${kind}-${String(n).padStart(DOC_FORMAT[kind].pad, '0')}` };
    }
    // السنة مختصرة (26، 27...) ثم رقم الفاتورة: INV-27-00001 — ويُقرأ أيضاً INV-2027-… (صيغة 1.19.27)
    const yy = year.slice(2);
    return { key: `${kind}-${year}`, list, re: new RegExp(`^${kind}-(?:${year}|${yy})-(\\d{5,})$`), fmt: (n: number) => `${kind}-${yy}-${String(n).padStart(5, '0')}` };
  };
  const lastDocNumber = (kind: DocKind) => {
    const sl = docSlot(kind);
    let max = Math.max(docCounters[sl.key] || 0, allocatedRef.current[sl.key] || 0);
    for (const n of sl.list) { const m = sl.re.exec(n || ''); if (m) { const v = Number(m[1]); if (v > max) max = v; } }
    return max;
  };
  /** الرقم التالي للعرض فقط (لا يحجزه) */
  const peekDocNumber = (kind: DocKind) => docSlot(kind).fmt(lastDocNumber(kind) + 1);
  /** يحجز الرقم التالي فوراً (حتى لو تكرر البيع قبل إعادة الرسم) */
  const allocateDocNumber = (kind: DocKind) => {
    const sl = docSlot(kind);
    const n = lastDocNumber(kind) + 1;
    allocatedRef.current[sl.key] = n;
    setDocCounters(prev => ({ ...prev, [sl.key]: Math.max(prev[sl.key] || 0, n) }));
    return sl.fmt(n);
  };
  /** إلغاء حجز رقم لم يُستخدم (فشل الختم الإلكتروني) — فقط إن كان آخر رقم محجوز */
  const releaseDocNumber = (kind: DocKind, num: string) => {
    const sl = docSlot(kind);
    const m = sl.re.exec(num); if (!m) return;
    const n = Number(m[1]);
    if (allocatedRef.current[sl.key] !== n) return;
    allocatedRef.current[sl.key] = n - 1;
    setDocCounters(prev => (prev[sl.key] === n ? { ...prev, [sl.key]: n - 1 } : prev));
  };

  // Durable store collections
  const [customers, setCustomers] = usePersistentState<Customer[]>('customers', initialCustomers);
  const [suppliers, setSuppliers] = usePersistentState<Supplier[]>('suppliers', []);
  const [purchases, setPurchases] = usePersistentState<PurchaseInvoice[]>('purchases', []);
  const [purchaseReturns, setPurchaseReturns] = usePersistentState<PurchaseReturn[]>('purchaseReturns', []);
  const [users, setUsers] = usePersistentState<AppUser[]>('users', [
    { id: 'u1', username: 'admin', fullName: 'المدير العام', role: 'admin', status: 'active' },
  ]);
  const [companySettings, setCompanySettings] = usePersistentState<CompanySettings>('companySettings', defaultCompanySettings);
  // العملة الأساسية: رمزها يظهر بدل رمز الريال في كل الشاشات إن لم تكن ريالاً سعودياً
  const cur = currencyState(companySettings);
  setBaseCurrencySymbol(cur.baseIsRiyal ? null : cur.base.symbol || cur.baseCode);
  // ==========================================
  // 🧾 الضريبة: النسبة + هل أسعار الأصناف شاملة الضريبة (من إعدادات المنشأة)
  //   داخلياً سعر السطر في السلة/الفاتورة دائماً "قبل الضريبة" (price)،
  //   فإن كانت أسعار الأصناف شاملة نستخرج الصافي: الصافي = السعر ÷ (1 + النسبة)
  // ==========================================
  const taxRate = (companySettings.taxRate ?? 15) / 100;
  const pricesIncludeTax = !!companySettings.pricesIncludeTax;
  /** سعر الصنف كما في الكتالوج → سعر الوحدة قبل الضريبة */
  const toNetPrice = (catalogPrice: number) => (pricesIncludeTax ? catalogPrice / (1 + taxRate) : catalogPrice);
  /** سعر الوحدة قبل الضريبة → السعر المعروض للكاشير (بنفس طريقة إدخال الأسعار) */
  const toShownPrice = (net: number) => (pricesIncludeTax ? round2(net * (1 + taxRate)) : net);
  const showListVat = listVatCol && taxRate > 0;
  /** توفير السطر (خصم الصنف أو العرض) بنفس طريقة عرض الأسعار — من الإجمالي لا من سعر الحبة المقرّب */
  const lineSaving = (it: { originalPrice?: number; price: number; qty: number }) => round2(((it.originalPrice ?? it.price) - it.price) * it.qty * (pricesIncludeTax ? 1 + taxRate : 1));
  const lineAmounts = (net: number, qty: number) => ({ tax: net * qty * taxRate, total: net * qty * (1 + taxRate) });

  // ==========================================
  // 👤 المستخدم الداخل (لا يُحفظ: البرنامج يفتح على شاشة الدخول دائماً)
  // ==========================================
  // الجلسة تبقى عند إعادة تحميل الشاشة داخل نفس النافذة (مثلاً: الجهاز الرئيسي أُعيد تشغيله فأُعيد تحميل الفرعي)،
  // وتُمسح عند إغلاق البرنامج — فيفتح دائماً على شاشة الدخول
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => { try { return sessionStorage.getItem('sl:session'); } catch { return null; } });
  useEffect(() => { try { if (currentUserId) sessionStorage.setItem('sl:session', currentUserId); else sessionStorage.removeItem('sl:session'); } catch { /* */ } }, [currentUserId]);
  const [lastUserId, setLastUserId] = usePersistentState<string>('lastUserId', '');
  const currentUser = users.find(u => u.id === currentUserId && u.status === 'active') || null;
  const isLoggedIn = !!currentUser;
  const cashierDisplayName = currentUser?.fullName || 'المدير العام';
  // ── نقدية بداية الوردية (العهدة): تُسأل مرة واحدة بعد كل إقفال ──────────────
  const [zClosings] = usePersistentState<ZReportRecord[]>('zReports', []);
  /** تحويل تاريخ (محلي أو ISO) إلى رقم للمقارنة — 0 للفارغ */
  const tsMs = (v?: string | null) => { const t = Date.parse(String(v || '').replace(' ', 'T')); return Number.isFinite(t) ? t : 0; };
  const [closeSignal, setCloseSignal] = useState('');
  /** وقت آخر إقفال يخصّ هذا الكاشير (إقفال يومي، أو إقفال ورديته) */
  const lastCloseAt = useMemo(() => {
    const mine = zClosings.filter((r) => r.kind !== 'shift' || r.cashier === cashierDisplayName);
    const times = [closeSignal, ...mine.map((r) => r.cutoff || r.closedAt || '')].filter(Boolean);
    return times.reduce((a, b) => (tsMs(b) > tsMs(a) ? b : a), '');
  }, [zClosings, closeSignal, cashierDisplayName]);
  /**
   * هل لم تُسجّل نقدية بداية لهذه الوردية بعد؟
   * المقارنة بالزمن لا بالنص: تواريخ الإقفال والحركات قد تختلف صياغتها
   * (محلية أو ISO) فالمقارنة النصية تعطي نتيجة خاطئة أحياناً.
   */
  const floatOwed = cashFloat.enabled && !cashMovements.some((m) => m.kind === 'float' && tsMs(m.date) > tsMs(lastCloseAt));
  const [floatAsk, setFloatAsk] = useState(false);
  const [floatAskValue, setFloatAskValue] = useState('');
  /** سُئل في هذه الوردية وأجّل — يُسأل ثانيةً عند بداية البيع */
  const floatAskedRef = useRef(false);
  const openFloatAsk = useCallback(() => { setFloatAskValue(''); setFloatAsk(true); }, []);
  // (1) عند فتح البرنامج، و(2) بعد كل إقفال
  useEffect(() => {
    if (!isLoggedIn || !floatOwed || floatAskedRef.current) return;
    floatAskedRef.current = true;
    const t = setTimeout(openFloatAsk, 600);
    return () => clearTimeout(t);
  }, [isLoggedIn, floatOwed, lastCloseAt, openFloatAsk]);
  // إقفال جديد ⇒ وردية جديدة ⇒ يُسأل من أول
  useEffect(() => { floatAskedRef.current = false; }, [lastCloseAt]);
  // (3) بداية البيع: إن أجّل الكاشير يُسأل ثانيةً عند أول صنف في السلة (المؤثّر بعد تعريف السلة)
  const floatSellRef = useRef(false);
  useEffect(() => { floatSellRef.current = false; }, [lastCloseAt]);
  /** تسجيل نقدية البداية كحركة صندوق من نوع عهدة */
  const recordFloat = (amount: number) => {
    const v = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);
    saveUrgently();
    setCashMovements((prev) => [{
      id: `float-${Date.now()}`, date: localTimestamp(), type: 'in', amount: v,
      reason: 'نقدية بداية الوردية', kind: 'float', by: cashierDisplayName,
    }, ...prev]);
    setFloatAsk(false);
    triggerPrintNotification(v > 0 ? `تم تسجيل نقدية بداية الوردية: ${v.toFixed(2)}` : 'تم تسجيل بداية الوردية بدون نقدية في الدرج', 5000);
  };
  // صلاحيات وافق عليها مشرف للعملية الحالية (تُمسح مع تفريغ السلة أو تغيير المستخدم)
  const [saleApprovals, setSaleApprovals] = useState<Set<Permission>>(() => new Set());
  const [pendingApproval, setPendingApproval] = useState<{ perm: Permission; run: () => void } | null>(null);
  const allowed = (p: Permission) => can(currentUser, p) || saleApprovals.has(p);
  /** ينفّذ العملية إن كانت مسموحة، وإلا يطلب موافقة مشرف ثم ينفّذها */
  const guard = (p: Permission, run: () => void) => {
    if (allowed(p)) run();
    else setPendingApproval({ perm: p, run });
  };
  const SALE_SCOPED: Permission[] = ['pos.discount', 'pos.editPrice', 'pos.voidItem', 'pos.credit', 'pos.belowCost'];
  // موافقة المشرف على البيع تحت التكلفة تُستهلك في محاولة الإتمام التالية مباشرة (الحالة لا تتحدّث قبل إعادة الرسم)
  const belowCostOkRef = useRef(false);
  const [currentView, setCurrentView] = useState<ExtendedViewType>(() => { try { const v = sessionStorage.getItem('sl:view'); if (v) return v as ExtendedViewType; } catch { /* */ } return companySettings.companyName ? 'pos' : 'settings'; });
  // المركز الرئيسي: قائمة الفروع للقوائم المالية (تُحدَّث عند فتح شاشة المحاسبة)
  useEffect(() => {
    if (currentView !== 'accounting') return undefined;
    const bapi = window.ledger?.branches;
    if (!bapi) return undefined;
    let alive = true;
    bapi.info().then((i) => {
      if (!alive) return;
      setHqBranches(i.mode === 'hq' ? { label: i.hq?.name ? `${i.hq.name} (المركز)` : 'المركز الرئيسي', list: (i.branches || []).map((b) => ({ id: b.id, code: b.code, name: b.name })) } : null);
    }).catch(() => { /* */ });
    return () => { alive = false; };
  }, [currentView]);
  useEffect(() => { try { sessionStorage.setItem('sl:view', currentView); } catch { /* */ } }, [currentView]); 
  const [isDarkMode, setIsDarkMode] = usePersistentState<boolean>('isDarkMode', false);
  // ==========================================
  // 🖼️ أيقونة البرنامج (من إعدادات التطبيق): داخل الواجهة + نافذة ويندوز وشريط المهام
  // ==========================================
  const [appIconSetting, setAppIconSetting] = usePersistentState<AppIconSetting>('appIcon', defaultAppIconSetting);
  const brandIcon =
    appIconSetting.mode === 'custom' && appIconSetting.custom ? appIconSetting.custom
    : appIconSetting.mode === 'logo' && companySettings.logoUrl ? companySettings.logoUrl
    : appIcon;
  useEffect(() => {
    const api = window.ledger?.app;
    if (!api?.setIcon) return;
    let cancelled = false;
    if (brandIcon === appIcon) { void api.setIcon(null); return; }
    void toSquarePng(brandIcon, 256).then(png => { if (!cancelled) void api.setIcon!(png); });
    return () => { cancelled = true; };
  }, [brandIcon]);
  const handleAppIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { triggerPrintNotification('اختر ملف صورة (PNG أو JPG أو SVG)'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const png = await toSquarePng(String(reader.result), 256);
      if (!png) { triggerPrintNotification('تعذّر قراءة الصورة'); return; }
      setAppIconSetting({ mode: 'custom', custom: png });
      triggerPrintNotification('تم تغيير أيقونة البرنامج');
    };
    reader.readAsDataURL(file);
  };

  // نطبّق الوضع على كامل الصفحة (يشمل النوافذ المنبثقة وخلفية الصفحة)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);
  const [isLayoutReversed, setIsLayoutReversed] = usePersistentState<boolean>('isLayoutReversed', true); 
  const [businessType, setBusinessType] = usePersistentState<BusinessType>('businessType', 'retail');
  const [selectedRetailPrinterId, setSelectedRetailPrinterId] = usePersistentState<string>('selectedRetailPrinterId', ''); // Default printer routing for retail
  const [retailPrintTemplate, setRetailPrintTemplate] = usePersistentState<'thermal80' | 'A4' | 'pdf'>('retailPrintTemplate', 'thermal80');


  const [productTab, setProductTab] = useState<'items' | 'categories'>('items');
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AppCategory | null>(null);
  
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<AppPrinter | null>(null);

  const [isPosMenuOpen, setIsPosMenuOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  // بداية البيع: إن أجّل الكاشير تسجيل نقدية البداية، يُسأل عند أول صنف يدخل السلة
  useEffect(() => {
    if (!isLoggedIn || !floatOwed || floatAsk || floatSellRef.current || !cart.length) return;
    floatSellRef.current = true;
    openFloatAsk();
  }, [cart.length, isLoggedIn, floatOwed, floatAsk, openFloatAsk]);
  useEffect(() => {
    if (cart.length === 0 && saleApprovals.size) setSaleApprovals(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length]);
  useEffect(() => {
    // شاشة لا يملك المستخدم صلاحيتها (تنقّل قديم أو سُحبت صلاحيته) → أول شاشة متاحة
    if (currentUser && !canView(currentUser, currentView)) setCurrentView(firstAllowedView(currentUser) as ExtendedViewType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role, currentUser?.permissions, currentView]);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountScope, setDiscountScope] = useState<'total' | 'subtotal'>('total');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  
  // Parked Orders (الطلبات المعلقة) State
  const [parkedOrders, setParkedOrders] = usePersistentState<ParkedOrder[]>('parkedOrders', []);
  const [isParkModalOpen, setIsParkModalOpen] = useState(false);
  const [isParkedOrdersModalOpen, setIsParkedOrdersModalOpen] = useState(false);
  const [parkOrderLabel, setParkOrderLabel] = useState('');
  const [parkOrderCustomer, setParkOrderCustomer] = useState('');
  const [parkOrderNote, setParkOrderNote] = useState('');
  const [parkOrderDueTime, setParkOrderDueTime] = useState('');
  const [parkOrderDueDate, setParkOrderDueDate] = useState('');
  const [orderToRestore, setOrderToRestore] = useState<ParkedOrder | null>(null);
  const [previewParkedOrder, setPreviewParkedOrder] = useState<ParkedOrder | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>('الكل');
  const [posStockFilter, setPosStockFilter] = useState<'all' | 'low' | 'out'>('all');
  useEffect(() => { if (!showStockAlerts) setPosStockFilter('all'); }, [showStockAlerts]);
  const [posProductSearch, setPosProductSearch] = useState<string>('');
  // البحث بالقائمة المنسدلة في شاشة البيع (من إعدادات التطبيق — مقفل افتراضياً)
  const [posSearchDropdown, setPosSearchDropdown] = usePersistentState<boolean>('posSearchDropdown', false);
  // الكمية المتوفرة بجانب كل صنف في قائمة البحث المنسدلة (مفعّل افتراضياً)
  const [searchShowStock, setSearchShowStock] = usePersistentState<boolean>('posSearchShowStock', true);
  // نظرة سرّية على تكلفة الصنف بضغط مطوّل في السلة (مفعّل افتراضياً — للمدير ومن يمنحه الصلاحية)
  const [costPeekEnabled, setCostPeekEnabled] = usePersistentState<boolean>('posCostPeek', true);
  // بقالة / سوبرماركت: شاشة بيع بالقائمة — السلة جدول بسطور كثيرة، بلا بطاقات أصناف (الاعتماد على الباركود والبحث)
  const [groceryShowCards, setGroceryShowCards] = useState(false);
  const autoActivity = isAutoActivity(companySettings.activityType) && businessType !== 'restaurant';
  // أنشطة شاشة البيع بالقائمة: بقالة، أثاث، كهرباء وسباكة، بنشر
  const groceryActivity = (companySettings.activityType === 'grocery' || companySettings.activityType === 'furniture' || companySettings.activityType === 'electrical' || autoActivity) && businessType !== 'restaurant';
  // البنشر/الأثاث: خيار تثبيت البيع ببطاقات الأصناف (مغلق افتراضياً)
  const [lockCardsSetting, setLockCardsSetting] = usePersistentState<boolean>('posLockCards', false);
  const cardsLockable = companySettings.activityType === 'auto' || companySettings.activityType === 'furniture' || companySettings.activityType === 'electrical';
  const lockCards = cardsLockable && lockCardsSetting && businessType !== 'restaurant';
  const groceryList = groceryActivity && !groceryShowCards && !lockCards;
  // لوحة المفاتيح في شاشة القائمة: أسفل منطقة الأصناف (بعيداً عن البحث ولوحة الإجمالي)
  const groceryKbdLeft = (uiDir === 'rtl') !== isLayoutReversed;
  const searchDropdown = posSearchDropdown || groceryList;
  const [posSearchHi, setPosSearchHi] = useState(0);
  const [posSearchOpen, setPosSearchOpen] = useState(false);
  const [selectedProductForOptions, setSelectedProductForOptions] = useState<ExtendedProduct | null>(null);
  const [printNotification, setPrintNotification] = useState<string | null>(null);
  const [printInvoiceData, setPrintInvoiceData] = useState<Invoice | null>(null); // For real Windows print job
  const [printZReportData, setPrintZReportData] = useState<any | null>(null); // For Z-Report print job
  // تقرير الإقفال يُطبع مباشرة على طابعة الكاشير (الإيصالات) حتى لو كانت الطباعة الصامتة متوقفة
  const zPrintedRef = useRef<string | null>(null);
  const printZReportNow = async () => {
    const device = resolveReceiptPrinter() || printSettings.receiptPrinter;
    const r = await printCurrentPage(printSettings, { template: 'thermal80', deviceName: device || undefined, forceSilent: !!device });
    if (!r.ok && r.reason && r.reason !== PRINT_CANCELLED) triggerPrintNotification(`⚠️ تعذرت طباعة تقرير الإقفال: ${r.reason}`, 9000);
    return r;
  };
  useEffect(() => {
    if (!printZReportData || zPrintedRef.current === printZReportData.id) return;
    zPrintedRef.current = printZReportData.id;
    // بعد رسم التقرير ليُقاس طوله ويُلتقط
    requestAnimationFrame(() => requestAnimationFrame(() => { void printZReportNow(); }));
  }, [printZReportData]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<Invoice | null>(null); // For invoice viewing modal
  const [printInvoiceCurrency, setPrintInvoiceCurrency] = useState<string>('SAR');
  const [activePrintTemplate, setActivePrintTemplate] = useState<'thermal80' | 'A4'>('thermal80');
  // مقاس الفاتورة الكبيرة في نافذة المعاينة (A4 / A5) — يبدأ من الإعداد ويمكن تغييره لهذه الطباعة
  const [previewPaper, setPreviewPaper] = useState<'A4' | 'A5'>('A4');
  setLargePaperOverride(printInvoiceData ? previewPaper : null);
  // الطباعة بلغتين (زر «ترجمة» بجانب قوالب A4): الإيصال الحراري والفاتورة وعرض السعر A4/A5
  //  - مغلق افتراضياً في البرنامج العربي، ويعمل افتراضياً عند تحويل البرنامج للإنجليزية
  //  - إعداد «الإيصال بلغتين» القديم (المدموج في الزر) يبقى مفعّلاً لمن شغّله إلى أن يُغيَّر الزر
  const [legacyReceiptBilingual] = usePersistentState<boolean>('receiptBilingual', false);
  setPrintBilingual(bilingualPrintOn(printSettings, uiLanguage, legacyReceiptBilingual));
  // تبديل لغة البرنامج يبدّل الزر معه: الإنجليزية تشغّله، والعربية تطفئه (ويبقى للمستخدم تغييره يدوياً)
  const langForPrintRef = useRef(uiLanguage);
  useEffect(() => {
    if (langForPrintRef.current === uiLanguage) return;
    langForPrintRef.current = uiLanguage;
    setPrintSettings((p) => ({ ...p, bilingualPrint: uiLanguage === 'en' }));
  }, [uiLanguage]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Quick Pay (الدفع السريع بنقرة واحدة وحساب الباقي)
  const [lastCashChange, setLastCashChange] = useState<{
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    changeAmount: number;
    customerName: string;
    isQuickPay: boolean;
    timestamp: string;
    /** الدفع المقسّم: الجزء المدفوع بالشبكة (المربع يعرض باقي الجزء النقدي) */
    splitCard?: number;
  } | null>(null);
  const [isCustomQuickPayOpen, setIsCustomQuickPayOpen] = useState<boolean>(false);
  // شريط تبويبات السلة (ملاحظة / تقسيم الدفع — الخصم بلوحته الخاصة)
  const [cartTab, setCartTab] = useState<'note' | 'split' | 'vehicle' | 'delivery' | null>(null);
  // قائمة زر التعليق في الشريط العلوي (موضعها تحت الزر)
  const [parkMenu, setParkMenu] = useState<{ top: number; left: number; width: number } | null>(null);
  // الدفع المقسّم: الحقل الذي كتبه الكاشير (والآخر = الإجمالي − هذا) + النقدي المستلم (اختياري لحساب الباقي)
  const [splitLead, setSplitLead] = useState<'cash' | 'card'>('cash');
  const [splitLeadVal, setSplitLeadVal] = useState('');
  const [splitReceivedInput, setSplitReceivedInput] = useState('');
  const resetSplit = () => { setSplitLeadVal(''); setSplitReceivedInput(''); setCartTab(null); };
  // السلة فرغت (بيع/تعليق/حذف آخر صنف): لا تبقى لوحة تقسيم الدفع مفتوحة بمبالغ قديمة
  useEffect(() => { if (cart.length === 0 && (cartTab === 'split' || splitLeadVal)) resetSplit(); }, [cart.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [customQuickPayInput, setCustomQuickPayInput] = useState<string>('');
  
  // Cart UX & organization state
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const [isDiscountDrawerOpen, setIsDiscountDrawerOpen] = useState<boolean>(false);
  const [isSummaryDetailsOpen, setIsSummaryDetailsOpen] = useState<boolean>(false);
  const cartListRef = useRef<HTMLDivElement>(null);
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 🎯 مؤشر الكتابة دائماً على حقل الباركود في شاشة الكاشير
  //   - بعد أي نقرة على شيء ليس حقل إدخال (بطاقة صنف، زر، فراغ)
  //   - بعد إغلاق أي نافذة، وعند الرجوع لنافذة البرنامج
  //   - إن بدأ القارئ أو لوحة المفاتيح بالكتابة والمؤشر في مكان آخر → تذهب الأحرف لحقل الباركود
  //   لا يسرق التركيز من حقل يكتب فيه المستخدم (بحث، سعر، كمية...) ولا أثناء فتح نافذة
  // ==========================================
  const posModalOpen = !!(
    selectedProductForOptions || isDiscountModalOpen || isDiscountDrawerOpen || isPartialModalOpen || isQuickProductOpen ||
    isCustomerPickerOpen || isParkModalOpen || isParkedOrdersModalOpen || orderToRestore || previewParkedOrder ||
    pendingApproval || isCustomQuickPayOpen || printInvoiceData || printZReportData || isPosMenuOpen
  );
  const barcodeFocusActive = isLoggedIn && currentView === 'pos' && !posModalOpen;
  const barcodeFocusActiveRef = useRef(barcodeFocusActive);
  barcodeFocusActiveRef.current = barcodeFocusActive;

  const isEditable = (el: Element | null) =>
    !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

  const focusBarcode = () => {
    const input = barcodeInputRef.current;
    if (!input || !barcodeFocusActiveRef.current) return;
    if (document.activeElement !== input && !isEditable(document.activeElement)) input.focus({ preventScroll: true });
  };

  // عند فتح الشاشة، وبعد إغلاق أي نافذة، وبعد كل تغيير في السلة
  useEffect(() => {
    if (!barcodeFocusActive) return;
    const t = setTimeout(focusBarcode, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeFocusActive, cart, lastCashChange]);

  useEffect(() => {
    if (!barcodeFocusActive) return;
    const onPointerUp = () => setTimeout(focusBarcode, 0);
    const onWindowFocus = () => setTimeout(focusBarcode, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      const input = barcodeInputRef.current;
      if (!input || !barcodeFocusActiveRef.current || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.activeElement === input || isEditable(document.activeElement)) return;
      // حرف أو رقم واحد (القارئ يكتب مثل لوحة المفاتيح) → ننقل التركيز قبل أن يُكتب الحرف
      if (e.key.length === 1 && e.key !== ' ') input.focus({ preventScroll: true });
    };
    document.addEventListener('pointerup', onPointerUp);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('keydown', onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeFocusActive]);

  const loginAs = (u: AppUser) => {
    const stamp = localTimestamp();
    setUsers(prev => prev.some(x => x.id === u.id) ? prev.map(x => x.id === u.id ? { ...u, lastLoginAt: stamp } : x) : [...prev, { ...u, lastLoginAt: stamp }]);
    setCurrentUserId(u.id);
    setLastUserId(u.id);
    setSaleApprovals(new Set());
    if (!canView(u, currentView)) setCurrentView(firstAllowedView(u) as ExtendedViewType);
  };
  const handleLogout = () => { setCurrentUserId(null); setSaleApprovals(new Set()); setPendingApproval(null); };
  const handleFocusSelect = (e: React.FocusEvent<HTMLInputElement>) => { e.target.select(); };
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPrintNotification = (msg: string, ms = 3000) => {
    setPrintNotification(msg);
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    // الرسائل الطويلة (أسباب فشل الطباعة مثلاً) تبقى وقتاً يكفي لقراءتها
    const readMs = Math.min(12000, String(msg || '').length * 70);
    notifyTimerRef.current = setTimeout(() => setPrintNotification(null), Math.max(ms, readMs));
  };

  // ==========================================
  // 🧾 منصة فاتورة (المرحلة الثانية): الختم قبل الحفظ + متابعة الإبلاغ/الاعتماد
  // ==========================================
  const zatcaApi = typeof window !== 'undefined' ? window.ledger?.zatca : undefined;
  // منشأة غير مسجّلة في ضريبة القيمة المضافة: لا فواتير ضريبية ولا ربط مع الهيئة
  const vatUnregistered = companySettings.vatUnregistered === true;
  const viewAllowed = (v: string) => (v === 'einvoice' && vatUnregistered ? false : canView(currentUser, v));
  const [zatcaActiveRaw, setZatcaActive] = useState(false);
  /** الفاتورة الإلكترونية بترخيص منفصل: المفاتيح القديمة تحتفظ بها، والربط الجديد يحتاج ترخيصاً صريحاً */
  const zatcaAllowed = hasFeature(license.status, 'zatca');
  const zatcaLicensed = hasLicensedFeature(license.status, 'zatca');
  /** اشتراك الفاتورة الإلكترونية انتهى ومضت مهلته (تمييزه عن «لم يشترِ الميزة أصلاً») */
  const zatcaExpiredOn = !zatcaAllowed ? (license.status?.featureStates?.zatca?.expires || '') : '';
  const zatcaActive = zatcaActiveRaw && !vatUnregistered && zatcaAllowed;
  const refreshZatcaActive = () => { zatcaApi?.status().then(st => setZatcaActive(!!st.active)).catch(() => setZatcaActive(false)); };
  useEffect(() => {
    if (!zatcaApi) return;
    refreshZatcaActive();
    const off = zatcaApi.onStatus(d => {
      setInvoices(prev => {
        let changed = false;
        const next = prev.map(i => {
          if (i.id !== d.invoiceId || !i.zatca) return i;
          changed = true;
          return { ...i, zatca: { ...i.zatca, status: d.status as InvoiceZatca['status'], message: d.message, qr: d.qr || i.zatca.qr } };
        });
        return changed ? next : prev;
      });
      // الفاتورة الضريبية المعتمدة: إعادة أرشفة PDF برمز QR الصادر من الهيئة
      if (d.qr) setTimeout(() => {
        const i = invoicesRef.current.find(x => x.id === d.invoiceId);
        if (i?.zatca) void archiveRef.current({ ...i, zatca: { ...i.zatca, status: d.status as InvoiceZatca['status'], qr: d.qr! } }, true);
      }, 0);
      if (d.status === 'rejected') triggerPrintNotification(`رفضت الهيئة فاتورة — راجع قائمة الفواتير${d.message ? ': ' + d.message : ''}`, 8000);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ♻️ بعد انقطاع مفاجئ: استرجاع فواتير خُتمت (وقد تكون أُرسلت للهيئة) لكنها لم تُحفظ في البرنامج
  const orphanCheckedRef = useRef(false);
  useEffect(() => {
    if (!zatcaApi?.orphans || orphanCheckedRef.current) return;
    orphanCheckedRef.current = true;
    zatcaApi.orphans(invoicesRef.current.map(i => i.id)).then(list => {
      if (!list.length) return;
      const recovered: Invoice[] = list
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(o => {
          const inv = o.invoice as Invoice;
          const sign = inv.docType === 'return' ? -1 : 1;
          return {
            ...inv,
            subtotal: o.totals.taxable != null ? sign * o.totals.taxable : inv.subtotal,
            tax: o.totals.tax != null ? sign * o.totals.tax : inv.tax,
            zatca: { uuid: o.zatca.uuid, icv: o.zatca.icv, hash: o.zatca.hash, qr: o.zatca.qr, kind: o.zatca.kind as InvoiceZatca['kind'], status: o.zatca.status as InvoiceZatca['status'], message: o.zatca.message },
          };
        });
      saveUrgently();
      setInvoices(prev => {
        const have = new Set(prev.map(i => i.id));
        let next = [...recovered.filter(r => !have.has(r.id)), ...prev];
        // المرتجع الذي سدّد جزءاً من مديونية الفاتورة الأصلية
        for (const r of recovered) {
          if (r.docType === 'return' && r.debtOffset && r.originalInvoiceId) {
            next = next.map(i => i.id === r.originalInvoiceId ? { ...i, remainingAmount: round2(Math.max(0, (i.remainingAmount || 0) - r.debtOffset!)), paymentStatus: (i.remainingAmount || 0) - r.debtOffset! <= 0.004 ? 'paid' as const : 'partial' as const } : i);
          }
        }
        return next;
      });
      // أثر الفواتير المسترجعة على المخزون ورصيد العميل (كما لو حُفظت عادياً)
      for (const r of recovered) {
        if (r.docType !== 'return' || r.restocked) {
          deductStockForSale((r.items || []).map(it => ({ productId: it.productId, qty: it.qty, factor: it.factor })));
        }
        const delta = r.docType === 'return' ? (r.debtOffset || 0) : -(r.remainingAmount || 0);
        if (r.customerId && Math.abs(delta) > 0.004) setCustomers(prev => prev.map(c => (c.id === r.customerId ? { ...c, balance: round2((c.balance || 0) + delta) } : c)));
      }
      triggerPrintNotification(`♻️ تم استرجاع ${recovered.length} فاتورة كانت مختومة قبل انقطاع مفاجئ: ${recovered.map(r => r.invoiceNumber).join('، ')}`, 10000);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * يختم المستند ويضيفه لطابور الإرسال. يعيد المستند بعد إضافة بيانات الهيئة، أو null إن تعذّر (مع رسالة).
   * إن لم يكن الربط مفعّلاً يعيد المستند كما هو.
   */
  const zatcaSign = async (inv: Invoice, customer: Customer | null | undefined, forceKind?: 'simplified' | 'standard'): Promise<Invoice | null> => {
    if (!zatcaApi || !zatcaActive) return inv;
    const built = buildZatcaDoc(inv, { customer, taxRatePercent: companySettings.taxRate ?? 15, forceKind });
    if ('error' in built) { triggerPrintNotification(built.error, 8000); return null; }
    try {
      // نسخة من الفاتورة تُحفظ مع الختم في نفس المعاملة — لاسترجاعها إن انقطعت الكهرباء قبل حفظ الفاتورة
      const res = await zatcaApi.sign({ invoiceId: inv.id, doc: built.doc, snapshot: inv });
      if (!res.ok || !res.uuid) {
        triggerPrintNotification(`تعذّر ختم الفاتورة إلكترونياً: ${res.error || ''}${res.details?.length ? ' — ' + res.details.join('، ') : ''}`, 9000);
        return null;
      }
      const sign = inv.docType === 'return' ? -1 : 1;
      return {
        ...inv,
        // نعتمد أرقام الفاتورة المرسلة للهيئة (مقرّبة لهللتين) حتى يتطابق المطبوع مع المُبلّغ
        subtotal: res.totals ? sign * res.totals.taxable : inv.subtotal,
        tax: res.totals ? sign * res.totals.tax : inv.tax,
        zatca: { uuid: res.uuid, icv: res.icv || 0, hash: res.invoiceHash || '', qr: res.qr || '', kind: built.doc.kind, status: (res.status as InvoiceZatca['status']) || 'pending', message: null },
      };
    } catch (e) {
      triggerPrintNotification(`تعذّر ختم الفاتورة إلكترونياً: ${String((e as Error)?.message || e)}`, 9000);
      return null;
    }
  };
  const zatcaBusyRef = useRef(false);

  /** باركود مستند مُسح في شاشة البيع → يُفتح في شاشته (الفواتير / عروض الأسعار) */
  const [invoiceScan, setInvoiceScan] = useState<ScanRequest | null>(null);
  // نافذة الفاتورة داخل شاشة البيع (بحث أو مسح باركود الإيصال) — مع المرتجع والسداد دون مغادرة الشاشة
  const [posDoc, setPosDoc] = useState<Invoice | null>(null);
  const [posReturnInv, setPosReturnInv] = useState<Invoice | null>(null);
  const [posPayInv, setPosPayInv] = useState<Invoice | null>(null);
  const openPosDoc = (inv: Invoice) => {
    if (!canView(currentUser, 'invoices')) { triggerPrintNotification('🔒 لا تملك صلاحية فتح الفواتير والمرتجعات', 4000); return; }
    setPosDoc(inv);
  };
  const [quoteScan, setQuoteScan] = useState<ScanRequest | null>(null);
  const openScannedDoc = (code: string): boolean => {
    const inv = findInvoiceByCode(invoices, code);
    if (inv) { openPosDoc(inv); return true; }
    const q = findQuotationByCode(quotations, code);
    if (q) {
      if (!canView(currentUser, 'quotations')) { triggerPrintNotification('🔒 لا تملك صلاحية فتح عروض الأسعار', 4000); return true; }
      setQuoteScan({ code, ts: Date.now() });
      setCurrentView('quotations');
      return true;
    }
    return false;
  };

  /** معالجة قراءة باركود في شاشة البيع: صنف ← ملصق ميزان ← فاتورة/مرتجع/عرض سعر — مع تصحيح لوحة المفاتيح العربية */
  /** لوحة المفاتيح على الشاشة تكتب في آخر حقل كان عليه المؤشر (وإلا خانة الباركود) */
  const oskTarget = (): HTMLInputElement | HTMLTextAreaElement | null => {
    const t = lastInputRef.current;
    return t && document.contains(t) && !(t as HTMLInputElement).disabled ? t : barcodeInputRef.current;
  };
  const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const oskEdit = (fn: (v: string, a: number, b: number) => { v: string; caret: number }) => {
    const el = oskTarget();
    if (!el) return;
    el.focus();
    let a = el.value.length, b = el.value.length;
    try { if (el.selectionStart != null) { a = el.selectionStart; b = el.selectionEnd ?? a; } } catch { /* حقل رقمي بلا مؤشر */ }
    const out = fn(el.value, a, b);
    setNativeValue(el, out.v);
    try { el.setSelectionRange(out.caret, out.caret); } catch { /* */ }
  };
  const oskKey = (ch: string) => oskEdit((v, a, b) => ({ v: v.slice(0, a) + ch + v.slice(b), caret: a + ch.length }));
  const oskBack = () => oskEdit((v, a, b) => (a !== b ? { v: v.slice(0, a) + v.slice(b), caret: a } : a > 0 ? { v: v.slice(0, a - 1) + v.slice(a), caret: a - 1 } : { v, caret: 0 }));
  const oskClear = () => oskEdit(() => ({ v: '', caret: 0 }));
  const oskEnter = () => { const el = oskTarget(); if (!el) return; el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); };

  const processScanCode = (raw: string) => {
    const cands = scanCandidates(raw);
    for (const code of cands) {
      const hit = barcodeIndex.get(code);
      if (!hit) continue;
      const foundProduct = hit.product;
      const foundOption = hit.unit ? { id: hit.unit.id, name: hit.unit.name, price: hit.unit.price, unitType: hit.unit.unitType, factor: hit.unit.factor } : undefined;
      if (foundProduct?.disabled) triggerPrintNotification(`⛔ الصنف «${foundProduct.nameAr}» موقوف عن البيع — فعّله من شاشة الأصناف`, 5000);
      else if (foundProduct) addToCart(foundProduct, foundOption);
      return;
    }
    // ملصق الميزان (يبدأ بـ 2): كود الصنف + الوزن أو السعر
    for (const code of cands) {
      const sc = parseScaleBarcode(code, scaleSettings, products, (p) => (pricesIncludeTax ? p.price : p.price * (1 + taxRate)));
      if (!sc) continue;
      if ('error' in sc) triggerPrintNotification(`⚖️ ${sc.error}`, 5000);
      else if (sc.product.disabled) triggerPrintNotification(`⛔ الصنف «${sc.product.nameAr}» موقوف عن البيع`, 5000);
      else addToCart(sc.product, undefined, sc.qty);
      return;
    }
    if (openScannedDoc(raw)) return; // باركود فاتورة/مرتجع/عرض سعر مطبوع
    beepError();
    triggerPrintNotification(`الصنف غير موجود! (${raw})`, 3500);
  };

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // نفس Enter لا يصل لنافذة تُفتح بعد المسح (كان يضغط زرها)
      const code = e.currentTarget.value.trim();
      if (!code) return;
      processScanCode(code);
      e.currentTarget.value = '';
      return;
    }
    latinBarcodeKeyDown(e); // لغة ويندوز عربية: نكتب حروف الباركود اللاتينية الصحيحة
  };
  // قارئ الباركود في شاشة البيع حتى لو لم يكن المؤشر في خانة الباركود (مثل شاشة المطعم)
  useBarcodeScanner((code) => {
    if (document.querySelector('.fixed.inset-0, [role=dialog]')) return; // نافذة مفتوحة
    processScanCode(code);
  }, currentView === 'pos');

  /**
   * قفل البيع بالسالب: هل يكفي المخزون لإضافة extraUnits حبة من الصنف (فوق ما في السلة)؟
   * يعيد رسالة المنع أو null. ignoreLine: سطر السلة الذي تُعاد كتابة كميته (تعديل مباشر)
   */
  const stockShortage = (productId: string, extraUnits: number, ignoreLine?: string): string | null => {
    if (!blockNegativeStock || extraUnits <= 0) return null;
    const p = products.find(x => x.id === productId);
    if (!p || p.isService) return null; // الصنف الخدمي بلا مخزون
    const inCart = cart.reduce((sum, it) => sum + (it.id === productId && it.cartItemId !== ignoreLine ? it.qty * (it.factor && it.factor > 0 ? it.factor : 1) : 0), 0);
    const available = p.stock ?? 0;
    if (inCart + extraUnits > available + 1e-9) {
      return `🚫 البيع بالسالب مقفل: المخزون المتوفر من (${p.nameAr}) ${Math.max(0, available)} فقط${inCart ? ` وفي السلة ${inCart}` : ''}`;
    }
    return null;
  };

  const addToCart = (product: ExtendedProduct, option?: { id: string; name: string; price: number; unitType?: string; factor?: number }, weightQty?: number) => {
    if (product.disabled) { triggerPrintNotification(`⛔ الصنف «${product.nameAr}» موقوف عن البيع`, 4000); return; }
    if (lastCashChange) setLastCashChange(null);
    if (displayPaid) setDisplayPaid(null);
    if (((product.variants && product.variants.length > 0) || (product.units && product.units.length > 0)) && !option && weightQty === undefined) {
      setSelectedProductForOptions(product); return;
    }
    // صنف بالوزن من الميزان المتصل: الكمية = الوزن الحالي
    if (weightQty === undefined && product.soldByWeight && scaleSettings.serialEnabled) {
      if (!liveWeight || liveWeight <= 0) { triggerPrintNotification(`⚖️ ضع «${product.nameAr}» على الميزان أولاً`, 3500); return; }
      weightQty = liveWeight;
    }
    const addQty = weightQty !== undefined ? Math.round(weightQty * 1000) / 1000 : 1;
    // صلاحية الصنف
    const exSt = expiryState(product.expiryDate, expirySettings.warnDays);
    if (exSt === 'expired') {
      if (expirySettings.blockSale) { triggerPrintNotification(`⛔ «${product.nameAr}» منتهي الصلاحية (${product.expiryDate}) — البيع ممنوع`, 5000); return; }
      triggerPrintNotification(`⚠️ تنبيه: «${product.nameAr}» منتهي الصلاحية منذ ${product.expiryDate}`, 5000);
    }
    
    // قفل البيع بالسالب: لا يُضاف الصنف إن لم يكفِ المخزون
    const shortage = stockShortage(product.id, (option?.factor && option.factor > 0 ? option.factor : 1) * addQty);
    if (shortage) { triggerPrintNotification(shortage, 4000); return; }

    // تنبيه الكاشير في حال كان المخزون منخفضاً أو نافداً (إن كانت التنبيهات مفعّلة)
    const minStock = product.minStock !== undefined ? product.minStock : 10;
    if (product.isService) { /* لا تنبيهات مخزون للخدمات */ }
    else if (showStockAlerts && (product.stock ?? 0) <= 0) {
      triggerPrintNotification(`⚠️ تنبيه: الصنف (${product.nameAr}) نفذ من المخزون! تم إضافته للفاتورة`);
    } else if (showStockAlerts && (product.stock ?? 0) <= minStock) {
      triggerPrintNotification(`⚠️ تنبيه: مخزون (${product.nameAr}) منخفض (متبقي ${product.stock} فقط)`);
    }

    let finalPrice = toNetPrice(option ? option.price : product.price);
    let finalName = option ? `${product.nameAr} - ${option.name}` : (weightQty !== undefined ? `${product.nameAr} (كجم)` : product.nameAr);
    // كل وزنة سطر مستقل في الفاتورة
    let cartItemId = weightQty !== undefined ? `${product.id}-w${Date.now()}` : option ? `${product.id}-${option.id}` : product.id;
    const bundleDesc = product.isBundle && product.bundleItems 
      ? product.bundleItems.map(bi => `${bi.qty}× ${bi.productName}`).join(' + ')
      : undefined;

    setCart(prev => {
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) return prev.map(item => item.cartItemId === cartItemId ? { ...item, qty: item.qty + 1, ...lineAmounts(item.price, item.qty + 1) } : item);
      return [...prev, { 
        id: product.id, 
        cartItemId, 
        name: finalName, 
        image: product.image,
        description: product.description,
        unitType: option?.unitType,
        factor: option?.factor,
        price: finalPrice, 
        qty: addQty, 
        ...lineAmounts(finalPrice, addQty),
        unitName: option?.name,
        isBundle: product.isBundle,
        bundleDescription: bundleDesc,
        bundleItems: product.bundleItems
      }];
    });
    setSelectedProductForOptions(null);

    // تمييز فوري للصنف المضاف والتمرير إليه ليتأكد الكاشير من إدراجه
    setLastAddedItemId(cartItemId);
    setTimeout(() => {
      setLastAddedItemId(prev => prev === cartItemId ? null : prev);
    }, 1800);
    setTimeout(() => {
      if (cartListRef.current) {
        const itemEl = document.getElementById(`cart-item-${cartItemId}`);
        if (itemEl) {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 60);
  };

  const handleAddGroup = (newGroup: ProductGroup) => {
    setProductGroups(prev => [...prev, newGroup]);
    triggerPrintNotification(`تمت إضافة مجموعة "${newGroup.nameAr}" بنجاح`);
  };

  const handleUpdateGroup = (id: string, updated: Partial<ProductGroup>) => {
    const oldGroup = productGroups.find(g => g.id === id);
    setProductGroups(prev => prev.map(g => g.id === id ? { ...g, ...updated } : g));
    
    // في حال تم تعديل اسم المجموعة ينعكس تلقائياً على كافة الأصناف المرتبطة
    if (updated.nameAr && oldGroup && updated.nameAr !== oldGroup.nameAr) {
      setProducts(prev => prev.map(p => {
        if (p.groupId === id || p.categoryAr === oldGroup.nameAr) {
          return { ...p, categoryAr: updated.nameAr!, categoryEn: updated.nameEn || p.categoryEn };
        }
        return p;
      }));
    }
    triggerPrintNotification('تم تحديث بيانات المجموعة بنجاح');
  };

  const handleDeleteGroup = (id: string, reassignGroupId?: string) => {
    const deleting = productGroups.find(g => g.id === id);
    if (!deleting) return;

    const targetGroup = reassignGroupId ? productGroups.find(g => g.id === reassignGroupId) : undefined;
    
    setProducts(prev => prev.map(p => {
      if (p.groupId === id || p.categoryAr === deleting.nameAr) {
        if (targetGroup) {
          return { ...p, groupId: targetGroup.id, categoryAr: targetGroup.nameAr, categoryEn: targetGroup.nameEn || p.categoryEn };
        } else {
          return { ...p, groupId: undefined, categoryAr: 'عام' };
        }
      }
      return p;
    }));

    setProductGroups(prev => prev.filter(g => g.id !== id));
    triggerPrintNotification(`تم حذف مجموعة "${deleting.nameAr}" بنجاح`);
  };

  const removeFromCart = (cartItemId: string) => { if (isFeeLineId(cartItemId)) return; guard('pos.voidItem', () => setCart(prev => prev.filter(item => item.cartItemId !== cartItemId))); };
  const cartItemIdIsWeight = (cartItemId: string) => cartItemId.includes('-w');
  const updateCartItemQtyDirect = (cartItemId: string, newQty: number) => {
    if (isFeeLineId(cartItemId)) return; // سطر رسوم التبغ يُحسب تلقائياً
    const line = cart.find(i => i.cartItemId === cartItemId);
    if (line) {
      const f = line.factor && line.factor > 0 ? line.factor : 1;
      const shortage = stockShortage(line.id, Math.max(1, newQty) * f, cartItemId);
      if (shortage && Math.max(1, newQty) > line.qty) { triggerPrintNotification(shortage, 4000); return; }
    }
    // أسطر الوزن تقبل أقل من 1 كجم
    const minQ = cartItemId.includes('-w') ? 0.001 : 1;
    setCart(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, qty: Math.max(minQ, newQty), ...lineAmounts(item.price, Math.max(minQ, newQty)) } : item));
  };
  /** خصم على صنف: نسبة أو مبلغ على السطر — يُخفَّض سعر الوحدة ويُحفظ الأصلي لإلغائه */
  const [lineDiscId, setLineDiscId] = useState<string | null>(null);
  // نظرة سرّية على التكلفة: ضغط مطوّل على اسم الصنف في السلة يُظهر التكلفة والربح بخط صغير — تختفي فور رفع الإصبع
  // (للمدير، ولمن يمنحه المدير صلاحية «رؤية تكلفة الصنف» — ويمكن إيقافها من إعدادات التطبيق)
  const [costPeekId, setCostPeekId] = useState<string | null>(null);
  const costPeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canPeekCost = costPeekEnabled && (!currentUser || can(currentUser, 'pos.costPeek'));
  const costPeekHandlers = (cartItemId: string) => canPeekCost ? {
    onPointerDown: () => { if (costPeekTimer.current) clearTimeout(costPeekTimer.current); costPeekTimer.current = setTimeout(() => setCostPeekId(cartItemId), 550); },
    onPointerUp: () => { if (costPeekTimer.current) clearTimeout(costPeekTimer.current); setCostPeekId(null); },
    onPointerLeave: () => { if (costPeekTimer.current) clearTimeout(costPeekTimer.current); setCostPeekId(null); },
    onPointerCancel: () => { if (costPeekTimer.current) clearTimeout(costPeekTimer.current); setCostPeekId(null); },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    style: { WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties,
    'data-cost-peek': cartItemId,
  } : {};
  /** «ت 12.50 · ر 4.30»: تكلفة الوحدة وربحها قبل الضريبة — مختصرة وبلون خافت حتى لا يفهمها العميل */
  const costPeekChip = (item: CartItem) => {
    if (costPeekId !== item.cartItemId) return null;
    const pc = products.find((p) => p.id === item.id)?.cost || 0;
    const cost = pc > 0 ? pc * (item.factor && item.factor > 0 ? item.factor : 1) : 0;
    return (
      <div className="text-[12.5px] font-black font-mono text-slate-500 dark:text-slate-400 leading-5" data-testid="cost-peek" dir="rtl">
        {cost > 0 ? <>ت {cost.toFixed(2)} · ر {(item.price - cost).toFixed(2)}</> : 'ت —'}
      </div>
    );
  };
  const [lineDiscVal, setLineDiscVal] = useState('');
  const [lineDiscType, setLineDiscType] = useState<'fixed' | 'percent'>('percent');
  const applyLineDiscount = (cartItemId: string) => {
    if (isFeeLineId(cartItemId)) return; // سطر رسوم التبغ يُحسب تلقائياً
    const it = cart.find(c => c.cartItemId === cartItemId);
    if (!it) return;
    const v = Math.max(0, parseFloat(lineDiscVal) || 0);
    const base = it.promoBase ?? it.originalPrice ?? it.price;
    const noPromo = { promoId: undefined, promoName: undefined, promoBase: undefined };
    if (!v) { setCart(prev => prev.map(c => c.cartItemId === cartItemId ? { ...c, ...noPromo, manualPrice: undefined, price: base, originalPrice: undefined, ...lineAmounts(base, c.qty) } : c)); setLineDiscId(null); return; }
    const lineShown = toShownPrice(base) * it.qty;
    const err = checkDiscount(discountRules, { type: lineDiscType, value: v, scope: 'total', rawSubtotal: base * it.qty, rawTotalWithTax: lineShown });
    if (err) { triggerPrintNotification(`🚫 خصم الصنف: ${err}`, 5000); return; }
    const newShownUnit = lineDiscType === 'percent' ? toShownPrice(base) * (1 - v / 100) : toShownPrice(base) - v / it.qty;
    const net = toNetPrice(Math.max(0.01, newShownUnit));
    setCart(prev => prev.map(c => c.cartItemId === cartItemId ? { ...c, ...noPromo, manualPrice: true, price: net, originalPrice: base, ...lineAmounts(net, c.qty) } : c));
    setLineDiscId(null); setLineDiscVal('');
  };

  /** وصف السطر في السلة — يُطبع في الفاتورة تحت اسم الصنف */
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const updateCartItemDescription = (cartItemId: string, description: string) =>
    setCart(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, description: description || undefined } : item));
  /** newShownPrice بنفس طريقة إدخال الأسعار (شامل/غير شامل حسب الإعداد) */
  const updateCartItemPrice = (cartItemId: string, newShownPrice: number) => {
    if (isFeeLineId(cartItemId)) return; // سطر رسوم التبغ يُحسب تلقائياً
    const net = toNetPrice(newShownPrice);
    setCart(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, price: net, originalPrice: undefined, promoId: undefined, promoName: undefined, promoBase: undefined, manualPrice: true, ...lineAmounts(net, item.qty) } : item));
  };
  
  const incrementQty = (cartItemId: string) => {
    if (isFeeLineId(cartItemId)) return; // سطر رسوم التبغ يُحسب تلقائياً
    const line = cart.find(i => i.cartItemId === cartItemId);
    if (line) {
      const shortage = stockShortage(line.id, line.factor && line.factor > 0 ? line.factor : 1);
      if (shortage) { triggerPrintNotification(shortage, 4000); return; }
    }
    setCart(prev => prev.map(item => item.cartItemId === cartItemId ? {
      ...item,
      qty: item.qty + 1,
      ...lineAmounts(item.price, item.qty + 1)
    } : item));
  };

  const decrementQty = (cartItemId: string) => {
    if (isFeeLineId(cartItemId)) return; // سطر رسوم التبغ يُحسب تلقائياً
    // إنقاص آخر حبة = حذف الصنف من السلة → يحتاج صلاحية الحذف
    const line = cart.find(item => item.cartItemId === cartItemId);
    if (line && line.qty <= 1) { removeFromCart(cartItemId); return; }
    setCart(prev => {
      const target = prev.find(item => item.cartItemId === cartItemId);
      if (!target) return prev;
      if (target.qty <= 1) {
        return prev.filter(item => item.cartItemId !== cartItemId);
      }
      return prev.map(item => item.cartItemId === cartItemId ? {
        ...item,
        qty: item.qty - 1,
        ...lineAmounts(item.price, item.qty - 1)
      } : item);
    });
  };
  
  // ==========================================
  // 🚬 رسوم تقديم منتجات التبغ (نسخة Pro)
  // لائحة وزارة البلديات: 100% من سعر منتج التبغ وبحد أدنى 25 ريالاً لكل وحدة،
  // وضريبة القيمة المضافة تُحسب على السعر مع الرسم. تُضاف سطراً مستقلاً في الفاتورة (ويظهر في ملف الهيئة).
  // ==========================================
  // العروض والتخفيضات: سعر السطر = أوفر عرض فعّال (لا يُطبَّق على السعر المعدَّل يدوياً ولا على الباقات)
  const promoProductGroup = useMemo(() => new Map(products.map(p => [p.id, p.groupId])), [products]);
  const applyPromo = (line: CartItem): CartItem => {
    if (line.manualPrice || line.isBundle || (line.originalPrice && !line.promoId)) return line;
    const base = line.promoBase ?? line.price;
    const whole = !(line.factor && line.factor !== 1) && !line.cartItemId.includes('-w');
    const best = promotions.length ? bestPromo(promotions, line.id, promoProductGroup.get(line.id), base, line.qty, toNetPrice, whole) : null;
    if (best) {
      const unit = best.total / line.qty;
      if (line.promoId === best.promo.id && line.promoBase === base && Math.abs(line.price - unit) < 1e-7) return line;
      return { ...line, price: unit, originalPrice: base, promoBase: base, promoId: best.promo.id, promoName: best.promo.name, ...lineAmounts(unit, line.qty) };
    }
    if (line.promoId) return { ...line, price: base, originalPrice: undefined, promoBase: undefined, promoId: undefined, promoName: undefined, ...lineAmounts(base, line.qty) };
    return line;
  };

  // المطعم بأنواع الطلبات: التوصيل يتبع نوع الطلب — وإلا زر «توصيل» في السلة
  const restOrderTypes = businessType === 'restaurant' && restOpts.orderTypes;
  const deliveryActive = deliverySettings.enabled && (restOrderTypes ? orderType === 'delivery' : deliveryOn);
  const tobaccoIds = useMemo(() => new Set(products.filter(p => p.isTobacco).map(p => p.id)), [products]);
  const tobaccoCfg = companySettings.tobaccoFee;
  // سطر الرسوم يظهر مباشرة تحت صنف التبغ نفسه وبنفس كميته
  useEffect(() => {
    setCart(prev => {
      const next: CartItem[] = [];
      for (const line0 of prev) {
        if (line0.isTobaccoFee || line0.isDeliveryFee) continue;
        const line = applyPromo(line0);
        next.push(line);
        if (!tobaccoCfg?.enabled || !tobaccoIds.has(line.id) || !(line.qty > 0)) continue;
        const fee = tobaccoFeePerUnit(Number(line.price) || 0, tobaccoCfg);
        if (fee <= 0) continue;
        const fid = `${TOBACCO_FEE_ID}:${line.cartItemId}`;
        const old = prev.find(i => i.cartItemId === fid);
        next.push(old && Math.abs(old.price - fee) < 0.00005 && old.qty === line.qty
          ? old
          : { id: TOBACCO_FEE_ID, cartItemId: fid, name: TOBACCO_FEE_NAME, price: fee, qty: line.qty, ...lineAmounts(fee, line.qty), isTobaccoFee: true });
      }
      // رسوم التوصيل: آخر سطر في السلة ما دام فيها أصناف
      if (deliveryActive && next.length > 0) {
        const shown = deliveryAmt.trim() !== '' ? parseFloat(deliveryAmt) : deliverySettings.amount;
        const net = toNetPrice(Number.isFinite(shown) && shown > 0 ? shown : 0);
        const old = prev.find(i => i.isDeliveryFee);
        next.push(old && Math.abs(old.price - net) < 0.00005 ? old
          : { id: DELIVERY_FEE_ID, cartItemId: DELIVERY_FEE_ID, name: DELIVERY_FEE_NAME, price: net, qty: 1, ...lineAmounts(net, 1), isDeliveryFee: true });
      }
      return next.length === prev.length && next.every((x, i) => x === prev[i]) ? prev : next;
    });
  }, [cart, tobaccoIds, tobaccoCfg, deliveryActive, deliveryAmt, deliverySettings.amount, promotions, products]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time Cart and Discount Calculations
  const rawSubtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  // الخصم لا يشمل رسوم التبغ (رسم نظامي): أساس الخصم = المجموع بدون سطر الرسوم
  const tobaccoFeeNet = cart.reduce((sum, item) => sum + (isSysLine(item) ? item.price * item.qty : 0), 0);
  const discountBase = Math.max(0, rawSubtotal - tobaccoFeeNet);
  const cleanDiscountVal = Math.max(0, discountValue || 0);
  const rawTotalWithTax = rawSubtotal * (1 + taxRate);

  let discountAmount = 0;       // Taxable subtotal deduction
  let discountedSubtotal = rawSubtotal;
  let calculatedTax = rawSubtotal * taxRate;
  let calculatedTotal = rawTotalWithTax;
  let totalSavings = 0;         // Customer savings in base currency (SAR)

  if (rawSubtotal > 0 && cleanDiscountVal > 0) {
    if (discountType === 'percent') {
      const pct = Math.min(100, cleanDiscountVal);
      discountAmount = (discountBase * pct) / 100;
      discountedSubtotal = Math.max(0, rawSubtotal - discountAmount);
      calculatedTax = discountedSubtotal * taxRate;
      calculatedTotal = discountedSubtotal + calculatedTax;
      totalSavings = rawTotalWithTax - calculatedTotal;
    } else {
      // Fixed financial amount discount (خصم بقيمة مالية ثابتة)
      if (discountScope === 'total') {
        // Fixed discount directly on invoice grand total (inclusive of VAT)
        totalSavings = Math.min(discountBase * (1 + taxRate), cleanDiscountVal);
        calculatedTotal = Math.max(0, rawTotalWithTax - totalSavings);
        discountedSubtotal = calculatedTotal / (1 + taxRate);
        calculatedTax = calculatedTotal - discountedSubtotal;
        discountAmount = rawSubtotal - discountedSubtotal;
      } else {
        // Fixed discount on pre-tax subtotal
        discountAmount = Math.min(discountBase, cleanDiscountVal);
        discountedSubtotal = Math.max(0, rawSubtotal - discountAmount);
        calculatedTax = discountedSubtotal * taxRate;
        calculatedTotal = discountedSubtotal + calculatedTax;
        totalSavings = rawTotalWithTax - calculatedTotal;
      }
    }
  }

  // قواعد الخصم: لا خصم يساوي الفاتورة أو يتجاوزها، والحد الأعلى/الإغلاق من إعدادات التطبيق
  const discountError = checkDiscount(discountRules, { type: discountType, value: cleanDiscountVal, scope: discountScope, rawSubtotal, rawTotalWithTax });
  // الخصم يتصفّر تلقائياً إذا فرغت السلة بحذف أصنافها واحداً واحداً (مثل «تفريغ السلة»)
  const realCartCount = cart.filter((c) => !isSysLine(c)).length;
  useEffect(() => { if (realCartCount === 0 && discountValue) setDiscountValue(0); }, [realCartCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // أصناف سعرها في البطاقة أقل من تكلفتها — تُعرض في الإعدادات ليُصلحها المدير قبل أن تُوقف الكاشير
  const belowCostHits = useMemo(
    () => (currentView === 'appSettings' ? belowCostProducts(products, pricesIncludeTax ? 1 + taxRate : 1, belowCostRule.enabled ? belowCostRule.minMarginPct : 0) : []),
    [currentView, products, pricesIncludeTax, taxRate, belowCostRule.enabled, belowCostRule.minMarginPct]
  );
  const [productsInitFilter, setProductsInitFilter] = useState<'belowcost' | undefined>(undefined);
  useEffect(() => { if (currentView !== 'products') setProductsInitFilter(undefined); }, [currentView]);
  /** أصناف السلة التي سعرها (بعد خصم الصنف وخصم الفاتورة، قبل الضريبة) أقل من التكلفة + الهامش الأدنى */
  const belowCostLines = () => {
    if (!belowCostRule.enabled) return [];
    const pct = Math.max(0, Number(belowCostRule.minMarginPct) || 0);
    const f = discountBase > 0 ? Math.max(0, 1 - discountAmount / discountBase) : 1;
    const out: { name: string; minPrice: number }[] = [];
    for (const it of cart) {
      if (isSysLine(it)) continue;
      const pc = products.find((p) => p.id === it.id)?.cost || 0;
      if (!(pc > 0)) continue;
      const cost = pc * (it.factor && it.factor > 0 ? it.factor : 1);
      const min = cost * (1 + pct / 100);
      if (it.price * f < min - 0.005) out.push({ name: it.name, minPrice: toShownPrice(min) });
    }
    return out;
  };
  const openDiscount = (fn: () => void) => {
    if (!discountRules.enabled) { triggerPrintNotification('الخصم مغلق من إعدادات التطبيق', 4000); return; }
    guard('pos.discount', fn);
  };

  // العميل المختار في شاشة البيع (يُعامَل كعميل عام إن حُذف من القائمة)
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null;

  const handleCreateCustomerFromPos = (d: CustomerDraft) => {
    const nc: Customer = { id: `cust-${Date.now()}`, balance: 0, ...d };
    const name = nc.name;
    setCustomers(prev => [...prev, nc]);
    setSelectedCustomerId(nc.id);
    setIsCustomerPickerOpen(false);
    triggerPrintNotification(`تمت إضافة العميل ${name}`);
  };

  const handleQuickAddProduct = (p: Product, addNow: boolean) => {
    setProducts(prev => [p, ...prev]);
    setIsQuickProductOpen(false);
    if (addNow) addToCart(p as ExtendedProduct);
    triggerPrintNotification(`تمت إضافة الصنف ${p.nameAr}`);
  };

  // ==========================================
  // 📥 استيراد الأصناف من CSV
  // ==========================================
  const handleImportProducts = (r: ProductsImportResult) => {
    if (r.newGroups.length) setProductGroups(prev => [...prev, ...r.newGroups]);
    setProducts(prev => {
      const updated = prev.map(p => (r.updates[p.id] ? { ...p, ...r.updates[p.id] } : p));
      return [...r.newProducts, ...updated];
    });
  };

  // ==========================================
  // 💵 تسجيل دفعة سداد من عميل (توزَّع على أقدم الفواتير غير المسددة)
  // ==========================================
  const handleRecordCustomerPayment = (customerId: string, amount: number, method: PayMethod) => {
    saveUrgently();
    const customer = customers.find(c => c.id === customerId);
    if (!customer || amount <= 0) return;
    let left = round2(amount);
    const date = localTimestamp();
    const next = [...invoices];
    const order = next
      .map((_, i) => i)
      .filter(i => isUnsettled(next[i]) && (next[i].customerId === customerId || (!next[i].customerId && next[i].customerName === customer.name)))
      .sort((a, b) => (next[a].date < next[b].date ? -1 : 1));
    for (const i of order) {
      if (left <= 0) break;
      const inv = next[i];
      const rem = invoiceRemaining(inv);
      const pay = round2(Math.min(rem, left));
      left = round2(left - pay);
      const newRem = round2(rem - pay);
      next[i] = {
        ...inv,
        remainingAmount: newRem,
        paymentStatus: newRem <= 0.004 ? 'paid' : 'partial',
        paidAmount: round2(inv.total - newRem),
        payments: [...(inv.payments || []), { id: `pay-${Date.now()}-${i}`, date, amount: pay, method, by: cashierDisplayName }],
      };
    }
    setInvoices(next);
    setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, balance: round2((c.balance || 0) + amount) } : c)));
    triggerPrintNotification(`تم تسجيل دفعة ${amount.toFixed(2)} ﷼ من ${customer.name}`);
  };

  // ==========================================
  // 💳 سداد فاتورة آجلة/جزئية بعينها (من قائمة الفواتير)
  // ==========================================
  // 🔒 منع حذف عميل عليه حركة: فواتير/مرتجعات، عروض أسعار، أو رصيد غير صفري
  const customerMovement = useMemo(() => {
    const ids = new Map<string, number>(); const names = new Map<string, number>();
    for (const i of invoices) {
      if (i.customerId) ids.set(i.customerId, (ids.get(i.customerId) || 0) + 1);
      else if (i.customerName) names.set(i.customerName, (names.get(i.customerName) || 0) + 1);
    }
    const quotes = new Map<string, number>();
    for (const q of quotations) if (q.customerId) quotes.set(q.customerId, (quotes.get(q.customerId) || 0) + 1);
    return { ids, names, quotes };
  }, [invoices, quotations]);
  const customerDeleteBlockReason = (c: Customer): string | null => {
    const inv = (customerMovement.ids.get(c.id) || 0) + (customerMovement.names.get(c.name) || 0);
    const qt = customerMovement.quotes.get(c.id) || 0;
    const parts: string[] = [];
    if (inv) parts.push(`${inv} فاتورة`);
    if (qt) parts.push(`${qt} عرض سعر`);
    if (Math.abs(c.balance || 0) > 0.004) parts.push(`رصيد ${(c.balance || 0).toFixed(2)}`);
    return parts.length ? `لا يمكن حذف العميل «${c.name}» لأن عليه حركة: ${parts.join('، ')}. يمكنك تعديل بياناته بدلاً من حذفه.` : null;
  };

  const findInvoiceCustomer = (inv: Invoice) =>
    inv.customerId ? customers.find(c => c.id === inv.customerId) : customers.find(c => c.name === inv.customerName);

  const handlePayInvoice = (invoiceId: string, amount: number, method: PayMethod) => {
    saveUrgently();
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const rem = invoiceRemaining(inv);
    const pay = round2(Math.min(rem, amount));
    if (pay <= 0) return;
    const newRem = round2(rem - pay);
    const date = localTimestamp();
    setInvoices(prev => prev.map(i => i.id === invoiceId ? {
      ...i,
      remainingAmount: newRem,
      paymentStatus: newRem <= 0.004 ? 'paid' : 'partial',
      paidAmount: round2(i.total - newRem),
      payments: [...(i.payments || []), { id: `pay-${Date.now()}`, date, amount: pay, method, by: cashierDisplayName }],
    } : i));
    const cust = findInvoiceCustomer(inv);
    if (cust) setCustomers(prev => prev.map(c => (c.id === cust.id ? { ...c, balance: round2((c.balance || 0) + pay) } : c)));
    triggerPrintNotification(`تم سداد ${pay.toFixed(2)} ﷼ من الفاتورة ${inv.invoiceNumber}${newRem > 0.004 ? ` — المتبقي ${newRem.toFixed(2)}` : ' — الفاتورة مسددة بالكامل'}`);
  };

  // ==========================================
  // ↩️ مرتجع مبيعات
  //   مستند مستقل بقيم سالبة مرتبط بالفاتورة الأصلية → يُطرح تلقائياً من المبيعات والضريبة والتقارير
  //   يسدّد أولاً المتبقي على العميل من الفاتورة، والباقي يُرد له نقداً/شبكة
  // ==========================================
  const handleCreateReturn = async (invoiceId: string, req: SalesReturnRequest) => {
    const orig = invoices.find(i => i.id === invoiceId);
    if (!orig) return;
    const calc = computeReturn(orig, invoices, req.selection);
    if (calc.lines.length === 0) return;
    if (zatcaBusyRef.current) return;
    const num = allocateDocNumber('RET');
    const retDraft = { ...buildReturnDoc(orig, calc, {
      id: `ret-${Date.now()}`, number: num, date: localTimestamp(), refundMethod: req.refundMethod,
      restock: req.restock, cashierName: cashierDisplayName, note: req.note,
    }), ...deviceStamp() };
    // الإشعار الدائن يتبع نوع الفاتورة الأصلية (ضريبية/مبسطة)
    zatcaBusyRef.current = true;
    const ret = await zatcaSign(retDraft, findInvoiceCustomer(orig), orig.zatca?.kind).finally(() => { zatcaBusyRef.current = false; });
    if (!ret) { releaseDocNumber('RET', num); return; }
    saveUrgently();
    setInvoices(prev => {
      const next = calc.debtOffset > 0
        ? prev.map(i => {
            if (i.id !== orig.id) return i;
            const newRem = round2(invoiceRemaining(i) - calc.debtOffset);
            return { ...i, remainingAmount: newRem, paymentStatus: newRem <= 0.004 ? 'paid' as const : 'partial' as const };
          })
        : prev;
      return [ret, ...next];
    });
    void archiveInvoice(ret);
    if (calc.debtOffset > 0) {
      const cust = findInvoiceCustomer(orig);
      if (cust) setCustomers(prev => prev.map(c => (c.id === cust.id ? { ...c, balance: round2((c.balance || 0) + calc.debtOffset) } : c)));
    }
    // إعادة الكميات للمخزون (كمية سالبة = إضافة) — بنفس عدد حبات التعبئة ومكونات الباقة
    if (req.restock) {
      // الفواتير القديمة لا تحفظ معرّف الصنف: نستدل عليه من الاسم ("الصنف" أو "الصنف - التعبئة")
      const resolve = (it: { productId?: string; name: string; factor?: number }) => {
        if (it.productId) return { productId: it.productId, factor: it.factor };
        const name = (it.name || '').trim();
        for (const p of products) {
          if (p.nameAr === name) return { productId: p.id, factor: 1 };
          if (name.startsWith(p.nameAr + ' - ')) {
            const unitName = name.slice(p.nameAr.length + 3);
            const u = p.units?.find(x => x.name === unitName);
            return { productId: p.id, factor: u?.factor || 1 };
          }
        }
        return { productId: undefined, factor: 1 };
      };
      deductStockForSale(ret.items.map(it => ({ ...resolve(it), qty: it.qty })));
    }
    triggerPrintNotification(`تم تسجيل المرتجع ${num} بقيمة ${calc.total.toFixed(2)} ﷼${calc.refund > 0 ? ` — يُرد للعميل ${calc.refund.toFixed(2)}` : ''}`);
  };

  // ==========================================
  // 🖨️ الطباعة: الطابعة المناسبة + الصامتة + تذاكر المطبخ
  // ==========================================
  /**
   * توجيه الطباعة:
   *  - التجزئة: الإيصال الحراري → الطابعة المختارة في شريط الكاشير (وإلا طابعة الإيصالات في إعدادات الطباعة)
   *             فاتورة A4 → طابعة A4 من إعدادات الطباعة (وإلا الطابعة المختارة)
   *  - المطعم: طابعة الكاشير المتصلة
   *  undefined = يترك القرار لإعدادات الطباعة (printCurrentPage)
   */
  // «توجيه» الطابعة أُزيل من شاشة البيع: الاختيار القديم يصبح طابعة الإيصالات الافتراضية (إن لم تُحدَّد) ثم يُلغى
  useEffect(() => {
    if (!selectedRetailPrinterId) return;
    const chosen = printersList.find(p => p.id === selectedRetailPrinterId)?.osPrinterName;
    if (chosen && !printSettings.receiptPrinter) setPrintSettings(p => ({ ...p, receiptPrinter: chosen }));
    setSelectedRetailPrinterId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRetailPrinterId]);
  const resolveReceiptPrinter = (template: 'thermal80' | 'A4' = 'thermal80'): string | undefined => {
    if (businessType === 'retail') {
      if (template === 'A4') return printSettings.a4Printer || undefined;
      return undefined; // طابعة الإيصالات الافتراضية من شاشة الطابعات
    }
    if (template === 'A4') return undefined;
    return printersList.find(p => p.type === 'cashier' && p.status === 'online')?.osPrinterName || undefined;
  };

  /** القالب الافتراضي للطباعة/إعادة الطباعة حسب نوع النشاط واختيار الكاشير */
  const defaultPrintTemplate = (): 'thermal80' | 'A4' =>
    businessType === 'retail' && retailPrintTemplate !== 'thermal80' ? 'A4' : 'thermal80';

  /** ما يحدث تلقائياً عند فتح معاينة فاتورة: طباعة، حفظ PDF، أو معاينة فقط */
  const printIntentRef = useRef<'print' | 'pdf' | 'preview' | 'direct'>('print');
  /** طباعة مباشرة بلا معاينة: الفاتورة تُرسم (لازمة للطباعة) لكنها مخفية عن الشاشة — لا وميض للمعاينة.
   *  إن فشلت الطباعة تظهر المعاينة ليُعيد المستخدم المحاولة. */
  const [printGhost, setPrintGhost] = useState(false);
  useEffect(() => { if (!printInvoiceData) setPrintGhost(false); }, [printInvoiceData]);
  const [printIsCopy, setPrintIsCopy] = useState(false);
  /** copy = فاتورة سابقة تُعاد طباعتها → تظهر عليها علامة «نسخة» */
  /** سلوك ما بعد البيع: الإعداد الصريح، وإلا حسب الطباعة الصامتة والقالب المختار سابقاً */
  // «فاتورة مفرّغة مباشرة» (إصدار سابق) = A4 مباشرة — التفريغ صار تصميماً من تصاميم A4
  const afterSaleMode: AfterSaleMode = ((printSettings.afterSale as string) === 'printPlain' ? 'printA4' : printSettings.afterSale)
    || (retailPrintTemplate === 'pdf' ? 'pdf' : !printSettings.silent ? 'ask' : businessType === 'retail' && retailPrintTemplate === 'A4' ? 'printA4' : 'print80');

  const openInvoicePrint = (inv: Invoice, intent: 'print' | 'pdf' | 'preview' | 'direct', template?: 'thermal80' | 'A4', currency?: string, copy = false, paper?: 'A4' | 'A5') => {
    printIntentRef.current = intent;
    setPrintIsCopy(copy);
    setPrintInvoiceCurrency(currency && cur.enabled ? currency : cur.baseCode);
    // الطباعة الصامتة مغلقة: المعاينة تفتح على القالب المفضّل (A4 افتراضياً) ثم يختار المستخدم ويطبع
    const previewFirst = (intent === 'print' && !printSettings.silent && !!window.ledger) || (intent === 'preview' && !template);
    let tpl = previewFirst ? previewTemplate : template || (intent === 'pdf' ? 'A4' : defaultPrintTemplate());
    let pp: 'A4' | 'A5' = paper || ((printSettings.dotMatrix ? printSettings.dotMatrixPaper === 'A5' : printSettings.largePaper === 'A5') ? 'A5' : 'A4');
    // نافذة المعاينة: إن كان المقاس مخفياً من الإعدادات تُفتح على أول مقاس ظاهر
    if (previewFirst || intent === 'preview') {
      const v = visiblePreviewPaper(printSettings, tpl === 'thermal80' ? 'thermal' : pp);
      if (v === 'thermal') tpl = 'thermal80'; else { tpl = 'A4'; pp = v; }
    }
    setActivePrintTemplate(tpl);
    setPreviewPaper(pp);
    setPrintGhost(intent === 'direct' || (intent === 'print' && !previewFirst));
    setPrintInvoiceData(inv);
  };

  // ==========================================
  // 🗄️ أرشيف الفواتير: كل فاتورة جديدة تُحفظ PDF في المجلد الذي يختاره المستخدم (السنة/الشهر)
  // ==========================================
  const collectAppCss = () => {
    let css = '';
    for (const ss of Array.from(document.styleSheets)) {
      try { for (const r of Array.from(ss.cssRules)) css += r.cssText + '\n'; } catch { /* ورقة من مصدر آخر */ }
    }
    return css;
  };
  const archiveInvoice = async (inv: Invoice, overwrite = false): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
    const api = window.ledger?.archive;
    if (!api) return { ok: false, skipped: true };
    try {
      const cfg = await api.get();
      if (!cfg.invoiceDir || !cfg.invoicePdf) return { ok: false, skipped: true };
      const payload = invoiceQrPayload(inv, companySettings);
      const qr = await generateQrDataUrl(payload, { width: 420, margin: 1, errorCorrectionLevel: payload.length > 300 ? 'L' : 'M' });
      const customer = inv.customerId ? customers.find(c => c.id === inv.customerId) : undefined;
      // الأرشيف نسخة رقمية: دائماً بالترويسة الكاملة حتى لو كانت الطباعة على ورق بترويسة جاهزة
      setLetterheadSuppressed(true); setDotMatrixSuppressed(true); setPdfRender(true);
      let markup = '';
      try {
        markup = renderToStaticMarkup(
          <PrintableInvoice invoice={inv} settings={companySettings} customer={customer} templateOverride="A4" qrDataUrl={qr} />
        );
      } finally { setLetterheadSuppressed(false); setDotMatrixSuppressed(false); setPdfRender(false); }
      const base = Array.from(document.styleSheets).find(s => s.href)?.href || document.baseURI;
      const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><base href="${base}"><style>${collectAppCss()}${await appFontCss()}</style>`
        + `<style>html,body{background:#fff;margin:0}</style></head><body><div id="printable-invoice-container">${markup}</div></body></html>`;
      return await api.invoicePdf({ number: inv.invoiceNumber || inv.number, date: inv.date, html, overwrite });
    } catch (e) {
      console.warn('archive invoice failed', e);
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  };
  const archiveRef = useRef(archiveInvoice);
  archiveRef.current = archiveInvoice;

  /** حفظ PDF / المشاركة: بالترويسة الكاملة إن كان خيار «PDF بالترويسة الكاملة» مفعّلاً */
  const [, setLhTick] = useState(0);
  const withFullLetterhead = async <T,>(template: 'thermal80' | 'A4', fn: () => Promise<T>): Promise<T> => {
    const lh = letterheadSettings();
    // PDF/المشاركة: بالترويسة الكاملة (حسب الخيار) ودائماً بالألوان حتى لو كان وضع الطابعة الإبرية مفعّلاً
    const lhOff = template === 'A4' && lh.enabled && lh.pdfFull;
    const dmOff = template === 'A4' && dotMatrixSetting();
    // الشروط والأحكام وبيانات البنك: تظهر في PDF/المشاركة حتى لو كانت مخفية في الطباعة
    const exOn = template === 'A4' && extrasPdfOnlyActive();
    if (!lhOff && !dmOff && !exOn) return fn();
    if (lhOff) setLetterheadSuppressed(true);
    if (dmOff) setDotMatrixSuppressed(true);
    setPdfRender(true);
    setLhTick(t => t + 1);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { return await fn(); } finally { setLetterheadSuppressed(false); setDotMatrixSuppressed(false); setPdfRender(false); setLhTick(t => t + 1); }
  };
  const saveInvoicePdf = async (template: 'thermal80' | 'A4') => {
    const inv = printInvoiceData;
    if (!inv) return;
    const api = window.ledger?.print;
    if (!api?.pagePdf) { window.print(); return; } // المتصفح: «حفظ كـ PDF» من نافذة الطباعة
    const res = await withFullLetterhead(template, async () => {
      // الإيصال: نفس قواعد الطباعة الحرارية (بلا إطار المعاينة) — كان يظهر خط على اليسار والمحتوى مُزاحاً
      const prep = template === 'A4' ? null : thermalPdfPrep();
      const body = document.getElementById('printable-invoice-body');
      const heightMm = prep ? prep.heightMm : body ? Math.ceil(body.scrollHeight * 25.4 / 96) + 8 : undefined;
      try { return await api.pagePdf!({ defaultName: `${inv.invoiceNumber || inv.number}.pdf`, pageSize: template === 'A4' ? largePaper() : 'thermal', heightMm }); }
      finally { prep?.cleanup(); }
    });
    if (res.ok) triggerPrintNotification(`تم حفظ الفاتورة PDF: ${res.path}`, 5000);
    else if (!res.canceled) triggerPrintNotification(`تعذّر حفظ PDF${res.error ? ': ' + res.error : ''}`, 6000);
  };

  /** مشاركة الفاتورة المعروضة: PDF → الحافظة → واتساب/البريد */
  const shareInvoice = async (template: 'thermal80' | 'A4', target: ShareTarget) => {
    const inv = printInvoiceData;
    if (!inv) return;
    const cust = findInvoiceCustomer(inv);
    const num = inv.invoiceNumber || inv.number;
    const r = await withFullLetterhead(template, async () => {
      const prep = template === 'A4' ? null : thermalPdfPrep();
      const body = document.getElementById('printable-invoice-body');
      const heightMm = prep ? prep.heightMm : body ? Math.ceil(body.scrollHeight * 25.4 / 96) + 8 : undefined;
      try { return await shareDocument({
        fileName: `${num}.pdf`, pageSize: template === 'A4' ? largePaper() : 'thermal', heightMm, target,
        phone: cust?.phone, email: cust?.email, subject: `فاتورة ${num} — ${companySettings.companyName || ''}`,
        text: `فاتورة رقم ${num} بمبلغ ${Math.abs(inv.total).toFixed(2)} ريال — ${companySettings.companyName || ''}`,
      }); } finally { prep?.cleanup(); }
    });
    triggerPrintNotification(r.message, 7000);
  };

  /** مشاركة تقرير الإقفال كملف PDF (واتساب / بريد / مجلد) */
  const shareZReport = async (target: ShareTarget) => {
    const rec = printZReportData;
    if (!rec) return;
    const prep = thermalPdfPrep();
    try {
      const r = await shareDocument({
        fileName: `${rec.reportNumber || 'Z-report'}.pdf`, pageSize: 'thermal', heightMm: prep.heightMm, target,
        subject: `تقرير الإقفال ${rec.reportNumber || ''} — ${companySettings.companyName || ''}`,
        text: `تقرير إقفال ${rec.kind === 'shift' ? 'وردية' : 'يومي'} رقم ${rec.reportNumber || ''} — ${companySettings.companyName || ''}`,
      });
      triggerPrintNotification(r.message, 7000);
    } finally { prep.cleanup(); }
  };

  /** الطابعة المخصصة للقالب: إيصال 80مم → طابعة الإيصالات، A4 → طابعة A4 */
  const targetPrinterFor = (template: 'thermal80' | 'A4') =>
    resolveReceiptPrinter(template) || (template === 'A4' ? printSettings.a4Printer || printSettings.receiptPrinter : printSettings.receiptPrinter) || '';
  const doPrint = async (template: 'thermal80' | 'A4', direct = false) => {
    try {
      const device = targetPrinterFor(template);
      // الطباعة دائماً للطابعة المخصصة للقالب مباشرة (بلا نافذة النظام) — النافذة فقط إن لم تُحدَّد طابعة
      const res = await printCurrentPage(printSettings, { template, deviceName: device || undefined, forceSilent: !!device || direct });
      if (!res.ok) {
        setPrintGhost(false); // تظهر المعاينة لإعادة المحاولة
        if ((printSettings.silent || device) && res.reason !== PRINT_CANCELLED) triggerPrintNotification(`⚠️ تعذرت الطباعة${device ? ' على ' + device : ''}${res.reason ? ': ' + res.reason : ''}`, 9000);
      } else {
        if (!printSettings.silent && device) triggerPrintNotification(`تمت الطباعة — ${template === 'A4' ? `فاتورة ${largePaper()}` : 'إيصال 80مم'} على ${device}`);
        setPrintInvoiceData(null); // لا حاجة لبقاء المعاينة بعد الطباعة
      }
    } catch (e) {
      setPrintGhost(false);
      console.warn('print failed', e);
    }
  };

  /**
   * تذاكر المطعم:
   *  - طابعة المطبخ الرئيسية (إن فُعّلت): كل أصناف الطلب في ورقة واحدة — عادية أو بالأسعار
   *  - طابعات الأقسام: فقط الأصناف التي مجموعتها مربوطة بالطابعة (لا طباعة للصنف بلا مجموعة/طابعة)
   */
  const printKitchenTickets = async (invoice: Pick<Invoice, 'invoiceNumber' | 'orderNumber' | 'orderType' | 'date' | 'note' | 'total'> & { cashierName?: string }, items: { id: string; name: string; qty: number; price?: number; total?: number; description?: string }[], opts: { sections?: boolean } = {}): Promise<{ attempted: number; sent: number; failed: { title: string; reason: string }[] }> => {
    let attempted = 0, sent = 0;
    const prodById = new Map(products.map(p => [p.id, p]));
    // أسطر صغيرة تحت الصنف: مكوّنات الباقة (ليحضّرها المطبخ) + ملاحظة كتبها الكاشير (غير وصف الصنف الثابت)
    const subOf = (it: { id: string; qty: number; description?: string }) => {
      const prod = prodById.get(it.id);
      const sub: string[] = [];
      if (prod?.isBundle) for (const bi of prod.bundleItems || []) sub.push(`- ${bundleQty(bi.qty, it.qty)}× ${prodById.get(bi.productId)?.nameAr || bi.productName}`);
      const note = (it.description || '').trim();
      if (note && note !== (prod?.description || '').trim()) sub.push(`ملاحظة: ${note}`);
      return sub.length ? sub : undefined;
    };
    const sectionPrinter = (prod?: Product) => {
      const grp = prod?.groupId ? productGroups.find(g => g.id === prod.groupId) : undefined;
      return grp?.printerId ? printersList.find(p => p.id === grp.printerId && p.status === 'online') : undefined;
    };
    const failed: { title: string; reason: string }[] = [];
    const send = async (...args: Parameters<typeof printKitchenTicket>) => {
      attempted++;
      const r = await printKitchenTicket(...args).catch((e: unknown) => ({ ok: false, reason: String((e as Error)?.message || e) }));
      if (r.ok) sent++; else failed.push({ title: args[0].title, reason: r.reason || '' });
    };
    // اسم الكاشير: نفس إعداد «اسم الكاشير في الإيصال الحراري»
    const cashier = companySettings.receiptCashier !== false ? (invoice.cashierName || cashierDisplayName || '').trim() || undefined : undefined;
    const head = { storeName: companySettings.companyName || undefined, invoiceNumber: invoice.invoiceNumber, orderNumber: invoice.orderNumber, orderType: invoice.orderType, date: invoice.date, note: invoice.note, cashier };
    const km = { ...DEFAULT_KITCHEN_MAIN, ...(printSettings.kitchenMain || {}) };
    if (km.enabled) {
      await send(
        { ...head, title: km.name?.trim() || 'طابعة المطبخ', total: invoice.total, items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price != null ? toShownPrice(i.price) : undefined, total: i.total, sub: subOf(i) })) },
        { priced: km.template === 'priced', offsetMm: km.offsetMm, padRightMm: km.padRightMm, padLeftMm: km.padLeftMm, fontPct: km.fontPct, copies: km.copies, silent: km.silent, raw: km.raw !== false, deviceName: km.printer || printSettings.receiptPrinter || undefined },
      );
    }
    // طابعات الأقسام: لها خيارها المستقل (لا يوقف طابعة المطبخ الرئيسية)
    if (opts.sections !== false) {
      const buckets = new Map<string, { pr: AppPrinter; items: { name: string; qty: number; price?: number; total?: number; sub?: string[] }[] }>();
      const push = (pr: AppPrinter, line: { name: string; qty: number; price?: number; total?: number; sub?: string[] }) => {
        if (!buckets.has(pr.id)) buckets.set(pr.id, { pr, items: [] });
        buckets.get(pr.id)!.items.push(line);
      };
      for (const it of items) {
        const prod = prodById.get(it.id);
        const pr = sectionPrinter(prod);
        if (pr) { push(pr, { name: it.name, qty: it.qty, price: it.price != null ? toShownPrice(it.price) : undefined, total: it.total, sub: subOf(it) }); continue; }
        // باقة بلا طابعة قسم: كل مكوّن يذهب لطابعة قسمه (البرجر للشواية، العصير للمشروبات...) مع ملاحظة الكاشير على الباقة
        if (prod?.isBundle) {
          const noteText = (it.description || '').trim();
          const note = noteText && noteText !== (prod.description || '').trim() ? `ملاحظة: ${noteText}` : '';
          for (const bi of prod.bundleItems || []) {
            const cp = prodById.get(bi.productId);
            const cpr = sectionPrinter(cp);
            if (cpr) push(cpr, { name: cp?.nameAr || bi.productName, qty: Number(bundleQty(bi.qty, it.qty)), sub: [`ضمن: ${it.name}`, ...(note ? [note] : [])] });
          }
        }
        // صنف بلا طابعة قسم مربوطة (أو الطابعة متوقفة): لا ورقة قسم
      }
      for (const { pr, items: its } of buckets.values()) {
        // طابعة القسم: ورقة بدون سعر (افتراضي) أو بالأسعار — الإجمالي = مجموع أصناف هذا القسم
        await send(
          { ...head, title: pr.name, items: its, total: round2(its.reduce((t, i) => t + (i.total || 0), 0)) },
          { priced: pr.ticketTemplate === 'priced', offsetMm: pr.offsetMm, padRightMm: pr.padRightMm, padLeftMm: pr.padLeftMm, fontPct: pr.fontPct, copies: pr.copies, silent: pr.silent !== false, raw: pr.raw !== false, deviceName: pr.osPrinterName || undefined },
        );
      }
    }
    // الطلب لم يصل للمطبخ: تنبيه واضح للكاشير (لا يكفي سجل وحدة التحكم)
    if (failed.length) {
      triggerPrintNotification(`⚠️ لم تُطبع ورقة ${failed.map(f => `«${f.title}»`).join(' و')}${failed[0].reason ? ` — ${failed[0].reason}` : ''}`, 10000);
    }
    return { attempted, sent, failed };
  };

  /** زر «المطبخ» في شاشة البيع: إرسال السلة الحالية للمطبخ قبل الدفع */
  const sendCartToKitchen = async () => {
    if (!cart.length) { triggerPrintNotification('السلة فارغة — أضف أصنافاً أولاً'); return; }
    const r = await printKitchenTickets(
      { invoiceNumber: 'قبل الدفع', orderNumber: businessType === 'restaurant' && restOpts.orderNumbers ? (Number(orderCounter) || 0) + 1 : undefined, orderType: restOpts.orderTypes ? orderType : undefined, date: localTimestamp(), note: invoiceNote.trim() || undefined, total: calculatedTotal },
      cart.filter(c => !isSysLine(c)).map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price, total: c.total, description: c.description })),
    );
    if (!r.attempted) triggerPrintNotification('لا توجد طابعة مطبخ مفعّلة — فعّل «طابعة المطبخ» أو اربط المجموعات بطابعات الأقسام من شاشة الطابعات', 5000);
    else if (!r.failed.length) triggerPrintNotification(`👨‍🍳 تم إرسال الطلب إلى ${printSettings.kitchenMain?.enabled && printSettings.kitchenMain?.name?.trim() ? `«${printSettings.kitchenMain.name.trim()}»` : 'المطبخ'} (${r.sent} ورقة)`, 5000);
    // الفشل: نبّه عنه printKitchenTickets نفسه
  };

  const handlePartialConfirm = (d: PartialPaymentData) => {
    let customerId = d.customerId;
    let customerName = customers.find(c => c.id === customerId)?.name || '';
    if (d.newCustomer) {
      const nc: Customer = { id: `cust-${Date.now()}`, name: d.newCustomer.name, phone: d.newCustomer.phone, email: '', address: '', balance: 0 };
      setCustomers(prev => [...prev, nc]);
      customerId = nc.id;
      customerName = nc.name;
    }
    setIsPartialModalOpen(false);
    handleCheckout(d.method, d.paid, false, { customerId, customerName, paid: d.paid, method: d.method });
  };

  // ==========================================
  // 📄 تحويل عرض سعر إلى فاتورة
  // ==========================================
  const handleConvertQuotation = async (q: Quotation, opts: ConvertOptions) => {
    if (zatcaBusyRef.current) return;
    if (!requireLicense()) return;
    const rate = (q.taxRate || 0) / 100;
    const remaining = opts.credit ? Math.max(0, round2(q.total - opts.paid)) : 0;
    const num = allocateDocNumber('INV');
    const now = localTimestamp();
    const draft: Invoice = {
      ...deviceStamp(),
      id: `inv-${Date.now()}`,
      number: num,
      invoiceNumber: num,
      date: now,
      customerName: q.customerName,
      items: q.items.map(i => {
        // عرض بأسعار شاملة: إجمالي السطر = السعر الشامل المعروض × الكمية (كما رآه العميل)
        const lineTotal = q.pricesIncludeTax ? round2(round2(i.price * (1 + rate)) * i.qty) : round2(i.price * i.qty * (1 + rate));
        return {
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          price: i.price,
          tax: q.pricesIncludeTax ? round2(lineTotal - i.price * i.qty) : round2(i.price * i.qty * rate),
          total: lineTotal,
        };
      }),
      rawSubtotal: q.rawSubtotal,
      subtotal: q.subtotal,
      tax: q.tax,
      total: q.total,
      discount: q.discount > 0 ? q.discount : undefined,
      discountType: q.discount > 0 ? q.discountType : undefined,
      // الخصم الثابت في العرض الشامل مُدخل شاملاً؛ الفاتورة تحفظ قيمته الصافية
      discountValue: q.discount > 0 ? (q.pricesIncludeTax && q.discountType === 'fixed' ? q.discount : q.discountValue) : undefined,
      discountScope: q.discount > 0 ? 'subtotal' : undefined,
      paymentMethod: opts.method,
      paidAmount: opts.paid,
      changeAmount: 0,
      cashierName: cashierDisplayName,
      note: q.notes?.trim() || undefined,
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(opts.credit ? {
        remainingAmount: remaining,
        paymentStatus: (opts.paid <= 0 ? 'unpaid' : 'partial') as 'unpaid' | 'partial',
        payments: opts.paid > 0 ? [{ id: `pay-${Date.now()}`, date: now, amount: opts.paid, method: opts.method, by: cashierDisplayName }] : [],
      } : {}),
    };
    zatcaBusyRef.current = true;
    const inv = await zatcaSign(draft, q.customerId ? customers.find(c => c.id === q.customerId) : null).finally(() => { zatcaBusyRef.current = false; });
    if (!inv) { releaseDocNumber('INV', num); return; }
    saveUrgently();
    setInvoices(prev => [inv, ...prev]);
    void archiveInvoice(inv);
    deductStockForSale(q.items.map(i => ({ productId: i.productId, qty: i.qty, factor: i.factor })));
    if (opts.credit && remaining > 0 && q.customerId) {
      setCustomers(prev => prev.map(c => (c.id === q.customerId ? { ...c, balance: round2((c.balance || 0) - remaining) } : c)));
    }
    setQuotations(prev => prev.map(x => (x.id === q.id ? { ...x, status: 'invoiced', invoiceId: inv.id, invoiceNumber: num } : x)));
    triggerPrintNotification(`تم إنشاء الفاتورة ${num} من ${q.number}`);
  };

  // ==========================================
  // 📦 خصم المخزون عند البيع
  //   الكمية × عدد حبات التعبئة (الكرتون = 12 حبة مثلاً)
  //   الباقة (كومبو): يُخصم من مخزون الباقة ومن مخزون كل مكوّن بحسب كميته فيها
  //   يُسمح بالمخزون السالب حتى لا يتوقف البيع — ويظهر الصنف "نافد" لتنبيهك بتسجيل المشتريات
  // ==========================================
  const deductStockForSale = (lines: { productId?: string; qty: number; factor?: number }[]) => {
    setProducts(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      // مكوّن الباقة: بالمعرّف، وإن تغيّر (استيراد الأصناف من جديد) فبالاسم
      const byName = new Map(prev.filter(p => !p.isBundle).map(p => [(p.nameAr || '').trim(), p]));
      const component = (bi: BundleItem) => byId.get(bi.productId) || byName.get((bi.productName || '').trim());
      const delta = new Map<string, number>();
      const add = (id: string, units: number) => delta.set(id, (delta.get(id) || 0) + units);
      for (const l of lines) {
        if (!l.productId) continue;
        const p = byId.get(l.productId);
        if (!p) continue;
        const units = (l.qty || 0) * (l.factor && l.factor > 0 ? l.factor : 1);
        if (!units) continue;
        if (!p.isService) add(p.id, units); // الخدمات لا تُخصم من المخزون
        // الباقة: تُخصم مكوّناتها دائماً (حتى لو كانت الباقة نفسها بلا مخزون)
        if (p.isBundle) for (const bi of p.bundleItems || []) { const c = component(bi); if (c && !c.isService && !c.isBundle) add(c.id, units * (bi.qty || 1)); }
      }
      if (delta.size === 0) return prev;
      // نعدّل الأصناف المتأثرة فقط (البقية بنفس المرجع → الحفظ يرسل الأصناف المتغيّرة فقط)
      return prev.map(p => delta.has(p.id) ? { ...p, stock: Math.round(((p.stock || 0) - delta.get(p.id)!) * 1000) / 1000 } : p);
    });
  };

  /** باقة/كومبو في الفاتورة: مكوّناتها (بأسمائها الحالية) + توفير العرض مقارنةً بشراء المكوّنات منفردة */
  const bundleLineInfo = (item: CartItem): Pick<InvoiceItem, 'bundle' | 'bundleSaving'> => {
    if (!item.isBundle) return {};
    const comps = products.find(p => p.id === item.id)?.bundleItems || item.bundleItems || [];
    if (!comps.length) return {};
    let sum = 0;
    const bundle = comps.map(bi => {
      const cp = products.find(p => p.id === bi.productId);
      sum += (cp?.price || 0) * (bi.qty || 1);
      return { name: cp?.nameAr || bi.productName, qty: bi.qty || 1 };
    });
    // سعر الباقة قبل خصم الصنف (خصم الصنف يُطبع في سطره) — بنفس طريقة عرض الأسعار
    const unitShown = toShownPrice(item.originalPrice && item.originalPrice > item.price ? item.originalPrice : item.price);
    const saving = round2((sum - unitShown) * item.qty);
    return saving > 0.004 ? { bundle, bundleSaving: saving } : { bundle };
  };

  /** إعادة تعيين البيانات (مدير فقط) — نسخة احتياطية أولاً، ثم الحذف */
  const resetData = async (c: ResetChoice): Promise<{ ok: boolean; message: string }> => {
    if (currentUser?.role !== 'admin') return { ok: false, message: 'هذا الإجراء للمدير فقط' };
    try {
      await flushNow();
      const arch = window.ledger?.archive;
      if (arch) await arch.backupNow();
    } catch (e) {
      return { ok: false, message: `تعذّر أخذ نسخة احتياطية قبل الحذف — لم يُحذف شيء (${String((e as Error)?.message || e)})` };
    }
    const done: string[] = [];
    if (c.products) { setProducts([]); done.push('الأصناف'); }
    if (c.groups) {
      setProductGroups([]);
      // الأصناف الباقية (إن لم تُحذف) تصبح بلا مجموعة
      if (!c.products) setProducts(prev => prev.map(p => (p.groupId || p.categoryAr ? { ...p, groupId: undefined, categoryAr: '', categoryEn: '' } : p)));
      if (activeCategory !== 'الكل') setActiveCategory('الكل');
      done.push('مجموعات الأصناف');
    }
    if (c.invoices || c.customers) {
      setInvoices([]); setParkedOrders([]); setCustomers([]); setOrderCounter(0);
      replaceCollection('zReports', []);
      setCart([]); setSelectedCustomerId(null);
      if (c.renumber && !zatcaActive) { allocatedRef.current = {}; setDocCounters({}); }
      done.push('الفواتير', 'العملاء');
    }
    saveUrgently();
    triggerPrintNotification(`تم حذف: ${done.join('، ')} — أُخذت نسخة احتياطية قبل الحذف`, 6000);
    return { ok: true, message: `تم حذف: ${done.join('، ')}. النسخة الاحتياطية محفوظة ويمكن استرجاعها.` };
  };

  const handleCheckout = async (paymentMethod: CheckoutMethod, tenderedAmount?: number, isQuick?: boolean, partial?: CheckoutPartial, split?: CheckoutSplit, confirmed?: boolean) => {
    if (!requireLicense()) return;
    if (zatcaBusyRef.current) return; // منع الضغط المزدوج أثناء الختم
    if (cart.length === 0) {
      triggerPrintNotification('السلة فارغة! أضف أصنافاً أولاً.');
      return;
    }
    // منع البيع إذا كان سعر أي صنف في السلة صفراً (أو أقل)
    const zeroPriced = cart.filter(it => !(it.price > 0));
    if (zeroPriced.length) {
      triggerPrintNotification(`🚫 لا يمكن إتمام البيع: ${zeroPriced.length === 1 ? 'الصنف' : 'الأصناف'} (${zeroPriced.map(i => i.name).join('، ')}) بدون سعر — عدّل السعر أو احذفه من السلة`, 6000);
      return;
    }
    if (discountError) {
      triggerPrintNotification(`🚫 ${discountError} — عدّل الخصم أو ألغِه`, 6000);
      return;
    }
    {
      const low = belowCostLines();
      const preApproved = belowCostOkRef.current;
      belowCostOkRef.current = false;
      if (low.length && !preApproved && !saleApprovals.has('pos.belowCost')) {
        const list = low.map((l) => `${l.name} ≥ ${l.minPrice.toFixed(2)}`).join('، ');
        if (can(currentUser, 'pos.belowCost')) {
          // المدير/المشرف: تأكيد صريح بدل المنع (تصفية، عرض خاص...)
          if (!window.confirm(`تنبيه: البيع بأقل من السعر المسموح\n\n${low.map((l) => `• ${l.name} — أقل سعر ${l.minPrice.toFixed(2)}`).join('\n')}\n\nمتابعة البيع بهذا السعر؟`)) return;
        } else {
          triggerPrintNotification(`🚫 لا يُسمح بالبيع بأقل من السعر المسموح: ${list} — عدّل السعر أو الخصم، أو اطلب موافقة المشرف`, 8000);
          setPendingApproval({ perm: 'pos.belowCost', run: () => { belowCostOkRef.current = true; void handleCheckout(paymentMethod, tenderedAmount, isQuick, partial, split, confirmed); } });
          return;
        }
      }
    }
    if (blockNegativeStock) {
      const need = new Map<string, number>();
      for (const it of cart) need.set(it.id, (need.get(it.id) || 0) + it.qty * (it.factor && it.factor > 0 ? it.factor : 1));
      for (const [pid, units] of need) {
        const p = products.find(x => x.id === pid);
        if (p && units > (p.stock ?? 0) + 1e-9) {
          triggerPrintNotification(`🚫 البيع بالسالب مقفل: الكمية المطلوبة من (${p.nameAr}) ${units} والمتوفر ${Math.max(0, p.stock ?? 0)}`, 5000);
          return;
        }
      }
    }

    // الدفع المقسّم (نقدي + شبكة): الجزآن يساويان الإجمالي، والنقدي المستلم (اختياري) يغطي الجزء النقدي
    const splitPay = paymentMethod === 'split' && split ? { cash: round2(split.cash), card: round2(split.card) } : null;
    if (paymentMethod === 'split') {
      if (!splitPay || splitPay.cash <= 0 || splitPay.card <= 0 || Math.abs(splitPay.cash + splitPay.card - calculatedTotal) > 0.009) {
        triggerPrintNotification(`🚫 الدفع المقسّم: مجموع النقدي والشبكة يجب أن يساوي الإجمالي (${calculatedTotal.toFixed(2)} ﷼)`, 5000);
        return;
      }
      if (tenderedAmount !== undefined && tenderedAmount < splitPay.cash - 0.001) {
        triggerPrintNotification(`المستلم نقداً (${tenderedAmount.toFixed(2)} ﷼) أقل من الجزء النقدي (${splitPay.cash.toFixed(2)} ﷼)!`);
        return;
      }
    }
    const splitReceived = splitPay ? (tenderedAmount !== undefined ? round2(tenderedAmount) : splitPay.cash) : 0;

    const paidAmount = partial
      ? partial.paid
      : splitPay
        ? round2(splitPay.card + splitReceived)
        : paymentMethod === 'cash'
          ? (tenderedAmount !== undefined ? tenderedAmount : calculatedTotal)
          : calculatedTotal;

    if (!partial && paymentMethod === 'cash' && paidAmount < calculatedTotal - 0.001) {
      triggerPrintNotification(`المبلغ المدفوع (${paidAmount.toFixed(2)} ﷼) أقل من الإجمالي المطلوب (${calculatedTotal.toFixed(2)} ﷼)!`);
      return;
    }

    const changeAmount = splitPay
      ? Math.max(0, round2(splitReceived - splitPay.cash))
      : !partial && paymentMethod === 'cash' ? Math.max(0, Number((paidAmount - calculatedTotal).toFixed(2))) : 0;
    const remainingAmount = partial ? Math.max(0, round2(calculatedTotal - paidAmount)) : 0;

    // تأكيد الدفع (إعداد اختياري): نافذة تأكيد قبل حفظ الفاتورة
    if (confirmPayment && !confirmed) {
      const label = partial ? (remainingAmount > 0 ? 'دفع جزئي / آجل' : (partial.method === 'card' ? 'شبكة' : partial.method === 'bank' ? 'تحويل بنكي' : 'كاش'))
        : splitPay ? 'مقسّم (كاش + شبكة)'
        : paymentMethod === 'cash' ? 'كاش' : paymentMethod === 'card' ? 'شبكة' : 'تحويل بنكي';
      setPayConfirm({ args: [paymentMethod, tenderedAmount, isQuick, partial, split], total: calculatedTotal, paid: paidAmount, change: changeAmount, remaining: remainingAmount, label, split: splitPay || undefined });
      return;
    }

    const newInvoiceNum = allocateDocNumber('INV');
    
    const draftInvoice: Invoice = {
      ...deviceStamp(),
      id: `inv-${Date.now()}`,
      number: newInvoiceNum,
      invoiceNumber: newInvoiceNum,
      date: localTimestamp(),
      customerName: partial ? partial.customerName : (selectedCustomer ? selectedCustomer.name : GENERAL_CUSTOMER),
      items: cart.map(item => ({ 
        productId: isSysLine(item) ? undefined : item.id,
        ...(item.isTobaccoFee ? { isTobaccoFee: true } : {}),
        ...(item.isDeliveryFee ? { isDeliveryFee: true } : {}),
        factor: item.factor && item.factor > 0 ? item.factor : undefined,
        name: item.name, 
        ...(() => { const en = englishNameOf({ productId: item.id, name: item.name }); return en ? { nameEn: en } : {}; })(),
        qty: item.qty, 
        price: item.price, 
        ...lineAmounts(item.price, item.qty),
        description: item.description,
        ...(item.serial ? { serial: item.serial } : {}),
        ...(() => { const pc = products.find(p => p.id === item.id)?.cost; return pc && pc > 0 ? { cost: Math.round(pc * (item.factor && item.factor > 0 ? item.factor : 1) * 10000) / 10000 } : {}; })(),
        ...(item.promoName && item.originalPrice && item.originalPrice > item.price ? { promo: item.promoName } : {}),
        ...(item.originalPrice && item.originalPrice > item.price ? { lineDiscount: lineSaving(item) } : {}),
        ...bundleLineInfo(item),
      })),
      rawSubtotal: rawSubtotal,
      subtotal: discountedSubtotal, 
      tax: calculatedTax, 
      total: calculatedTotal,
      discount: totalSavings > 0 ? Number(totalSavings.toFixed(2)) : undefined,
      discountType: totalSavings > 0 ? discountType : undefined,
      discountValue: totalSavings > 0 ? cleanDiscountVal : undefined,
      discountScope: totalSavings > 0 ? discountScope : undefined,
      paymentMethod,
      paidAmount,
      changeAmount,
      isQuickPay: !partial && !splitPay && (isQuick || (tenderedAmount !== undefined)),
      cashierName: cashierDisplayName,
      note: invoiceNote.trim() || undefined,
      ...(autoActivity && cleanVehicle(vehicle) ? { vehicle: cleanVehicle(vehicle) } : {}),
      ...(businessType === 'restaurant' && restOpts.orderTypes ? { orderType } : {}),
      ...(businessType === 'restaurant' && restOpts.orderNumbers ? { orderNumber: (Number(orderCounter) || 0) + 1 } : {}),
      ...(!partial && selectedCustomer ? { customerId: selectedCustomer.id } : {}),
      ...(partial ? {
        customerId: partial.customerId,
        remainingAmount,
        paymentStatus: (partial.paid <= 0 ? 'unpaid' : 'partial') as 'unpaid' | 'partial',
        payments: partial.paid > 0 ? [{ id: `pay-${Date.now()}`, date: localTimestamp(), amount: partial.paid, method: partial.method, by: cashierDisplayName }] : [],
      } : {}),
      // المقسّم: دفعتان بتاريخ البيع (تقرير الإقفال يحتسب كل جزء في خانته: نقدي/شبكة)
      ...(splitPay ? {
        paymentStatus: 'paid' as const,
        payments: [
          { id: `pay-${Date.now()}-c`, date: localTimestamp(), amount: splitPay.cash, method: 'cash' as const, note: 'دفع مقسّم', by: cashierDisplayName },
          { id: `pay-${Date.now()}-k`, date: localTimestamp(), amount: splitPay.card, method: 'card' as const, note: 'دفع مقسّم', by: cashierDisplayName },
        ],
      } : {}),
    };

    // الختم الإلكتروني قبل الحفظ — إن فشل لا تُسجَّل العملية وتبقى السلة كما هي
    const saleCart = cart;
    let newInvoice = draftInvoice;
    if (zatcaActive) {
      zatcaBusyRef.current = true;
      const buyer = partial ? customers.find(c => c.id === partial.customerId) : selectedCustomer;
      const signed = await zatcaSign(draftInvoice, buyer).finally(() => { zatcaBusyRef.current = false; });
      if (!signed) { releaseDocNumber('INV', newInvoiceNum); return; }
      newInvoice = signed;
    }

    saveUrgently(); // الفاتورة + المخزون + رصيد العميل تُحفظ فوراً وفي معاملة واحدة
    setInvoices(prev => [newInvoice, ...prev]);
    if (newInvoice.orderNumber) setOrderCounter(newInvoice.orderNumber); // رقم الطلب يتقدم فقط بعد نجاح الحفظ
    if (newInvoice.orderType) setOrderType(restOpts.defaultOrderType); // الطلب التالي يبدأ بالنوع المفضّل
    void archiveInvoice(newInvoice);
    deductStockForSale(saleCart.map(item => ({ productId: item.id, qty: item.qty, factor: item.factor })));
    if (partial && remainingAmount > 0) {
      // المتبقي يُسجَّل مديونية على العميل (رصيد سالب)
      setCustomers(prev => prev.map(c => (c.id === partial.customerId ? { ...c, balance: round2((c.balance || 0) - remainingAmount) } : c)));
    }
    setCart([]); // تفريغ السلة
    setInvoiceNote('');
    setVehicle({});
    setDeliveryOn(false); setDeliveryAmt('');
    setSelectedCustomerId(null);
    setDiscountValue(0); // إعادة تعيين الخصم للعملية القادمة
    setIsDiscountDrawerOpen(false); // إغلاق نافذة الخصم بعد البيع
    setDiscountScope('total');
    setIsCustomQuickPayOpen(false);
    setCustomQuickPayInput('');

    setDisplayPaid({ total: calculatedTotal, paid: paidAmount, change: changeAmount });
    if ((paymentMethod === 'cash' || (splitPay && splitPay.cash > 0)) && deviceSettings.drawerEnabled && deviceSettings.drawerOnCash) void openCashDrawer(true);
    resetSplit();
    if (splitPay && changeAmount > 0 && showChangeBox) {
      // باقي الجزء النقدي من الدفع المقسّم
      setLastCashChange({
        invoiceNumber: newInvoiceNum,
        total: splitPay.cash,
        paidAmount: splitReceived,
        changeAmount,
        customerName: selectedCustomer ? selectedCustomer.name : GENERAL_CUSTOMER,
        isQuickPay: false,
        timestamp: new Date().toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        splitCard: splitPay.card,
      });
    } else if (paymentMethod === 'cash' && !partial && showChangeBox) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastCashChange({
        invoiceNumber: newInvoiceNum,
        total: calculatedTotal,
        paidAmount,
        changeAmount,
        customerName: selectedCustomer ? selectedCustomer.name : GENERAL_CUSTOMER,
        isQuickPay: Boolean(isQuick || (tenderedAmount !== undefined && tenderedAmount !== calculatedTotal)),
        timestamp: timeStr
      });
    } else {
      setLastCashChange(null);
    }

    // ==========================================
    // 🚀 منطق الطباعة الذكي (Electron / Windows)
    // ==========================================
    // ما بعد البيع (التجزئة والمطعم): إيصال مباشر / A4 مباشر / نافذة الاختيار / PDF / بدون طباعة
    {
      const mode = afterSaleMode;
      if (mode === 'print80' || mode === 'printA4' || mode === 'printA5') {
        const tpl = mode === 'print80' ? 'thermal80' : 'A4';
        openInvoicePrint(newInvoice, 'direct', tpl, undefined, false, mode === 'printA5' ? 'A5' : undefined);
        triggerPrintNotification(`طباعة ${tpl === 'A4' ? `فاتورة ${mode === 'printA5' ? 'A5' : largePaper()}` : 'إيصال 80مم'} — ${targetPrinterFor(tpl) || 'الطابعة الافتراضية'}`, 2500);
      } else if (mode === 'pdf') {
        openInvoicePrint(newInvoice, 'pdf', 'A4');
      } else if (mode === 'ask') {
        openInvoicePrint(newInvoice, 'preview'); // نافذة ما بعد البيع: يختار الكاشير القالب والطباعة أو المشاركة
      }
    }
    if (businessType !== 'retail') {
      // طابعة المطبخ (بزرها الخاص) + تذاكر الأقسام (بخيارها المستقل) — كل طابعة بإعداد الطباعة المباشرة الخاص بها
      if (window.ledger) {
        void printKitchenTickets(newInvoice, saleCart.filter(c => !isSysLine(c)).map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price, total: c.total, description: c.description })), { sections: printSettings.autoKitchenTickets });
      }
    }
  };

  // ==========================================
  // ⏸️ منطق الطلبات المعلقة (Parked Orders)
  // ==========================================
  const applyQuickDueMinutes = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    setParkOrderDueDate(`${yyyy}-${mm}-${dd}`);
    setParkOrderDueTime(`${hh}:${min}`);
  };

  const clearParkDue = () => {
    setParkOrderDueDate('');
    setParkOrderDueTime('');
  };

  const formatDueDateTime = (dueDate?: string, dueTime?: string) => {
    if (!dueDate && !dueTime) return null;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let dateLabel = '';
    if (dueDate) {
      if (dueDate === todayStr) {
        dateLabel = 'اليوم';
      } else if (dueDate === tomorrowStr) {
        dateLabel = 'غداً';
      } else {
        dateLabel = dueDate;
      }
    }

    let timeLabel = dueTime || '';
    if (dueTime && dueTime.includes(':') && !dueTime.includes('م') && !dueTime.includes('ص')) {
      const [hStr, mStr] = dueTime.split(':');
      const h = parseInt(hStr, 10);
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'م' : 'ص';
        const formattedH = h % 12 === 0 ? 12 : h % 12;
        timeLabel = `${formattedH}:${mStr} ${ampm}`;
      }
    }

    return [dateLabel, timeLabel].filter(Boolean).join(' - ');
  };

  const getDueStatus = (dueDate?: string, dueTime?: string): { status: 'overdue' | 'soon' | 'future' | 'none'; diffMinutes: number; text: string } => {
    if (!dueTime && !dueDate) return { status: 'none', diffMinutes: 0, text: '' };
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = dueDate || todayStr;
    
    let targetHours = 0;
    let targetMins = 0;
    if (dueTime) {
      if (dueTime.includes(':')) {
        const parts = dueTime.split(':');
        targetHours = parseInt(parts[0], 10);
        targetMins = parseInt(parts[1], 10) || 0;
      }
    }

    const targetDate = new Date(`${targetDateStr}T${String(targetHours).padStart(2, '0')}:${String(targetMins).padStart(2, '0')}:00`);
    if (isNaN(targetDate.getTime())) {
      return { status: 'future', diffMinutes: 0, text: formatDueDateTime(dueDate, dueTime) || '' };
    }

    const diffMs = targetDate.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes < 0) {
      const overdueMins = Math.abs(diffMinutes);
      const text = overdueMins > 60 
        ? `متأخر أكثر من ساعة (${Math.floor(overdueMins / 60)}س)`
        : `متأخر بـ ${overdueMins} دقيقة`;
      return { status: 'overdue', diffMinutes, text };
    } else if (diffMinutes <= 15) {
      return { status: 'soon', diffMinutes, text: diffMinutes === 0 ? 'مستحق الآن!' : `متبقي ${diffMinutes} دقيقة` };
    } else if (diffMinutes <= 60) {
      return { status: 'soon', diffMinutes, text: `متبقي ${diffMinutes} دقيقة` };
    } else {
      return { status: 'future', diffMinutes, text: formatDueDateTime(dueDate, dueTime) || '' };
    }
  };

  const overdueParkedOrdersCount = parkedOrders.filter(o => {
    const st = getDueStatus(o.dueDate, o.dueTime);
    return st.status === 'overdue';
  }).length;

  const handleOpenParkModal = () => {
    if (cart.length === 0) {
      triggerPrintNotification('السلة فارغة! برجاء إضافة أصناف قبل تعليق الطلب.');
      return;
    }
    const nextNum = parkedOrders.length + 1;
    setParkOrderLabel(`طلب معلق #${nextNum}`);
    setParkOrderCustomer('');
    setParkOrderNote('');
    setParkOrderDueDate(new Date().toISOString().split('T')[0]);
    setParkOrderDueTime('');
    setIsParkModalOpen(true);
  };

  const handleQuickParkOrder = (customLabel?: string) => {
    if (cart.length === 0) {
      triggerPrintNotification('السلة فارغة! برجاء إضافة أصناف قبل تعليق الطلب.');
      return;
    }
    const nextNum = parkedOrders.length + 1;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const finalLabel = customLabel || `طلب معلق #${nextNum}`;
    const newParked: ParkedOrder = {
      id: `parked-${Date.now()}`,
      orderNumber: nextNum,
      label: finalLabel,
      customerName: selectedCustomer ? selectedCustomer.name : GENERAL_CUSTOMER,
      customerId: selectedCustomer?.id,
      items: [...cart],
      discountType,
      discountValue: cleanDiscountVal,
      discountScope,
      rawSubtotal,
      discountAmount,
      discountedSubtotal,
      tax: calculatedTax,
      total: calculatedTotal,
      createdAt: timeStr,
      note: invoiceNote.trim() || undefined,
      ...(autoActivity && cleanVehicle(vehicle) ? { vehicle: cleanVehicle(vehicle) } : {}),
    };

    setParkedOrders(prev => [newParked, ...prev]);
    setCart([]);
    setDiscountValue(0);
    setDiscountScope('total');
    setIsParkModalOpen(false);
    setInvoiceNote('');
    setVehicle({});
    setDeliveryOn(false); setDeliveryAmt('');
    setSelectedCustomerId(null);
    triggerPrintNotification(`تم تعليق (${finalLabel}) بنجاح.`);
  };

  const handleConfirmParkOrder = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (cart.length === 0) {
      setIsParkModalOpen(false);
      triggerPrintNotification('السلة فارغة! تم إغلاق النافذة.');
      return;
    }

    const nextNum = parkedOrders.length + 1;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' });
    const finalLabel = (parkOrderLabel && parkOrderLabel.trim()) ? parkOrderLabel.trim() : `طلب معلق #${nextNum}`;
    const newParked: ParkedOrder = {
      id: `parked-${Date.now()}`,
      orderNumber: nextNum,
      label: finalLabel,
      customerName: (parkOrderCustomer && parkOrderCustomer.trim()) ? parkOrderCustomer.trim() : (selectedCustomer ? selectedCustomer.name : GENERAL_CUSTOMER),
      customerId: (parkOrderCustomer && parkOrderCustomer.trim()) ? undefined : selectedCustomer?.id,
      items: [...cart],
      discountType,
      discountValue: cleanDiscountVal,
      discountScope,
      rawSubtotal,
      discountAmount,
      discountedSubtotal,
      tax: calculatedTax,
      total: calculatedTotal,
      createdAt: timeStr,
      dueTime: (parkOrderDueTime && parkOrderDueTime.trim()) ? parkOrderDueTime.trim() : undefined,
      dueDate: (parkOrderDueDate && parkOrderDueDate.trim()) ? parkOrderDueDate.trim() : undefined,
      note: (parkOrderNote && parkOrderNote.trim()) ? parkOrderNote.trim() : (invoiceNote.trim() || undefined)
    };

    setParkedOrders(prev => [newParked, ...prev]);
    setCart([]);
    setDiscountValue(0);
    setDiscountScope('total');
    setIsParkModalOpen(false);
    setInvoiceNote('');
    setVehicle({});
    setDeliveryOn(false); setDeliveryAmt('');
    setSelectedCustomerId(null);
    triggerPrintNotification(`تم حفظ وتعليق (${finalLabel}) بنجاح.`);
  };

  const handleRequestRestore = (order: ParkedOrder) => {
    if (cart.length > 0) {
      setOrderToRestore(order);
    } else {
      executeRestore(order, 'replace');
    }
  };

  const executeRestore = (order: ParkedOrder, mode: 'replace' | 'merge') => {
    const dl = order.items.find(i => i.isDeliveryFee);
    if (dl) { setDeliveryOn(true); setDeliveryAmt(String(toShownPrice(dl.price))); }
    else if (mode === 'replace') { setDeliveryOn(false); setDeliveryAmt(''); }
    if (mode === 'replace') {
      setCart([...order.items]);
      setDiscountType(order.discountType);
      setDiscountValue(order.discountValue);
      setDiscountScope(order.discountScope || 'total');
    } else {
      setCart(prev => {
        let merged = [...prev];
        order.items.forEach(newItem => {
          const idx = merged.findIndex(i => i.cartItemId === newItem.cartItemId);
          if (idx >= 0) {
            const existing = merged[idx];
            const updatedQty = existing.qty + newItem.qty;
            merged[idx] = { ...existing, qty: updatedQty, ...lineAmounts(existing.price, updatedQty) };
          } else {
            merged.push({ ...newItem });
          }
        });
        return merged;
      });
      if (order.discountValue > 0) {
        setDiscountType(order.discountType);
        setDiscountValue(order.discountValue);
        setDiscountScope(order.discountScope || 'total');
      }
    }

    if (mode === 'replace') setVehicle(order.vehicle || {});
    else if (order.vehicle && !hasVehicle(vehicle)) setVehicle(order.vehicle);
    if (mode === 'replace') setInvoiceNote(order.note || '');
    else if (order.note && !invoiceNote.trim()) setInvoiceNote(order.note);
    if (mode === 'replace') setSelectedCustomerId(order.customerId ?? null);
    else if (order.customerId && !selectedCustomerId) setSelectedCustomerId(order.customerId);

    setParkedOrders(prev => prev.filter(p => p.id !== order.id));
    setOrderToRestore(null);
    setPreviewParkedOrder(null);
    setIsParkedOrdersModalOpen(false);
    triggerPrintNotification(`تم استرجاع (${order.label}) إلى سلة المبيعات بنجاح.`);
  };

  const handleDeleteParkedOrder = (id: string) => {
    setParkedOrders(prev => prev.filter(p => p.id !== id));
    if (previewParkedOrder?.id === id) setPreviewParkedOrder(null);
    triggerPrintNotification('تم حذف الطلب المعلق بنجاح');
  };

  /** تطبيق خصم الفاتورة من المربع السريع: يتحقق من القواعد ثم يغلق المربع */
  const applyInvoiceDiscount = () => {
    if (cleanDiscountVal > 0 && discountError) { triggerPrintNotification(`⛔ ${discountError}`, 4000); return; }
    setIsDiscountDrawerOpen(false);
    if (cleanDiscountVal > 0) triggerPrintNotification(`✓ تم تطبيق خصم ${totalSavings.toFixed(2)} ﷼ — المستحق ${calculatedTotal.toFixed(2)} ﷼`, 3000);
  };
  const cartTotal = calculatedTotal;

  // ==========================================
  // 🧰 أجهزة نقطة البيع
  // ==========================================
  const devicesApi = typeof window !== 'undefined' ? window.ledger?.devices : undefined;

  /** فتح درج النقود عبر طابعة الإيصالات (نبضة ESC/POS) */
  const openCashDrawer = async (auto = false) => {
    if (!deviceSettings.drawerEnabled) { if (!auto) triggerPrintNotification('فعّل درج النقود من شاشة الطابعات والأجهزة'); return; }
    if (!devicesApi) { if (!auto) triggerPrintNotification('فتح الدرج متاح في النسخة المكتبية فقط'); return; }
    const res = await devicesApi.openDrawer({ printer: deviceSettings.drawerPrinter || resolveReceiptPrinter('thermal80') || printSettings.receiptPrinter || undefined, pin: deviceSettings.drawerPin });
    if (!res.ok) triggerPrintNotification(`تعذر فتح الدرج${res.reason ? ': ' + res.reason : ''}`, 4500);
    else if (!auto) triggerPrintNotification('🗃️ تم فتح الدرج');
  };

  // تنبيه الصلاحية عند تسجيل الدخول (مرة لكل دخول)
  useEffect(() => {
    if (!currentUserId) return;
    let expired = 0, soon = 0;
    for (const p of products) {
      if (p.disabled || (p.stock || 0) <= 0) continue;
      const st = expiryState(p.expiryDate, expirySettings.warnDays);
      if (st === 'expired') expired++; else if (st === 'soon') soon++;
    }
    if (!expired && !soon) return;
    const t = setTimeout(() => triggerPrintNotification(`📅 الصلاحية: ${expired ? `${expired} صنف منتهي` : ''}${expired && soon ? ' و' : ''}${soon ? `${soon} صنف يقترب من الانتهاء` : ''} — راجع تبويب الصلاحية في المخزون`, 7000), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // قراءة الميزان المتصل مباشرة
  useEffect(() => {
    if (!devicesApi || !scaleSettings.serialEnabled) { setLiveWeight(null); setScaleStatus({ connected: false }); return; }
    const offData = devicesApi.onScaleData((line) => { const r = parseScaleLine(line); if (r) setLiveWeight(Math.max(0, r.kg)); });
    const offStatus = devicesApi.onScaleStatus((st) => { setScaleStatus(st); if (!st.connected) setLiveWeight(null); });
    void devicesApi.scaleStart({ port: scaleSettings.port, baud: scaleSettings.baud, dataBits: scaleSettings.dataBits, parity: scaleSettings.parity, command: scaleSettings.command === 'none' ? '' : scaleSettings.command, intervalMs: scaleSettings.intervalMs })
      .then((r) => { if (!r.ok) setScaleStatus({ connected: false, reason: r.reason }); });
    return () => { offData(); offStatus(); void devicesApi.scaleStop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleSettings.serialEnabled, scaleSettings.port, scaleSettings.baud, scaleSettings.dataBits, scaleSettings.parity, scaleSettings.command, scaleSettings.intervalMs]);

  /* ---------------- شاشة العميل التسلسلية (VFD سطران) ---------------- */
  const vfdCfg = useMemo(() => ({ ...DEFAULT_VFD_SETTINGS, ...(deviceSettings.vfd || {}) }), [deviceSettings.vfd]);
  const [vfdStatus, setVfdStatus] = useState<{ connected: boolean; reason?: string }>({ connected: false });
  useEffect(() => {
    if (!devicesApi || !devicesApi.vfdStart) return;
    if (!vfdCfg.enabled) { setVfdStatus({ connected: false }); void devicesApi.vfdStop?.(); return; }
    const off = devicesApi.onVfdStatus?.((st) => setVfdStatus(st)) || (() => {});
    void devicesApi.vfdStart({ port: vfdCfg.port, baud: vfdCfg.baud, dataBits: vfdCfg.dataBits, parity: vfdCfg.parity })
      .then((r) => { if (!r.ok) setVfdStatus({ connected: false, reason: r.reason }); });
    return () => { off(); void devicesApi.vfdStop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfdCfg.enabled, vfdCfg.port, vfdCfg.baud, vfdCfg.dataBits, vfdCfg.parity]);

  // ما يُكتب على الشاشة: آخر صنف وسعره في الأعلى، والإجمالي أو الباقي في الأسفل
  useEffect(() => {
    if (!devicesApi?.vfdWrite || !vfdCfg.enabled || !vfdStatus.connected) return;
    const last = cart.length ? cart[cart.length - 1] : null;
    const t = setTimeout(() => {
      const [l1, l2] = vfdLines({
        lastItem: last ? { name: englishNameOf({ productId: last.id, name: last.name }) || last.name, total: last.total } : null,
        total: calculatedTotal,
        count: cart.length,
        paid: displayPaid && cart.length === 0 ? { total: displayPaid.total, paid: displayPaid.paid, change: displayPaid.change } : null,
      }, vfdCfg);
      void devicesApi.vfdWrite(vfdFrame(l1, l2, vfdCfg));
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, calculatedTotal, displayPaid, vfdCfg, vfdStatus.connected]);

  // شاشة العميل: فتح/إغلاق حسب الإعداد
  const displayFontRef = useRef<string>('');
  useEffect(() => {
    if (!devicesApi) return;
    if (deviceSettings.customerDisplay && currentUser) void devicesApi.displayOpen();
    else void devicesApi.displayClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSettings.customerDisplay, !!currentUser]);
  useEffect(() => { void appFontCss().then((c) => { displayFontRef.current = c; }); }, []);

  // مزامنة السلة مع شاشة العميل
  useEffect(() => {
    if (!devicesApi || !deviceSettings.customerDisplay) return;
    const shownUnit = (net: number) => (pricesIncludeTax ? net * (1 + taxRate) : net);
    const t = setTimeout(() => devicesApi.displayUpdate({
      fontCss: displayFontRef.current,
      company: companySettings.companyName,
      logo: companySettings.logoUrl || '',
      message: deviceSettings.displayMessage,
      currency: 'ر.س',
      mode: displayPaid && cart.length === 0 ? 'paid' : 'cart',
      items: cart.map((i) => ({ name: i.name, qty: i.qty, price: shownUnit(i.price), total: i.total })),
      count: cart.reduce((n, i) => n + (Number.isInteger(i.qty) ? i.qty : 1), 0),
      subtotal: discountedSubtotal,
      discount: totalSavings,
      vat: calculatedTax,
      total: calculatedTotal,
      paidTotal: displayPaid?.total ?? 0,
      paid: displayPaid?.paid ?? 0,
      change: displayPaid?.change ?? 0,
    }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, calculatedTotal, displayPaid, deviceSettings.customerDisplay, deviceSettings.displayMessage, companySettings.companyName, companySettings.logoUrl]);
  // شاشة الشكر تعود للترحيب بعد 20 ثانية
  useEffect(() => { if (!displayPaid) return; const t = setTimeout(() => setDisplayPaid(null), 20000); return () => clearTimeout(t); }, [displayPaid]);
  // ⚡ كل الحسابات على قائمة الأصناف محفوظة بـ useMemo: لا تُعاد عند كل نقرة على السلة
  const allProducts = products;
  const { lowStockProductsCount, outOfStockProductsCount, groupCounts } = useMemo(() => {
    // الأصناف الموقوفة لا تظهر في شاشة البيع ولا تُحسب في المجموعات
    const products = allProducts.filter(p => !p.disabled);
    let low = 0, out = 0;
    const byGroupId = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const p of products) {
      const stock = p.stock ?? 0;
      const min = p.minStock !== undefined ? p.minStock : 10;
      if (stock <= 0) out++;
      else if (stock <= min) low++;
      if (p.groupId) byGroupId.set(p.groupId, (byGroupId.get(p.groupId) || 0) + 1);
      if (p.categoryAr) byCategory.set(p.categoryAr, (byCategory.get(p.categoryAr) || 0) + 1);
    }
    // عدد أصناف كل مجموعة (نفس منطق العدّ السابق: groupId أو اسم التصنيف)
    const counts = new Map<string, number>();
    for (const g of productGroups) {
      let c = 0;
      for (const p of products) if (p.groupId === g.id || p.categoryAr === g.nameAr) c++;
      counts.set(g.id, c);
    }
    // أصناف لا تنتمي لأي مجموعة موجودة → تظهر في بطاقة «أصناف أخرى»
    const gIds = new Set(productGroups.map(g => g.id));
    const gNames = new Set(productGroups.map(g => g.nameAr));
    let ungrouped = 0;
    for (const p of products) if (!(p.groupId && gIds.has(p.groupId)) && !gNames.has(p.categoryAr)) ungrouped++;
    return { lowStockProductsCount: low, outOfStockProductsCount: out, groupCounts: counts, ungroupedCount: ungrouped };
  }, [allProducts, productGroups]);

  // فهرس الباركود: بحث فوري O(1) بدل المرور على ١٨ ألف صنف مع كل مسح
  // الأصناف ذات المخزون (بدون الخدمات) — لشاشة المخزون والجرد
  const stockProducts = useMemo(() => products.filter(p => !p.isService), [products]);
  const barcodeIndex = useMemo(() => {
    const m = new Map<string, { product: ExtendedProduct; unit?: ProductUnit }>();
    for (const p of products) {
      if (p.units) for (const u of p.units) { const b = (u.barcode || '').trim(); if (b && !m.has(b)) m.set(b, { product: p, unit: u }); }
    }
    for (const p of products) for (const b0 of p.barcodes || []) { const b = (b0 || '').trim(); if (b && !m.has(b)) m.set(b, { product: p }); } // الباركودات الإضافية
    for (const p of products) { const b = (p.barcode || '').trim(); if (b) m.set(b, { product: p }); } // باركود الصنف الأساسي له الأولوية
    return m;
  }, [products]);

  // ==========================================
  // 🔒 منع حذف الأصناف التي عليها حركة (مبيعات، مشتريات، عروض أسعار، طلبات معلقة، مكوّن في باقة)
  // ==========================================
  const productMovementIndex = useMemo(() => {
    const soldIds = new Set<string>();
    const soldNames = new Set<string>(); // للفواتير القديمة التي لم يُحفظ فيها معرّف الصنف
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        if (it.productId) { soldIds.add(String(it.productId)); continue; }
        const name = (it.name || '').trim();
        if (!name) continue;
        // اسم السطر قد يكون "اسم الصنف - التعبئة": نسجّل كل البادئات عند " - "
        const parts = name.split(' - ');
        for (let k = 1; k <= parts.length; k++) soldNames.add(parts.slice(0, k).join(' - '));
      }
    }
    const purchasedIds = new Set<string>();
    for (const pu of purchases) for (const it of pu.items || []) if (it.productId) purchasedIds.add(String(it.productId));
    for (const pr of purchaseReturns) for (const it of pr.items || []) if (it.productId) purchasedIds.add(String(it.productId));
    const quotedIds = new Set<string>();
    for (const q of quotations) for (const it of q.items || []) if (it.productId) quotedIds.add(String(it.productId));
    const parkedIds = new Set<string>();
    for (const o of parkedOrders) for (const it of o.items || []) parkedIds.add(String(it.id));
    const inBundles = new Map<string, string>();
    for (const b of products) if (b.isBundle) for (const bi of b.bundleItems || []) if (!inBundles.has(bi.productId)) inBundles.set(bi.productId, b.nameAr);
    return { soldIds, soldNames, purchasedIds, quotedIds, parkedIds, inBundles };
  }, [invoices, purchases, purchaseReturns, quotations, parkedOrders, products]);

  /** يُرجع سبب منع الحذف، أو null إن كان الحذف مسموحاً */
  const getProductDeleteBlockReason = (id: string): string | null => {
    const prod = products.find(p => p.id === id);
    if (!prod) return null;
    const ix = productMovementIndex;
    const reasons: string[] = [];
    if (ix.soldIds.has(id) || ix.soldNames.has((prod.nameAr || '').trim())) reasons.push('مبيعات في فواتير');
    if (ix.purchasedIds.has(id)) reasons.push('فواتير مشتريات');
    if (ix.quotedIds.has(id)) reasons.push('عروض أسعار');
    if (ix.parkedIds.has(id)) reasons.push('طلبات معلقة');
    if (cart.some(it => it.id === id)) reasons.push('السلة الحالية');
    const bundle = ix.inBundles.get(id);
    if (bundle) reasons.push(`مكوّن في باقة «${bundle}»`);
    if (reasons.length === 0) return null;
    return `لا يمكن حذف الصنف «${prod.nameAr}» لأن عليه حركة: ${reasons.join('، ')}.\n\nيمكنك تعديل بياناته أو تصفير مخزونه بدلاً من حذفه.`;
  };

  const handleDeleteProducts = (ids: string[]) => {
    const ok = ids.filter(id => !getProductDeleteBlockReason(id));
    if (!ok.length) return;
    guard('products.delete', () => {
      const set = new Set(ok);
      setProducts(prev => prev.filter(p => !set.has(p.id)));
      triggerPrintNotification(`تم حذف ${ok.length} صنف`);
    });
  };
  const handleDeleteProduct = (id: string) => {
    const reason = getProductDeleteBlockReason(id);
    if (reason) { triggerPrintNotification(reason.split('\n')[0]); return; }
    guard('products.delete', () => setProducts(prev => prev.filter(p => p.id !== id)));
  };

  const { groupColorById, groupColorByName } = useMemo(() => ({
    groupColorById: new Map(productGroups.filter(g => g.color).map(g => [g.id, g.color!])),
    groupColorByName: new Map(productGroups.filter(g => g.color).map(g => [g.nameAr, g.color!])),
  }), [productGroups]);

  // البحث المؤجَّل: الكتابة في حقل البحث تبقى سلسة حتى مع آلاف الأصناف
  const deferredPosSearch = useDeferredValue(posProductSearch);
  // وضع القائمة المنسدلة: البحث لا يصفّي الشبكة (النتائج تظهر أسفل الخانة)
  const gridSearch = searchDropdown ? '' : deferredPosSearch;
  const filteredProducts = useMemo(() => {
    const q = gridSearch.trim().toLowerCase();
    const groupNameById = new Map(productGroups.map(g => [g.id, g.nameAr]));
    const groupNames = new Set(productGroups.map(g => g.nameAr));
    return products.filter(p => {
      if (p.disabled) return false; // صنف موقوف
      const minStock = p.minStock !== undefined ? p.minStock : 10;
      const matchesCategory = activeCategory === 'الكل' ||
                              (activeCategory === UNGROUPED
                                ? !(p.groupId && groupNameById.has(p.groupId)) && !groupNames.has(p.categoryAr)
                                : p.categoryAr === activeCategory || (p.groupId && groupNameById.get(p.groupId) === activeCategory));
      if (!matchesCategory) return false;
      const matchesSearch = !q ||
        (p.nameAr || '').toLowerCase().includes(q) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
        (p.barcode || '').includes(q) ||
        (p.barcodes || []).some(b => b.includes(q));
      if (!matchesSearch) return false;

      if (posStockFilter === 'low') {
        return (p.stock ?? 0) > 0 && (p.stock ?? 0) <= minStock;
      }
      if (posStockFilter === 'out') {
        return (p.stock ?? 0) <= 0;
      }
      return true;
    });
  }, [products, productGroups, activeCategory, gridSearch, posStockFilter]);

  // نتائج البحث بالقائمة المنسدلة (الاسم أو الباركود — مع تصحيح لوحة المفاتيح العربية)
  const posSearchMatches = useMemo(() => {
    if (!searchDropdown) return [] as ExtendedProduct[];
    const raw = deferredPosSearch.trim();
    if (!raw) return [] as ExtendedProduct[];
    const q = raw.toLowerCase();
    const codes = scanCandidates(raw);
    const exact: ExtendedProduct[] = [], rest: ExtendedProduct[] = [];
    for (const p of products) {
      if (p.disabled) continue;
      const isExact = codes.some(c => p.barcode === c || (p.barcodes || []).includes(c) || (p.units || []).some(u => u.barcode === c));
      const hit = isExact || (p.nameAr || '').toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q) || codes.some(c => (p.barcode || '').includes(c));
      if (!hit) continue;
      (isExact ? exact : rest).push(p);
      if (exact.length + rest.length >= 40) break;
    }
    return [...exact, ...rest].slice(0, 12);
  }, [searchDropdown, deferredPosSearch, products]);
  useEffect(() => { setPosSearchHi(0); }, [deferredPosSearch]);

  // شاشة البيع: بطاقات المجموعات أولاً (المجموعات الفارغة مخفية)، والضغط على مجموعة يعرض أصنافها — والكل صفحات
  const posVisibleGroups = useMemo(() => {
    const list = productGroups.filter(g => (groupCounts.get(g.id) || 0) > 0)
      .map(g => ({ key: g.nameAr, name: g.nameAr, color: g.color || '#2f8f87', count: groupCounts.get(g.id) || 0 }));
    return list;
  }, [productGroups, groupCounts]);
  // الشاشة الرئيسية: بطاقات المجموعات + بطاقات الأصناف التي بلا مجموعة مباشرة (بدون بطاقة «أصناف أخرى»)
  const posUngrouped = useMemo(() => {
    const ids = new Set(productGroups.map(g => g.id));
    const names = new Set(productGroups.map(g => g.nameAr));
    return products.filter(p => !p.disabled && !(p.groupId && ids.has(p.groupId)) && !names.has(p.categoryAr));
  }, [products, productGroups]);
  const posShowGroups = activeCategory === 'الكل' && !gridSearch.trim() && posStockFilter === 'all' && posVisibleGroups.length > 0;
  type PosTile = { kind: 'group'; g: (typeof posVisibleGroups)[number] } | { kind: 'product'; p: ExtendedProduct };
  const posTopTiles = useMemo<PosTile[]>(() => [
    ...posVisibleGroups.map(g => ({ kind: 'group' as const, g })),
    ...posUngrouped.map(p => ({ kind: 'product' as const, p })),
  ], [posVisibleGroups, posUngrouped]);
  const posTopPager = usePagedList(posTopTiles, 30, 'top');
  const posGrid = usePagedList(filteredProducts, 30, `${activeCategory}|${gridSearch}|${posStockFilter}`);

  const posProductCard = (product: ExtendedProduct) => {
                  // لون المجموعة يظهر كشريط علوي (معلومة مفيدة) بدل ألوان عشوائية لكل بطاقة
                  const groupColor = (product.groupId && groupColorById.get(product.groupId)) || groupColorByName.get(product.categoryAr) || '#4caba1';
                  const hasOptions = (product.variants && product.variants.length > 0) || (product.units && product.units.length > 0);
                  const minStock = product.minStock !== undefined ? product.minStock : 10;
                  const isOutOfStock = showStockAlerts && !product.isService && (product.stock ?? 0) <= 0;
                  const isLowStock = showStockAlerts && !product.isService && !isOutOfStock && (product.stock ?? 0) <= minStock;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`price-tag group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 text-right flex flex-col cursor-pointer active:scale-[0.97] transition ${
                        isOutOfStock ? 'border-2 border-rose-400' : isLowStock ? 'border-2 border-amber-400' : 'border border-slate-200 dark:border-slate-700'
                      }`}
                      title={
                        isOutOfStock
                          ? `نفد المخزون (الحد الأدنى للتنبيه: ${minStock})`
                          : isLowStock
                          ? `مخزون منخفض: متبقي ${product.stock}`
                          : `${product.nameAr}${product.isService ? '' : ` — المخزون: ${product.stock}`}`
                      }
                    >
                      {/* شريط لون المجموعة على حافة البطاقة — يربط الصنف بمجموعته بنظرة */}
                      <span aria-hidden className="absolute inset-y-0 right-0 w-1.5 z-10" style={{ backgroundColor: groupColor }} />
                      {product.image ? (
                        <span className="block h-[52%] bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
                          <img src={product.image} alt={product.nameAr} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" loading="lazy" draggable={false} />
                        </span>
                      ) : null}
                      <span className="flex-1 flex flex-col justify-between gap-1 pr-3 pl-2 py-2 min-h-0">
                        <span className="flex items-start justify-between gap-1">
                          <span className={`font-bold text-slate-900 dark:text-white leading-snug ${product.image ? 'text-[11.5px] line-clamp-1' : 'text-[13px] line-clamp-2'}`}>{product.nameAr}</span>
                          {product.isBundle ? (
                            <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">كومبو</span>
                          ) : hasOptions ? (
                            <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{product.units?.length || product.variants?.length} خيارات</span>
                          ) : null}
                        </span>
                        <span className="flex items-end justify-between gap-1">
                          <span className="price-tag-amount font-mono font-black text-[17px] leading-none inline-flex items-baseline gap-0.5">
                            {product.units?.length && product.sellBaseUnit === false ? <span className="text-[10px] font-bold font-sans text-slate-500 ml-0.5">من</span> : null}
                            {product.price.toFixed(2)}
                            <SaudiRiyalSymbol className="w-3 h-3 self-center opacity-70" />
                          </span>
                          <span className={`text-[10px] font-bold leading-none whitespace-nowrap ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-400'}`} title="الكمية المتوفرة">
                            {product.isService ? 'خدمة' : isOutOfStock ? 'نافد' : `${product.stock} ق`}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
  };

  const renderPOS = () => (
    <div className="pos-shelf flex flex-col h-screen w-full select-none font-sans overflow-hidden transition-colors" dir={uiDir}>
      <LicenseBanner status={license.status} onOpen={() => setCurrentView('license')} />
      {zatcaActive && <ZatcaUnsentBanner onOpen={() => (canView(currentUser, 'einvoice') ? setCurrentView('einvoice') : triggerPrintNotification('اطلب من المدير مراجعة شاشة الفاتورة الإلكترونية'))} />}
      {printNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10050] bg-slate-800 text-white px-6 py-3 rounded-2xl max-w-[90vw] shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <Printer className="w-5 h-5 text-cyan-400 shrink-0" /> <span className="font-bold">{printNotification}</span>
        </div>
      )}
      {/* الشريط العلوي بنفس تقسيم الشاشة: فوق السلة أدوات السلة ونوع الطلب — وفوق الأصناف بقية الأزرار */}
      <div className={`pos-topbar text-white h-16 flex items-stretch shadow-md z-10 ${isLayoutReversed ? 'flex-row-reverse' : 'flex-row'}`} data-testid="pos-topbar">
        {/* زر القائمة على حافة الشاشة في نفس جهة القائمة الجانبية (يمين/يسار حسب الإعداد) */}
        <div className="shrink-0 flex items-center px-2" style={{ order: sideIsLeft === ((uiDir === 'ltr') !== isLayoutReversed) ? -1 : 99 }} data-testid="pos-menu-wrap">
          <button type="button" onClick={() => setIsPosMenuOpen(true)} className="pos-pill !px-2" title="القائمة"><Menu className="w-5 h-5" /></button>
        </div>
        {/* فوق السلة مباشرة */}
        {/* فوق السلة: من الحافة الخارجية — المطبخ، التعليق، المعلقة، التفريغ، نوع الطلب، ثم عداد السلة (يمتد قليلاً فوق الأصناف عند الحاجة) */}
        <div className={`min-w-[clamp(22rem,42%,34rem)] shrink-0 flex items-center justify-end gap-2 touch-gap px-2.5 ${isLayoutReversed ? 'flex-row' : 'flex-row-reverse'}`} data-testid="cart-bar">
          <div className="pos-pill" title={`${cart.length} أصناف · ${cart.reduce((s, i) => s + i.qty, 0)} قطع`} data-testid="cart-count">
            <ShoppingBag className="w-5 h-5 text-emerald-300" />
            <span>السلة</span>
            <span className="pos-pill-badge !bg-white/90">{cart.length} · {cart.reduce((s, i) => s + i.qty, 0)}</span>
            {/* المطعم على الشاشات الأصغر: رقم الطلب بجانب العدد */}
            {businessType === 'restaurant' && restOpts.orderNumbers && (
              <span className="pos-pill-badge" title="رقم الطلب التالي" data-testid="next-order-inline">#{(Number(orderCounter) || 0) + 1}</span>
            )}
          </div>
          {posKeyboard && (
            <button type="button" onClick={() => setOskOpen(!oskOpen)} data-testid="pos-osk-toggle" aria-pressed={oskOpen} title="لوحة المفاتيح على الشاشة"
              className={`pos-pill shrink-0 cursor-pointer ${oskOpen ? '!bg-white !text-slate-900' : ''}`}>
              <Keyboard className={`w-5 h-5 ${oskOpen ? 'text-emerald-700' : 'text-emerald-300'}`} />
            </button>
          )}
          {businessType === 'restaurant' && restOpts.orderTypes && (
            <div className="pos-pill !p-0.5 !gap-0.5 shrink-0" data-testid="order-type">
              {([['dine_in', '🍽️ محلي'], ['takeaway', '🥡 سفري'], ['delivery', '🛵 توصيل']] as const).map(([v, t]) => (
                <button key={v} type="button" onClick={() => setOrderType(v)} data-type={v}
                  className={`h-full px-3.5 rounded-full text-xs font-black transition ${orderType === v ? 'bg-white text-slate-900 shadow' : 'text-white/85 hover:bg-white/10'}`}>{t.split(' ').slice(1).join(' ')}</button>
              ))}
            </div>
          )}
          {/* تفريغ السلة (بتأكيد) */}
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => guard('pos.voidItem', () => {
              const ok = window.confirm(`تفريغ السلة؟ سيُحذف ${cart.length} صنف من الفاتورة الحالية.`);
              window.ledger?.app.refocus?.();
              if (!ok) return;
              setCart([]); setInvoiceNote(''); setVehicle({}); setDeliveryOn(false); setDeliveryAmt(''); setSelectedCustomerId(null); setDiscountValue(0); resetSplit();
            })}
            className="pos-pill !border-rose-400/80 text-rose-200"
            title="تفريغ السلة بالكامل"
            data-testid="cart-clear"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setIsParkedOrdersModalOpen(true)} className="pos-pill" title={overdueParkedOrdersCount > 0 ? `الطلبات المعلقة — ${overdueParkedOrdersCount} متأخر عن موعده` : 'الطلبات المعلقة'} data-testid="parked-list">
            <Clock className={`w-5 h-5 ${overdueParkedOrdersCount > 0 ? 'text-rose-300 animate-pulse' : 'text-amber-300'}`} />
            {businessType !== 'restaurant' && <span>المعلقة</span>}
            {parkedOrders.length > 0 && <span className="pos-pill-badge">{parkedOrders.length}</span>}
            {overdueParkedOrdersCount > 0 && <span className="pos-pill-badge !bg-rose-500 !text-white">{overdueParkedOrdersCount}!</span>}
          </button>
          {/* التعليق: زر واحد تفاعلي — قائمة صغيرة: تعليق فوري / مع اسم وملاحظة */}
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setParkMenu(parkMenu ? null : { top: r.bottom + 6, left: r.left, width: r.width }); }}
            className={`pos-pill ${cart.length > 0 ? '!border-amber-300 pos-pill-glow' : ''} ${parkMenu ? '!bg-amber-400/30' : ''}`}
            title="تعليق الفاتورة الحالية"
            data-testid="park-btn"
          >
            <PauseCircle className="w-5 h-5 text-amber-300" />{businessType !== 'restaurant' && <span>تعليق</span>}<ChevronDown className={`w-3.5 h-3.5 transition ${parkMenu ? 'rotate-180' : ''}`} />
          </button>
          {businessType === 'restaurant' && (
            <button type="button" onClick={() => void sendCartToKitchen()} data-testid="send-kitchen" className="pos-pill" title={`إرسال الفاتورة إلى ${printSettings.kitchenMain?.name?.trim() || 'طابعة المطبخ'}`}>
              <ChefHat className="w-5 h-5 text-emerald-300" />
            </button>
          )}
        </div>

        {/* فوق الأصناف: بقية الأدوات كالمعتاد */}
        <div className={`flex-1 min-w-0 flex items-center gap-2 touch-gap px-2.5 border-white/10 ${isLayoutReversed ? 'flex-row border-e' : 'flex-row-reverse border-s'}`}>
          <div className="pos-pill pos-pill-brand" title={businessType === 'restaurant' ? 'كاشير المطعم' : 'كاشير التجزئة'}>
            <img src={brandIcon} alt="" className="w-6 h-6 rounded-full object-contain bg-white/15" />
            <span className="hidden xl:inline">{businessType === 'restaurant' ? 'كاشير المطعم' : 'كاشير التجزئة'}</span>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {deviceSettings.drawerEnabled && (
            <button type="button" data-testid="open-drawer" onClick={() => void openCashDrawer()} title="فتح درج النقود" className="pos-pill shrink-0">
              <Inbox className="w-5 h-5 text-amber-300" /><span className="hidden 2xl:inline">فتح الدرج</span>
            </button>
          )}
          {/* البحث عن فاتورة (رقم / عميل / جوال) — تفتح نافذتها هنا مع المرتجع وإعادة الطباعة */}
          {canView(currentUser, 'invoices') && <div className="shrink-0"><PosInvoiceSearch invoices={invoices} onOpen={openPosDoc} /></div>}
          {scaleSettings.serialEnabled && (
            <div data-testid="pos-weight" title={scaleStatus.connected ? 'الميزان متصل' : `الميزان غير متصل${scaleStatus.reason ? ' — ' + scaleStatus.reason : ''}`}
              className={`pos-pill shrink-0 ${scaleStatus.connected ? '' : '!border-rose-400 text-rose-200'}`}>
              <Scale className="w-5 h-5" /><span className="font-mono text-sm" dir="ltr">{liveWeight != null ? liveWeight.toFixed(3) : '-.---'} kg</span>
            </div>
          )}
          </div>
        {businessType === 'retail' && (
          <div className="shrink-0 w-44 lg:w-56 relative" data-testid="pos-barcode-wrap">
            <input ref={barcodeInputRef} type="text" placeholder="📷 امسح الباركود" onKeyDown={handleBarcodeScan} className="w-full h-10 pos-gold-input px-3 pl-8 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:font-sans placeholder:font-bold placeholder:text-xs pos-barcode" autoFocus />
            <div className="absolute left-2.5 top-2 text-amber-300 animate-pulse"><FileDigit className="w-5 h-5" /></div>
          </div>
        )}
        </div>
      </div>
      {posKeyboard && oskOpen && (
        <div className={`fixed ${groceryList ? `bottom-3 ${groceryKbdLeft ? 'left-3' : 'right-3'}` : `top-[4.5rem] ${isLayoutReversed ? 'left-2' : 'right-2'}`} z-[55] w-[30rem] max-w-[calc(100vw-1rem)] rounded-2xl bg-slate-900/97 border border-slate-700 shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-100`}
          data-testid="pos-osk" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between mb-2" dir="rtl">
            <span className="text-xs font-black text-slate-300 flex items-center gap-1.5"><Keyboard className="w-4 h-4" /> لوحة المفاتيح — تكتب في الحقل المحدد</span>
            <button type="button" onClick={() => setOskOpen(false)} title="إغلاق" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <OnScreenKeyboard onKey={oskKey} onBackspace={oskBack} onClear={oskClear} onEnter={oskEnter} enterLabel="إدخال (Enter)" />
        </div>
      )}
      {parkMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setParkMenu(null)} />
          <div className="fixed z-[61] w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100" style={{ top: parkMenu.top, left: Math.max(8, Math.min(parkMenu.left + parkMenu.width - 224, window.innerWidth - 232)) }} dir="rtl" data-testid="park-menu">
            <button type="button" onClick={() => { setParkMenu(null); handleQuickParkOrder(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-black text-slate-800 dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer" data-testid="park-quick">
              <Zap className="w-4 h-4 text-amber-500 fill-current" /> تعليق فوري
            </button>
            <button type="button" onClick={() => { setParkMenu(null); handleOpenParkModal(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-black text-slate-800 dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer" data-testid="park-with-note">
              <StickyNote className="w-4 h-4 text-amber-500" /> تعليق مع اسم وملاحظة
            </button>
          </div>
        </>
      )}
      <div className={`flex flex-1 overflow-hidden relative ${isLayoutReversed ? 'flex-row-reverse' : 'flex-row'} ${groceryList ? `grocery-pos ${isLayoutReversed ? 'rev' : ''}` : ''}`} data-testid={groceryList ? 'grocery-pos' : undefined}>
        {isPosMenuOpen && (
          <>
            <div className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsPosMenuOpen(false)} />
            <div className={`absolute top-0 ${sideIsLeft ? 'left-0 slide-in-from-left' : 'right-0 slide-in-from-right'} h-full w-64 bg-white dark:bg-slate-900 z-50 animate-in`}><Sidebar dir={uiDir} currentView={currentView} onViewChange={(v) => { setCurrentView(v as ExtendedViewType); setIsPosMenuOpen(false); }} onLogout={handleLogout} isAllowed={viewAllowed} user={currentUser} onClose={() => setIsPosMenuOpen(false)} /></div>
          </>
        )}
        <div className={`${groceryList ? 'g-contents ' : ''}@container w-[42%] min-w-[22rem] max-w-[34rem] h-full bg-slate-50/70 dark:bg-slate-900/90 flex flex-col shadow-2xl z-0 ${isLayoutReversed ? 'border-r dark:border-slate-800' : 'border-l dark:border-slate-800'} border-slate-200 relative transition-colors overflow-hidden`}>
          
          {/* 2. Items List: Dedicated high-visibility vertical scroll area */}
          <div ref={cartListRef} className={`receipt-paper flex-1 min-h-0 overflow-y-auto custom-scrollbar ${groceryList ? 'g-list p-0' : 'p-3 space-y-2'}`}>
            {groceryList && cart.length > 0 && (
              <div style={{ gridTemplateColumns: showListVat ? GROCERY_COLS_VAT : GROCERY_COLS }} className={`grocery-head g-grid ${showListVat ? 'g-vat' : ''} sticky top-0 z-10 grid items-center gap-2 px-3 py-2 text-[12px] font-black text-white bg-slate-700 dark:bg-slate-800`}>
                <span>#</span><span>الصنف</span><span className="text-center">الكمية</span><span className="text-center">السعر</span>{showListVat && <span className="text-center" data-testid="grocery-vat-head">الضريبة {Math.round(taxRate * 100)}%</span>}<span className="text-center">الإجمالي</span><span />
              </div>
            )}
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none animate-in fade-in duration-300">
                <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3 shadow-inner">
                  <ShoppingBag className="w-9 h-9 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mb-1">السلة فارغة حالياً</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed">
                  انقر على أي صنف من قائمة الأصناف لإضافته، أو مرر الباركود للمسح المباشر.
                </p>
                {businessType === 'retail' && (
                  <div className="mt-4 px-3 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-300/60 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold flex items-center gap-1.5">
                    <FileDigit className="w-3.5 h-3.5 text-cyan-500" />
                    <span>جاهز لاستقبال مسح الباركود</span>
                  </div>
                )}
              </div>
            ) : (
              cart.map((item, idx) => {
                const isRecentlyAdded = item.cartItemId === lastAddedItemId;
                if (groceryList) return (
                  // شاشة البقالة: سطر واحد مضغوط لكل صنف — زر إنقاص/زيادة وحذف سريع
                  <div key={item.cartItemId} id={`cart-item-${item.cartItemId}`} data-testid="grocery-row"
                    style={{ gridTemplateColumns: showListVat ? GROCERY_COLS_VAT : GROCERY_COLS }} className={`g-grid ${showListVat ? 'g-vat ' : ''}grid items-center gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 ${item.isTobaccoFee ? 'bg-amber-50 dark:bg-amber-950/30' : item.isDeliveryFee ? 'bg-sky-50 dark:bg-sky-950/30' : !(item.price > 0) ? 'bg-rose-50 dark:bg-rose-950/30' : isRecentlyAdded ? 'bg-emerald-50 dark:bg-emerald-950/30' : idx % 2 ? 'bg-white/60 dark:bg-slate-900/40' : ''}`}>
                    <span className="text-[12px] font-mono font-black text-slate-500">{item.isTobaccoFee ? '↳' : item.isDeliveryFee ? '🛵' : idx + 1 - cart.slice(0, idx).filter(c => isSysLine(c)).length}</span>
                    <div className="min-w-0 flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="g-name text-[15px] font-black text-slate-900 dark:text-white truncate leading-6" title={item.name} {...costPeekHandlers(item.cartItemId)}>{item.name}</div>
                        {costPeekChip(item)}
                        {item.description && editingDescId !== item.cartItemId && <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate" data-testid="grocery-note-text">📝 {item.description}</div>}
                        {item.serial && editingSerialId !== item.cartItemId && <div className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300 truncate" data-testid="grocery-serial-text" dir="auto">S/N: {item.serial}</div>}
                        {item.originalPrice && item.originalPrice > item.price ? <div className={`text-[11px] font-bold ${item.promoName ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'}`} data-testid={item.promoName ? 'line-promo' : undefined}>{item.promoName ? `🏷️ ${item.promoName}` : 'خصم الصنف'}: {lineSaving(item).toFixed(2)}</div> : null}
                      </div>
                      {!isSysLine(item) && lineNoteBtn && (
                        <button type="button" data-testid="grocery-note-btn" onClick={() => { setEditingSerialId(null); setEditingDescId(editingDescId === item.cartItemId ? null : item.cartItemId); }}
                          title={item.description ? `الوصف: ${item.description}` : 'إضافة وصف يظهر في الفاتورة تحت اسم الصنف'}
                          className={`shrink-0 h-8 px-2 rounded-lg text-[11px] font-black border flex items-center gap-1 cursor-pointer ${item.description ? 'bg-slate-600 text-white border-slate-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-200'}`}>
                          <Edit className="w-3.5 h-3.5" /><span className="g-btn-label">وصف</span>
                        </button>
                      )}
                      {!isSysLine(item) && lineSerialBtn && (
                        <button type="button" data-testid="grocery-serial-btn" onClick={() => { setEditingDescId(null); setEditingSerialId(editingSerialId === item.cartItemId ? null : item.cartItemId); }}
                          title={item.serial ? `الرقم التسلسلي: ${item.serial}` : 'إضافة الرقم التسلسلي (S/N) للقطعة — يظهر في الفاتورة'}
                          className={`shrink-0 h-8 px-2 rounded-lg text-[11px] font-black border flex items-center gap-1 cursor-pointer ${item.serial ? 'bg-slate-600 text-white border-slate-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-200'}`}>
                          <ScanLine className="w-3.5 h-3.5" /><span className="g-btn-label">رقم تسلسلي</span>
                        </button>
                      )}
                      {!isSysLine(item) && lineDiscBtn && (
                        <button type="button" data-testid="grocery-disc-btn" onClick={() => openDiscount(() => { setLineDiscId(lineDiscId === item.cartItemId ? null : item.cartItemId); setLineDiscVal(''); })}
                          title="خصم على هذا الصنف"
                          className={`shrink-0 h-8 px-2 rounded-lg text-[11px] font-black border cursor-pointer whitespace-nowrap ${item.originalPrice && item.originalPrice > item.price ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300/60 hover:bg-amber-100'}`}>
                          ٪ خصم
                        </button>
                      )}
                    </div>
                    {isSysLine(item) ? <span className="text-center font-mono text-sm">{item.qty}</span> : (
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => decrementQty(item.cartItemId)} data-testid="grocery-dec" title="إنقاص وحدة" className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xl font-black leading-none cursor-pointer hover:bg-rose-200">−</button>
                        <input type="number" value={item.qty} min={cartItemIdIsWeight(item.cartItemId) ? 0.001 : 1} step={cartItemIdIsWeight(item.cartItemId) ? 0.001 : 1}
                          onFocus={(e) => e.currentTarget.select()} onChange={(e) => updateCartItemQtyDirect(item.cartItemId, Number(e.target.value) || 0)}
                          className="w-12 h-9 text-center font-mono font-black text-[15px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950" />
                        <button type="button" onClick={() => incrementQty(item.cartItemId)} data-testid="grocery-inc" title="زيادة وحدة" className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xl font-black leading-none cursor-pointer hover:bg-emerald-200">+</button>
                      </div>
                    )}
                    {allowPriceEdit && !isSysLine(item) ? (
                      <input type="number" step="0.5" min="0" data-testid="grocery-price"
                        value={toShownPrice(item.price)}
                        readOnly={!allowed('pos.editPrice')}
                        onMouseDown={(e) => { if (!allowed('pos.editPrice')) { e.preventDefault(); guard('pos.editPrice', () => {}); } }}
                        title={allowed('pos.editPrice') ? 'تعديل السعر' : 'تعديل السعر يحتاج صلاحية أو موافقة مشرف'}
                        onChange={(e) => updateCartItemPrice(item.cartItemId, parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full h-9 text-center font-mono font-bold text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 focus:outline-none focus:border-cyan-500" dir="ltr" />
                    ) : (
                      <span className="text-center font-mono text-sm font-bold">{toShownPrice(item.price).toFixed(2)}</span>
                    )}
                    {showListVat && <span className="text-center font-mono text-sm font-bold text-slate-600 dark:text-slate-300" data-testid="grocery-vat">{round2(lineAmounts(item.price, item.qty).tax).toFixed(2)}</span>}
                    <span className="text-center font-mono text-[15px] font-black text-slate-900 dark:text-white">{item.total.toFixed(2)}</span>
                    {item.isTobaccoFee ? <span /> : item.isDeliveryFee ? (
                      <button type="button" onClick={() => { setDeliveryOn(false); if (restOrderTypes) setOrderType(restOpts.defaultOrderType === 'delivery' ? 'takeaway' : restOpts.defaultOrderType); }} data-testid="delivery-del" title="إلغاء رسوم التوصيل" className="w-9 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    ) : (
                      <button type="button" onClick={() => removeFromCart(item.cartItemId)} data-testid="grocery-del" title="حذف الصنف من السلة" className="w-9 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    )}
                    {editingDescId === item.cartItemId && (
                      <div style={{ gridColumn: '2 / -1' }} className="flex items-center gap-1.5 pb-1">
                        <input autoFocus value={item.description || ''} maxLength={200} data-testid="grocery-note-input"
                          placeholder="📝 وصف يظهر في الفاتورة تحت اسم الصنف (مثال: مقاس 2×1.8 م، لون بني)..."
                          onChange={(e) => updateCartItemDescription(item.cartItemId, e.target.value)}
                          onBlur={(e) => { updateCartItemDescription(item.cartItemId, e.target.value.trim()); setEditingDescId(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
                          className="flex-1 min-w-0 h-9 bg-white dark:bg-slate-900 border-2 border-slate-400 rounded-lg px-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none" />
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingDescId(null)} className="h-9 px-3 rounded-lg bg-slate-600 text-white text-xs font-black cursor-pointer">تم</button>
                      </div>
                    )}
                    {editingSerialId === item.cartItemId && (
                      <div style={{ gridColumn: '2 / -1' }} className="flex items-center gap-1.5 pb-1">
                        <input autoFocus value={item.serial || ''} maxLength={60} data-testid="grocery-serial-input" dir="ltr"
                          placeholder="S/N — اكتب أو امسح الرقم التسلسلي"
                          onChange={(e) => { const v = e.target.value; setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, serial: v || undefined } : c)); }}
                          onBlur={(e) => { const v = e.target.value.trim(); setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, serial: v || undefined } : c)); setEditingSerialId(null); }}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
                          className="flex-1 min-w-0 h-9 bg-white dark:bg-slate-900 border-2 border-slate-400 rounded-lg px-2.5 text-sm font-bold font-mono text-slate-800 dark:text-slate-100 focus:outline-none" />
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingSerialId(null)} className="h-9 px-3 rounded-lg bg-slate-600 text-white text-xs font-black cursor-pointer">تم</button>
                      </div>
                    )}
                    {lineDiscId === item.cartItemId && (
                      <div style={{ gridColumn: '2 / -1' }} className="flex flex-wrap items-center gap-1.5 p-1.5 mb-1 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60" data-testid="grocery-disc-panel">
                        <span className="text-[11px] font-black text-amber-800 dark:text-amber-300 shrink-0">خصم الصنف:</span>
                        <input autoFocus type="number" min="0" step="any" value={lineDiscVal} onChange={(e) => setLineDiscVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') applyLineDiscount(item.cartItemId); if (e.key === 'Escape') setLineDiscId(null); }}
                          placeholder={lineDiscType === 'percent' ? 'النسبة %' : 'المبلغ على السطر'}
                          className="w-24 h-8 text-center font-mono font-black text-xs bg-white dark:bg-slate-900 border border-amber-400 rounded-lg px-2 focus:outline-none" />
                        <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-amber-300/60 overflow-hidden text-[11px] font-black">
                          <button type="button" onClick={() => setLineDiscType('percent')} className={`px-2 py-1.5 ${lineDiscType === 'percent' ? 'bg-amber-500 text-slate-950' : 'text-amber-700'}`}>%</button>
                          <button type="button" onClick={() => setLineDiscType('fixed')} className={`px-2 py-1.5 ${lineDiscType === 'fixed' ? 'bg-amber-500 text-slate-950' : 'text-amber-700'}`}>﷼</button>
                        </div>
                        <button type="button" onClick={() => applyLineDiscount(item.cartItemId)} className="px-2.5 h-8 rounded-lg bg-emerald-600 text-white text-[11px] font-black">تطبيق</button>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <button type="button" onClick={() => { setLineDiscVal(''); setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, price: c.originalPrice!, originalPrice: undefined, ...lineAmounts(c.originalPrice!, c.qty) } : c)); setLineDiscId(null); }} className="px-2 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-[11px] font-bold">إلغاء الخصم</button>
                        )}
                        <button type="button" onClick={() => setLineDiscId(null)} className="px-2 h-8 rounded-lg text-[11px] font-bold text-slate-500">إغلاق</button>
                      </div>
                    )}
                  </div>
                );
                return (
                  <div
                    key={item.cartItemId}
                    id={`cart-item-${item.cartItemId}`}
                    title={!(item.price > 0) ? 'هذا الصنف بدون سعر — لا يمكن إتمام البيع' : undefined}
                    className={`receipt-line rounded-xl border transition-colors duration-300 px-2.5 py-2 ${
                      isSysLine(item)
                        ? 'pointer-events-none bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                        : !(item.price > 0)
                        ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/40'
                        : isRecentlyAdded
                        ? 'is-new'
                        : ''
                    }`}
                  >
                    {/* السطر الأول: الرقم · الاسم (والتعبئة/الباقة/الوصف) · إجمالي السطر وتحته «شامل الضريبة» · حذف */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="receipt-num shrink-0 w-6 h-6 rounded-lg text-[11px] font-mono font-black flex items-center justify-center">
                          {item.isTobaccoFee ? '↳' : item.isDeliveryFee ? '🛵' : idx + 1 - cart.slice(0, idx).filter(c => isSysLine(c)).length}
                        </span>
                        {item.image && (
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 shadow-xs">
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate leading-6" {...costPeekHandlers(item.cartItemId)}>
                            {item.name}
                          </h4>
                          {costPeekChip(item)}
                          {item.unitName && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                                <Package className="w-2.5 h-2.5" />
                                <span>تعبئة: {item.unitName}</span>
                              </span>
                              {item.factor && item.factor > 1 && (
                                <span className="text-[9.5px] text-slate-400 font-mono">
                                  ({item.factor} قطع)
                                </span>
                              )}
                            </div>
                          )}
                          {item.isBundle && (
                            <div className="flex items-center gap-1 min-w-0" title={item.bundleDescription}>
                              <span className="shrink-0 text-[9.5px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                                <Boxes className="w-2.5 h-2.5" />
                                <span>كومبو</span>
                              </span>
                              {item.bundleDescription && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {item.bundleDescription}
                                </span>
                              )}
                            </div>
                          )}
                          {editingDescId === item.cartItemId ? (
                            <input
                              autoFocus
                              value={item.description || ''}
                              maxLength={200}
                              placeholder="وصف يظهر في الفاتورة تحت اسم الصنف..."
                              onChange={(e) => updateCartItemDescription(item.cartItemId, e.target.value)}
                              onBlur={(e) => { updateCartItemDescription(item.cartItemId, e.target.value.trim()); setEditingDescId(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
                              className="mt-1 w-full bg-white dark:bg-slate-900 border border-cyan-400 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                              data-testid="cart-desc-input"
                            />
                          ) : item.description ? (
                            <button type="button" onClick={() => setEditingDescId(item.cartItemId)} title="تعديل الوصف" className="block max-w-full text-right text-[10.5px] font-bold text-slate-500 dark:text-slate-400 truncate cursor-pointer hover:text-cyan-700 dark:hover:text-cyan-400" data-testid="cart-desc">
                              📝 {item.description}
                            </button>
                          ) : null}
                          {editingSerialId === item.cartItemId ? (
                            <input
                              autoFocus
                              value={item.serial || ''}
                              maxLength={60}
                              dir="ltr"
                              placeholder="S/N — اكتب أو امسح الرقم التسلسلي"
                              onChange={(e) => { const v = e.target.value; setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, serial: v || undefined } : c)); }}
                              onBlur={(e) => { const v = e.target.value.trim(); setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, serial: v || undefined } : c)); setEditingSerialId(null); }}
                              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
                              className="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-400 rounded-lg px-2 py-1 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                              data-testid="cart-serial-input"
                            />
                          ) : item.serial ? (
                            <button type="button" onClick={() => { setEditingDescId(null); setEditingSerialId(item.cartItemId); }} title="تعديل الرقم التسلسلي" className="block max-w-full text-right text-[10.5px] font-bold font-mono text-slate-500 dark:text-slate-400 truncate cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" data-testid="cart-serial" dir="auto">
                              S/N: {item.serial}
                            </button>
                          ) : null}
                          {item.promoName && item.originalPrice && item.originalPrice > item.price ? (
                            <div className="text-[10.5px] font-black text-rose-600 dark:text-rose-400 truncate" data-testid="line-promo">🏷️ {item.promoName}: −{lineSaving(item).toFixed(2)}</div>
                          ) : null}
                        </div>
                      </div>

                      {/* إجمالي السطر وتحته نوع السعر (شامل/غير شامل الضريبة) + حذف */}
                      <div className="flex items-start gap-1 shrink-0">
                        <div className="text-left">
                          <div className="receipt-amount font-mono font-black text-base sm:text-lg leading-6 inline-flex items-center gap-1">
                            <span>{item.total.toFixed(2)}</span>
                            <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 inline-block align-middle" />
                          </div>
                          {companySettings.taxRate > 0 && (
                            <div className="text-[9.5px] font-bold leading-none text-slate-400 dark:text-slate-500" data-testid="cart-tax-note">
                              {pricesIncludeTax ? 'شامل الضريبة' : `+ ضريبة ${companySettings.taxRate}%`}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.cartItemId)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="حذف الصنف من السلة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* السطر الثاني: الكمية · وصف · خصم · السعر — العناوين على إطار الحقول (لا تزيد ارتفاع البطاقة) */}
                    <div className="flex items-center justify-between gap-1.5 mt-1.5 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-700/60">
                      {/* الكمية */}
                      <div className="relative flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-xl border-2 border-cyan-500/50 dark:border-cyan-500/40" data-testid="qty-stepper">
                        <span className="absolute -top-2 right-2 px-1 text-[9.5px] font-black leading-none bg-inherit text-cyan-700 dark:text-cyan-400 rounded pointer-events-none" data-testid="qty-label">الكمية</span>
                        <button
                          type="button"
                          onClick={() => decrementQty(item.cartItemId)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition active:scale-95 cursor-pointer"
                          title="إنقاص الكمية"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <input
                          type="number"
                          min={item.cartItemId.includes('-w') ? '0.001' : '1'}
                          step={item.cartItemId.includes('-w') ? '0.001' : '1'}
                          value={item.qty}
                          // سطر الوزن (الميزان) يقبل الكسور العشرية
                          onChange={(e) => updateCartItemQtyDirect(item.cartItemId, item.cartItemId.includes('-w') ? (Math.round((parseFloat(e.target.value) || 0) * 1000) / 1000 || 0.001) : (parseInt(e.target.value) || 1))}
                          onFocus={handleFocusSelect}
                          className={`${item.cartItemId.includes('-w') ? 'w-20' : 'w-11 @[26rem]:w-12'} h-8 text-center font-mono font-black text-base bg-cyan-50 dark:bg-cyan-950/40 rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                          dir="ltr"
                          aria-label="الكمية"
                        />

                        <button
                          type="button"
                          onClick={() => incrementQty(item.cartItemId)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition active:scale-95 cursor-pointer"
                          title="زيادة الكمية"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* وصف الصنف + خصم الصنف */}
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setEditingDescId(editingDescId === item.cartItemId ? null : item.cartItemId)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1 cursor-pointer ${item.description ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/40' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-600 hover:bg-slate-100'}`}
                          title={item.description ? `الوصف: ${item.description}` : 'إضافة وصف يظهر في الفاتورة تحت اسم الصنف'}
                          data-testid="cart-desc-add"
                        >
                          <Edit className="w-3 h-3" />
                          <span className="hidden @[26rem]:inline">وصف</span>
                        </button>
                        {cardSerialBtn && !isSysLine(item) && (
                          <button
                            type="button"
                            onClick={() => { setEditingDescId(null); setEditingSerialId(editingSerialId === item.cartItemId ? null : item.cartItemId); }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1 cursor-pointer whitespace-nowrap ${item.serial ? 'bg-slate-600 text-white border-slate-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-600 hover:bg-slate-100'}`}
                            title={item.serial ? `الرقم التسلسلي: ${item.serial}` : 'إضافة الرقم التسلسلي (S/N) للقطعة — يظهر في الفاتورة'}
                            data-testid="cart-serial-btn"
                          >
                            <ScanLine className="w-3 h-3" />
                            <span className="hidden @[26rem]:inline">S/N</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDiscount(() => { setLineDiscId(lineDiscId === item.cartItemId ? null : item.cartItemId); setLineDiscVal(''); })}
                          className={`px-2 py-1 rounded-lg text-[11px] font-black border cursor-pointer whitespace-nowrap ${item.originalPrice && item.originalPrice > item.price ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300/60 hover:bg-amber-100'}`}
                          title="خصم على هذا الصنف"
                          data-testid="line-disc-btn"
                        >
                          {item.originalPrice && item.originalPrice > item.price ? `خصم ${lineSaving(item).toFixed(2)}` : <><span className="text-sm leading-none font-black">٪</span><span className="hidden @[26rem]:inline"> خصم</span></>}
                        </button>
                      </div>

                      {/* السعر */}
                      <div className="relative flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 focus-within:border-cyan-500" data-testid="price-box">
                        <span className="absolute -top-2 right-2 px-1 text-[9.5px] font-black leading-none bg-inherit text-slate-600 dark:text-slate-300 rounded pointer-events-none" data-testid="price-label">السعر</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={toShownPrice(item.price)}
                          readOnly={!allowPriceEdit || !allowed('pos.editPrice')}
                          onMouseDown={(e) => { if (!allowPriceEdit) { e.preventDefault(); triggerPrintNotification('تعديل السعر متوقف من إعدادات التطبيق'); return; } if (!allowed('pos.editPrice')) { e.preventDefault(); guard('pos.editPrice', () => {}); } }}
                          title={!allowPriceEdit ? 'تعديل السعر متوقف من إعدادات التطبيق' : allowed('pos.editPrice') ? '' : 'تعديل السعر يحتاج صلاحية أو موافقة مشرف'}
                          onChange={(e) => updateCartItemPrice(item.cartItemId, parseFloat(e.target.value) || 0)}
                          onFocus={handleFocusSelect}
                          className="w-16 h-8 text-center font-mono font-black text-base bg-transparent text-slate-900 dark:text-white focus:outline-none"
                          dir="ltr"
                          aria-label="السعر"
                        />
                        <SaudiRiyalSymbol className="w-3 h-3 text-slate-500" />
                      </div>
                    </div>
                    {lineDiscId === item.cartItemId && (
                      <div className="mt-2 flex items-center gap-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60" data-testid="line-disc-panel">
                        <span className="text-[11px] font-black text-amber-800 dark:text-amber-300 shrink-0">خصم الصنف:</span>
                        <input autoFocus type="number" min="0" step="any" value={lineDiscVal} onChange={(e) => setLineDiscVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') applyLineDiscount(item.cartItemId); if (e.key === 'Escape') setLineDiscId(null); }}
                          placeholder={lineDiscType === 'percent' ? 'النسبة %' : 'المبلغ على السطر'}
                          className="w-24 text-center font-mono font-black text-xs bg-white dark:bg-slate-900 border border-amber-400 rounded-lg px-2 py-1 focus:outline-none" data-testid="line-disc-input" />
                        <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-amber-300/60 overflow-hidden text-[11px] font-black">
                          <button type="button" onClick={() => setLineDiscType('percent')} className={`px-2 py-1 ${lineDiscType === 'percent' ? 'bg-amber-500 text-slate-950' : 'text-amber-700'}`}>%</button>
                          <button type="button" onClick={() => setLineDiscType('fixed')} className={`px-2 py-1 ${lineDiscType === 'fixed' ? 'bg-amber-500 text-slate-950' : 'text-amber-700'}`}>﷼</button>
                        </div>
                        <button type="button" onClick={() => applyLineDiscount(item.cartItemId)} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black" data-testid="line-disc-apply">تطبيق</button>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <button type="button" onClick={() => { setLineDiscVal(''); setCart(prev => prev.map(c => c.cartItemId === item.cartItemId ? { ...c, price: c.originalPrice!, originalPrice: undefined, ...lineAmounts(c.originalPrice!, c.qty) } : c)); setLineDiscId(null); }} className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[11px] font-bold">إلغاء الخصم</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 3. Streamlined Bottom Checkout Dock (Organized, High-Clarity Totals & Actions) */}
          <div className={`pos-footer shrink-0 ${groceryList ? 'g-dock ' : ''}bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-2 shadow-[0_-8px_25px_rgba(0,0,0,0.06)]`}>
            
            {/* شريط تبويبات الفاتورة: العميل · ملاحظة · الخصم · تقسيم الدفع — لوحة واحدة تُفتح تحته (توفير مساحة السلة) */}
            {(() => {
              const debt = selectedCustomer && (selectedCustomer.balance || 0) < -0.004 ? Math.abs(selectedCustomer.balance) : 0;
              const tabBase = 'min-w-0 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap';
              const tabIdle = 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/60';
              const tabActive = 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700';
              return (
                <div className="flex items-stretch gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700" role="tablist" data-testid="cart-tabs">
                  {/* العميل: يفتح نافذة اختيار العميل */}
                  <button
                    type="button"
                    role="tab"
                    onClick={() => setIsCustomerPickerOpen(true)}
                    title={selectedCustomer ? `العميل: ${selectedCustomer.name}${debt ? ` — عليه ${debt.toFixed(2)}` : ''}` : 'اختيار العميل'}
                    data-testid="tab-customer"
                    className={`${tabBase} flex-1 justify-start ${selectedCustomer ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 ring-1 ring-cyan-500/40' : tabIdle}`}
                  >
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{selectedCustomer ? selectedCustomer.name : 'إضافة عميل'}</span>
                    {debt > 0 && <span className="hidden @[30rem]:inline shrink-0 font-mono text-[10px] text-rose-600 dark:text-rose-400">عليه {debt.toFixed(2)}</span>}
                    {debt > 0 && <span className="@[30rem]:hidden shrink-0 w-1.5 h-1.5 rounded-full bg-rose-500" />}
                    {selectedCustomer && (
                      <span
                        role="button"
                        aria-label="إلغاء اختيار العميل"
                        title="إلغاء اختيار العميل"
                        onClick={(e) => { e.stopPropagation(); setSelectedCustomerId(null); }}
                        className="shrink-0 mr-auto p-0.5 rounded-full text-slate-400 hover:bg-rose-500 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>

                  {/* البنشر/الزيوت: بيانات المركبة */}
                  {autoActivity && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cartTab === 'vehicle'}
                      onClick={() => { setIsDiscountDrawerOpen(false); setCartTab(cartTab === 'vehicle' ? null : 'vehicle'); }}
                      title={vehicle.plate ? `السيارة: ${vehicle.plate}${vehicle.model ? ` — ${vehicle.model}` : ''}` : 'بيانات السيارة (اللوحة، العداد، الزيت القادم)'}
                      data-testid="tab-vehicle"
                      className={`${tabBase} ${cartTab === 'vehicle' ? tabActive : hasVehicle(vehicle) ? 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-1 ring-sky-500/40' : tabIdle}`}
                    >
                      <Car className="w-3.5 h-3.5 shrink-0 text-sky-600" />
                      <span className="truncate max-w-[7rem]" dir="auto">{vehicle.plate || 'السيارة'}</span>
                    </button>
                  )}

                  {/* رسوم التوصيل (تُفعَّل من إعدادات التطبيق) */}
                  {deliverySettings.enabled && (!restOrderTypes || orderType === 'delivery') && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cartTab === 'delivery'}
                      onClick={() => { setIsDiscountDrawerOpen(false); if (!deliveryActive) { setDeliveryOn(true); setCartTab('delivery'); } else setCartTab(cartTab === 'delivery' ? null : 'delivery'); }}
                      title={deliveryActive ? 'رسوم التوصيل مضافة — اضغط لتعديل المبلغ أو إلغائها' : 'إضافة رسوم التوصيل للفاتورة'}
                      data-testid="tab-delivery"
                      className={`${tabBase} ${cartTab === 'delivery' ? tabActive : deliveryActive ? 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-1 ring-sky-500/40' : tabIdle}`}
                    >
                      <span className="text-sm leading-none">🛵</span>
                      <span>توصيل</span>
                    </button>
                  )}

                  {/* ملاحظة على الفاتورة */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={cartTab === 'note'}
                    onClick={() => { setIsDiscountDrawerOpen(false); setCartTab(cartTab === 'note' ? null : 'note'); }}
                    title={invoiceNote.trim() ? `ملاحظة: ${invoiceNote.trim()}` : 'ملاحظة على الفاتورة'}
                    data-testid="tab-note"
                    className={`${tabBase} ${cartTab === 'note' ? tabActive : invoiceNote.trim() ? 'text-amber-700 dark:text-amber-300' : tabIdle}`}
                  >
                    <StickyNote className="w-3.5 h-3.5 shrink-0" />
                    <span>ملاحظة</span>
                    {invoiceNote.trim() && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" data-testid="tab-note-dot" />}
                  </button>

                  {/* خصم الفاتورة */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isDiscountDrawerOpen}
                    onClick={() => { setCartTab(null); if (isDiscountDrawerOpen) setIsDiscountDrawerOpen(false); else openDiscount(() => setIsDiscountDrawerOpen(true)); }}
                    title={cleanDiscountVal > 0 ? `خصم الفاتورة: ${discountType === 'percent' ? `${cleanDiscountVal}%` : `${cleanDiscountVal} ﷼`} (-${totalSavings.toFixed(2)})` : 'خصم على الفاتورة (مبلغ ثابت / نسبة %)'}
                    data-testid="tab-discount"
                    className={`${tabBase} ${isDiscountDrawerOpen ? tabActive : cleanDiscountVal > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40' : tabIdle}`}
                  >
                    <BadgePercent className="w-4 h-4 shrink-0 text-amber-500" strokeWidth={2.5} />
                    <span className={cleanDiscountVal > 0 ? 'font-mono font-black' : ''}>{cleanDiscountVal > 0 ? `-${totalSavings.toFixed(2)}` : 'خصم'}</span>
                  </button>

                  {/* تقسيم الدفع: جزء نقدي وجزء شبكة */}
                  {posButtons.split && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cartTab === 'split'}
                      disabled={cart.length === 0 || calculatedTotal <= 0}
                      onClick={() => { setIsDiscountDrawerOpen(false); setCartTab(cartTab === 'split' ? null : 'split'); }}
                      title="دفع جزء نقداً وجزء بالشبكة"
                      data-testid="tab-split"
                      className={`${tabBase} ${cartTab === 'split' ? tabActive : tabIdle} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                      <span>تقسيم<span className="hidden @[26rem]:inline"> الدفع</span></span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* لوحة بيانات السيارة (البنشر وتغيير الزيوت والكفرات) */}
            {autoActivity && cartTab === 'vehicle' && (() => {
              const prev = vehicle.plate ? lastVisit(invoices, vehicle.plate) : undefined;
              const step = companySettings.oilChangeKm && companySettings.oilChangeKm > 0 ? companySettings.oilChangeKm : 5000;
              const inp = 'w-full min-w-0 px-2.5 py-1.5 text-sm font-bold rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-500';
              const num = (v: string) => { const n = parseInt(v.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
              const lbl = 'flex flex-col gap-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400';
              return (
                <div className="p-2 rounded-xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-300/60 dark:border-sky-800/60 space-y-1.5" data-testid="vehicle-panel">
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <label className={lbl}>رقم اللوحة
                      <input autoFocus value={vehicle.plate || ''} data-testid="veh-plate" maxLength={20} placeholder="مثال: ا ب ج 1234"
                        onChange={(e) => setVehicle(v => ({ ...v, plate: e.target.value }))}
                        onBlur={() => { if (prev?.vehicle?.model && !vehicle.model) setVehicle(v => ({ ...v, model: prev.vehicle!.model })); }}
                        className={inp} />
                    </label>
                    <label className={lbl}>السيارة (النوع / الموديل)
                      <input value={vehicle.model || ''} data-testid="veh-model" maxLength={40} placeholder="مثال: كامري 2020"
                        onChange={(e) => setVehicle(v => ({ ...v, model: e.target.value }))} className={inp} />
                    </label>
                    <label className={lbl}>قراءة العداد (كم)
                      <input inputMode="numeric" value={vehicle.km ?? ''} data-testid="veh-km" placeholder="0"
                        onChange={(e) => setVehicle(v => ({ ...v, km: num(e.target.value) }))}
                        onBlur={() => { if (vehicle.km && !vehicle.nextKm) setVehicle(v => ({ ...v, nextKm: (v.km || 0) + step })); }}
                        className={`${inp} font-mono`} dir="ltr" />
                    </label>
                    <label className={lbl}>تغيير الزيت القادم (كم)
                      <input inputMode="numeric" value={vehicle.nextKm ?? ''} data-testid="veh-next-km" placeholder={vehicle.km ? String(vehicle.km + step) : ''}
                        onChange={(e) => setVehicle(v => ({ ...v, nextKm: num(e.target.value) }))} className={`${inp} font-mono`} dir="ltr" />
                    </label>
                    <label className={lbl}>موعد الصيانة القادم (اختياري)
                      <input type="date" value={vehicle.nextDate || ''} data-testid="veh-next-date"
                        onChange={(e) => setVehicle(v => ({ ...v, nextDate: e.target.value }))} className={inp} />
                    </label>
                    <div className="flex items-end gap-1.5">
                      {hasVehicle(vehicle) && (
                        <button type="button" onClick={() => setVehicle({})} title="مسح بيانات السيارة" className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                      <button type="button" onClick={() => setCartTab(null)} className="flex-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black cursor-pointer" data-testid="vehicle-done">تم</button>
                    </div>
                  </div>
                  {prev && (
                    <div className="text-[11px] font-bold text-sky-800 dark:text-sky-300" data-testid="veh-last-visit">
                      آخر زيارة: {(prev.date || '').slice(0, 10)}{prev.vehicle?.km ? ` — العداد ${prev.vehicle.km.toLocaleString('en-US')} كم` : ''}{prev.vehicle?.nextKm ? ` — الزيت القادم كان ${prev.vehicle.nextKm.toLocaleString('en-US')} كم` : ''}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* لوحة رسوم التوصيل */}
            {cartTab === 'delivery' && deliveryActive && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-300/60 dark:border-sky-800/60" data-testid="delivery-panel">
                <span className="text-xs font-black text-sky-800 dark:text-sky-300 shrink-0">🛵 رسوم التوصيل</span>
                <input type="number" min="0" step="0.5" autoFocus value={deliveryAmt !== '' ? deliveryAmt : String(deliverySettings.amount)} data-testid="delivery-amount"
                  onChange={(e) => setDeliveryAmt(e.target.value)} onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setCartTab(null); } }}
                  className="w-24 px-2 py-2 text-sm font-mono font-black text-center rounded-lg bg-white dark:bg-slate-800 border-2 border-sky-400 focus:outline-none" dir="ltr" />
                <span className="text-[10px] font-bold text-slate-500 shrink-0">{pricesIncludeTax ? 'شامل الضريبة' : 'قبل الضريبة'}</span>
                {!restOrderTypes && (
                  <button type="button" onClick={() => { setDeliveryOn(false); setDeliveryAmt(''); setCartTab(null); }} className="mr-auto px-2.5 py-2 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer" data-testid="delivery-cancel">إلغاء التوصيل</button>
                )}
                <button type="button" onClick={() => setCartTab(null)} className={`${restOrderTypes ? 'mr-auto ' : ''}px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black cursor-pointer`}>تم</button>
              </div>
            )}

            {/* لوحة الملاحظة */}
            {cartTab === 'note' && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300/60 dark:border-amber-800/60 animate-in fade-in duration-150" data-testid="note-panel">
                <input
                  type="text"
                  autoFocus
                  value={invoiceNote}
                  onChange={(e) => setInvoiceNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setCartTab(null); } }}
                  maxLength={200}
                  placeholder="📝 ملاحظة تظهر في الفاتورة..."
                  data-testid="invoice-note"
                  className="flex-1 min-w-0 px-3 py-2 text-sm font-bold rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 placeholder:font-bold focus:outline-none focus:border-amber-500"
                />
                {invoiceNote && (
                  <button type="button" onClick={() => setInvoiceNote('')} title="مسح الملاحظة" className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
                <button type="button" onClick={() => setCartTab(null)} className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black cursor-pointer" data-testid="note-done">تم</button>
              </div>
            )}

            {/* لوحة تقسيم الدفع: يكتب الكاشير أحد المبلغين ويُكمَل الآخر تلقائياً حتى الإجمالي */}
            {cartTab === 'split' && cart.length > 0 && (() => {
              const lead = parseFloat(splitLeadVal);
              const has = Number.isFinite(lead);
              const cashPart = !has ? NaN : splitLead === 'cash' ? round2(lead) : round2(calculatedTotal - lead);
              const cardPart = !has ? NaN : splitLead === 'card' ? round2(lead) : round2(calculatedTotal - lead);
              const recv = parseFloat(splitReceivedInput);
              const hasRecv = splitReceivedInput.trim() !== '' && Number.isFinite(recv);
              const valid = has && cashPart > 0.004 && cardPart > 0.004 && (!hasRecv || recv >= cashPart - 0.001);
              const error = !has ? '' : cashPart <= 0.004 || cardPart <= 0.004
                ? (lead > calculatedTotal + 0.001 ? `المبلغ أكبر من الإجمالي (${calculatedTotal.toFixed(2)})` : 'أدخل مبلغاً أقل من الإجمالي — الجزآن يجب أن يكونا أكبر من صفر')
                : hasRecv && recv < cashPart - 0.001 ? `المستلم نقداً أقل من الجزء النقدي (${cashPart.toFixed(2)})` : '';
              const pay = () => { if (valid) void handleCheckout('split', hasRecv ? recv : undefined, false, undefined, { cash: cashPart, card: cardPart }); };
              const field = (kind: 'cash' | 'card') => {
                const other = kind === 'cash' ? cashPart : cardPart;
                // الحقل المحسوب: لا يُعرض سالباً (المبلغ المكتوب أكبر من الإجمالي — يظهر الخطأ تحته)
                const value = splitLead === kind ? splitLeadVal : has && other >= 0 ? other.toFixed(2) : '';
                return (
                  <label className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 bg-white dark:bg-slate-900 ${splitLead === kind && has ? (kind === 'cash' ? 'border-emerald-500' : 'border-indigo-500') : 'border-slate-200 dark:border-slate-700'}`}>
                    {kind === 'cash' ? <Banknote className="w-4 h-4 text-emerald-600 shrink-0" /> : <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />}
                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 shrink-0">{kind === 'cash' ? 'نقدي' : 'شبكة'}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={value}
                      autoFocus={kind === 'cash'}
                      onFocus={handleFocusSelect}
                      onChange={(e) => { setSplitLead(kind); setSplitLeadVal(e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pay(); } if (e.key === 'Escape') setCartTab(null); }}
                      placeholder="0.00"
                      dir="ltr"
                      className="w-full min-w-0 bg-transparent text-center font-mono font-black text-base text-slate-900 dark:text-white focus:outline-none"
                      data-testid={`split-${kind}`}
                    />
                  </label>
                );
              };
              return (
                <div className="p-2 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-300/60 dark:border-indigo-800/60 space-y-1.5 animate-in fade-in duration-150" data-testid="split-panel">
                  {/* رأس اللوحة بنفس أسلوب لوحة الخصم: العنوان + الإجمالي + إغلاق */}
                  <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>تقسيم الدفع</span>
                      <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 truncate">— اكتب أحد المبلغين ويُكمَل الآخر</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono">الإجمالي {calculatedTotal.toFixed(2)}</span>
                      <button type="button" onClick={() => setCartTab(null)} title="إغلاق" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer" data-testid="split-close">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {field('cash')}
                    {field('card')}
                  </div>
                  {/* النقدي المستلم (اختياري): لحساب الباقي من الجزء النقدي */}
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 px-0.5">
                    <span className="shrink-0">المستلم نقداً:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      value={splitReceivedInput}
                      onFocus={handleFocusSelect}
                      onChange={(e) => setSplitReceivedInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pay(); } }}
                      placeholder={has && cashPart > 0 ? cashPart.toFixed(2) : 'اختياري'}
                      dir="ltr"
                      className="w-24 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-center font-mono font-black text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      data-testid="split-received"
                    />
                    {hasRecv && has && recv >= cashPart - 0.001 && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-black" data-testid="split-change">الباقي: <span className="font-mono">{round2(recv - cashPart).toFixed(2)}</span></span>
                    )}
                  </div>
                  {error && <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 px-2 py-1 text-[11px] font-black text-rose-700 dark:text-rose-300" data-testid="split-error">⛔ {error}</div>}
                  <button
                    type="button"
                    disabled={!valid}
                    onClick={pay}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-l from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    data-testid="split-pay"
                  >
                    <span>✓ إتمام الدفع</span>
                    {valid && <span className="font-mono text-xs opacity-95">نقدي {cashPart.toFixed(2)} + شبكة {cardPart.toFixed(2)}</span>}
                  </button>
                </div>
              );
            })()}

            {/* Collapsible Discount Drawer */}
            {isDiscountDrawerOpen && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/90 rounded-2xl border border-amber-500/40 shadow-sm space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-500" />
                    <span>تحديد خصم الفاتورة</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openDiscount(() => setIsDiscountModalOpen(true))}
                      className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-bold ml-2 cursor-pointer"
                      title="فتح شاشة الخصم الموسعة"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>نافذة الخصم الكاملة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDiscountDrawerOpen(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {discountError && cleanDiscountVal > 0 && (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 px-2 py-1.5 text-[11px] font-black text-rose-700 dark:text-rose-300" data-testid="drawer-discount-error">⛔ {discountError}</div>
                )}
                {/* Main Discount Type: Fixed Amount vs Percentage */}
                <div className="grid grid-cols-2 gap-1.5 bg-slate-200 dark:bg-slate-900 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`py-1.5 px-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      discountType === 'fixed'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>مبلغ مالي ثابت (﷼)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('percent');
                      if (discountValue > 100) setDiscountValue(10);
                    }}
                    className={`py-1.5 px-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      discountType === 'percent'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>نسبة مئوية (%)</span>
                  </button>
                </div>

                {/* Scope selector for Fixed Amount */}
                {discountType === 'fixed' && (
                  <div className="flex items-center justify-between text-[11px] bg-amber-500/10 border border-amber-500/25 px-2 py-1 rounded-lg">
                    <span className="font-bold text-amber-900 dark:text-amber-300">طريقة التطبيق:</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                        <input
                          type="radio"
                          name="quickDiscountScope"
                          checked={discountScope === 'total'}
                          onChange={() => setDiscountScope('total')}
                          className="accent-amber-500 text-xs"
                        />
                        <span>من الإجمالي النهائي شامل الضريبة</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer font-bold text-slate-600 dark:text-slate-400">
                        <input
                          type="radio"
                          name="quickDiscountScope"
                          checked={discountScope === 'subtotal'}
                          onChange={() => setDiscountScope('subtotal')}
                          className="accent-amber-500 text-xs"
                        />
                        <span>قبل الضريبة</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Input and currency symbol */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max={discountType === 'percent' ? 100 : (discountScope === 'total' ? rawTotalWithTax : rawSubtotal)}
                      step={discountType === 'percent' ? '1' : '0.5'}
                      value={discountValue === 0 ? '' : discountValue}
                      placeholder={discountType === 'fixed' ? 'أدخل المبلغ بالريال...' : 'أدخل النسبة المئوية...'}
                      data-testid="drawer-discount-input"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyInvoiceDiscount(); } }}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (isNaN(val) || val <= 0) {
                          setDiscountValue(0);
                        } else if (discountType === 'percent') {
                          setDiscountValue(Math.min(100, Math.max(0, val)));
                        } else {
                          setDiscountValue(Math.max(0, val));
                        }
                      }}
                      onFocus={handleFocusSelect}
                      className="w-full text-center font-mono font-black text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl py-1.5 px-8 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      dir="ltr"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      {discountType === 'fixed' ? (
                        <SaudiRiyalSymbol className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <span className="font-bold text-amber-500">%</span>
                      )}
                    </div>
                  </div>

                  {cleanDiscountVal > 0 && (
                    <button
                      type="button"
                      onClick={() => setDiscountValue(0)}
                      className="px-2.5 py-1.5 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer font-bold shrink-0"
                    >
                      تصفير
                    </button>
                  )}
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="text-[10px] text-slate-400 font-bold shrink-0">سريع:</span>
                  {(discountType === 'percent' ? [5, 10, 15, 20, 25, 50] : [5, 10, 15, 20, 50, 100]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDiscountValue(preset)}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded-lg font-bold transition cursor-pointer border flex items-center gap-0.5 shrink-0 ${
                        cleanDiscountVal === preset
                          ? 'bg-amber-500 border-amber-600 text-slate-950 font-black'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{preset}</span>
                      {discountType === 'percent' ? '%' : <SaudiRiyalSymbol className="w-2 h-2" />}
                    </button>
                  ))}
                  {discountType === 'fixed' && rawTotalWithTax > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountScope('total');
                        setDiscountValue(Number((rawSubtotal * taxRate).toFixed(2)));
                      }}
                      className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 shrink-0 cursor-pointer"
                      title="خصم يعادل قيمة الضريبة بالكامل"
                    >
                      خصم الضريبة
                    </button>
                  )}
                </div>

                {/* Live Real-time summary strip */}
                {cleanDiscountVal > 0 && (
                  <div className="text-[11px] font-bold bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span>
                      وفر العميل: <strong className="text-amber-500 font-mono font-black">{totalSavings.toFixed(2)} ﷼</strong>
                    </span>
                    <span>
                      النهائي المستحق: <strong className="text-cyan-600 dark:text-cyan-400 font-mono font-black">{calculatedTotal.toFixed(2)} ﷼</strong>
                    </span>
                  </div>
                )}

                {/* تطبيق الخصم وإغلاق المربع */}
                <button
                  type="button"
                  data-testid="apply-discount"
                  disabled={cleanDiscountVal > 0 && !!discountError}
                  onClick={applyInvoiceDiscount}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  ✓ {cleanDiscountVal > 0 ? `تطبيق الخصم (${discountType === 'percent' ? `${cleanDiscountVal}%` : `${cleanDiscountVal} ﷼`})` : 'إغلاق بدون خصم'}
                </button>
              </div>
            )}

            {/* Dock Row B: شاشة الصندوق (Till) — الإجمالي بأرقام كبيرة كشاشة عرض العميل */}
            <div className="till-display rounded-2xl p-2.5 sm:p-3 space-y-2" data-testid="till">
              {/* Compact Breakdown Line */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span>المجموع:</span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{rawSubtotal.toFixed(2)}</strong>
                    <SaudiRiyalSymbol className="w-2.5 h-2.5 opacity-70" />
                  </span>

                  {taxRate > 0 && <span className="inline-flex items-center gap-1">
                    <span>الضريبة ({companySettings.taxRate}%):</span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{calculatedTax.toFixed(2)}</strong>
                    <SaudiRiyalSymbol className="w-2.5 h-2.5 opacity-70" />
                  </span>}

                  {totalSavings > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                      <span>الخصم:</span>
                      <strong className="font-mono">-{totalSavings.toFixed(2)}</strong>
                      <SaudiRiyalSymbol className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsSummaryDetailsOpen(!isSummaryDetailsOpen)}
                  className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>{isSummaryDetailsOpen ? 'إخفاء' : 'تفاصيل'}</span>
                  {isSummaryDetailsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Extended Details (if opened) */}
              {isSummaryDetailsOpen && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>المبلغ قبل الخصم:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{rawSubtotal.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 inline" /></span>
                  </div>
                  {totalSavings > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>الخصم{discountType === 'percent' ? ` (${cleanDiscountVal}%)` : ''}:</span>
                      <span className="font-mono font-bold">-{totalSavings.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 inline" /></span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{taxRate > 0 ? 'المبلغ الخاضع للضريبة:' : 'المجموع:'}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{discountedSubtotal.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 inline" /></span>
                  </div>
                  <div className="flex justify-between">
                    <span>ضريبة القيمة المضافة:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{calculatedTax.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 inline" /></span>
                  </div>
                </div>
              )}

              {/* High-Impact Final Total Row */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/80">
                <div>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                    الإجمالي النهائي المستحق
                  </span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  {/* العملات الإضافية المفعّلة بجانب الإجمالي بالعملة الأساسية */}
                  {cur.extras.length > 0 && (
                    <div className="flex flex-col items-end gap-0.5 min-w-0" data-testid="till-extra-currencies">
                      {cur.extras.slice(0, 3).map(c => (
                        <span key={c.code} className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[11px] font-mono font-black text-cyan-700 dark:text-cyan-300 whitespace-nowrap" title={`${c.nameAr} — 1 ${c.code} = ${c.exchangeRate} ${cur.baseCode}`}>
                          {toCurrency(calculatedTotal, c).toFixed(2)} {c.symbol || c.code}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="till-total font-mono font-black text-3xl sm:text-4xl inline-flex items-center gap-1.5">
                    <span>{calculatedTotal.toFixed(2)}</span>
                    <SaudiRiyalSymbol className="w-6 h-6 inline-block align-middle" />
                  </div>
                </div>
              </div>
            </div>

            {/* Dock Row C: الدفع السريع — صف واحد: بالضبط + 4 مبالغ مقترحة حسب الإجمالي + «مبلغ آخر» (لا يختفي مهما ضاقت الشاشة) */}
            {posButtons.quickPay && (() => {
              const t = calculatedTotal;
              // مبالغ يدفعها العميل غالباً: أقرب مضاعف لكل فئة (10، 20، 50، 100، 200، 500) فوق الإجمالي — بلا تكرار وكلها صالحة
              const notes: number[] = [];
              if (t > 0) for (const d of [10, 20, 50, 100, 200, 500]) { const v = Math.ceil((t + 0.001) / d) * d; if (v > t && !notes.includes(v)) notes.push(v); }
              notes.sort((a, b) => a - b);
              while (notes.length < 4 && t > 0) notes.push((notes[notes.length - 1] || 500) * 2);
              const shown = t > 0 ? notes.slice(0, 4) : [50, 100, 200, 500];
              const customVal = parseFloat(customQuickPayInput);
              return (
                <div className="pos-quickpay p-1.5 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent dark:from-amber-500/15 dark:via-emerald-500/15 rounded-xl border border-amber-500/30 dark:border-amber-500/40" data-testid="quickpay">
                  {isCustomQuickPayOpen ? (
                    <div className="space-y-1.5" data-testid="quickpay-custom">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="0" step="1" placeholder="المبلغ المستلم..." value={customQuickPayInput} autoFocus dir="ltr"
                          onChange={(e) => setCustomQuickPayInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !isNaN(customVal) && customVal >= t && t > 0) handleCheckout('cash', customVal, true); if (e.key === 'Escape') setIsCustomQuickPayOpen(false); }}
                          className="flex-1 min-w-0 h-9 text-center font-mono font-black text-sm bg-white dark:bg-slate-900 border border-cyan-500/50 rounded-lg px-2 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                        <button type="button" disabled={cart.length === 0 || isNaN(customVal) || customVal < t}
                          onClick={() => { if (!isNaN(customVal)) handleCheckout('cash', customVal, true); }}
                          className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-lg cursor-pointer shrink-0">دفع وحساب الباقي</button>
                        <button type="button" onClick={() => setIsCustomQuickPayOpen(false)} title="إغلاق" className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                      {customQuickPayInput && !isNaN(customVal) && (
                        <div className="flex justify-between text-xs font-black px-1">
                          <span className="text-slate-500">المستلم: {customVal.toFixed(2)}</span>
                          {customVal >= t
                            ? <span className="text-emerald-600 dark:text-emerald-400">الباقي: {(customVal - t).toFixed(2)}</span>
                            : <span className="text-rose-500">ناقص: {(t - customVal).toFixed(2)}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-1" title="دفع سريع (كاش فوري)">
                      <button type="button" disabled={cart.length === 0 || t <= 0} onClick={() => handleCheckout('cash', t, true)} data-testid="quickpay-exact"
                        title={`إتمام فوري بالمبلغ بالضبط: ${t.toFixed(2)}`}
                        className="h-12 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-800 dark:text-emerald-300 flex flex-col items-center justify-center cursor-pointer">
                        <span className="text-[10px] font-black leading-none">بالضبط</span>
                        <span className="font-mono font-black text-[12px] leading-tight mt-0.5">{t > 0 ? (Number.isInteger(t) ? t : t.toFixed(1)) : 0}</span>
                      </button>
                      {shown.map((amt) => {
                        const ok = t > 0 && amt >= t;
                        return (
                          <button key={amt} type="button" disabled={cart.length === 0 || !ok} onClick={() => handleCheckout('cash', amt, true)} data-testid="quickpay-note"
                            title={ok ? `كاش ${amt} - الباقي: ${(amt - t).toFixed(2)}` : `فئة ${amt} أقل من الإجمالي`}
                            className={`h-12 rounded-lg border flex flex-col items-center justify-center transition ${ok ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-amber-400 active:scale-95 cursor-pointer' : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/30 opacity-40 cursor-not-allowed'}`}>
                            <span className="font-mono font-black text-[14px] leading-none text-slate-900 dark:text-white">{amt}</span>
                            <span className={`text-[10.5px] font-black leading-none mt-1 ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`} data-testid="quickpay-change">
                              {ok ? `باقي ${(amt - t) % 1 ? (amt - t).toFixed(2) : (amt - t).toFixed(0)}` : 'أقل'}
                            </span>
                          </button>
                        );
                      })}
                      <button type="button" disabled={cart.length === 0} onClick={() => { setCustomQuickPayInput(''); setIsCustomQuickPayOpen(true); }} data-testid="quickpay-other"
                        className="h-12 rounded-lg border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 active:scale-95 disabled:opacity-40 text-cyan-700 dark:text-cyan-300 flex flex-col items-center justify-center cursor-pointer">
                        <Coins className="w-4 h-4" />
                        <span className="text-[10px] font-black leading-none mt-0.5">مبلغ آخر</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Dock Row D: Primary Checkout Buttons */}
            <div className="g-pay grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleCheckout('cash')}
                data-testid="pay-cash"
                style={{ order: swapPayButtons ? 2 : 0 }}
                className="py-3 bg-gradient-to-l from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 active:scale-98 transition"
              >
                <Banknote className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>دفع كاش</span>
                <span className="font-mono text-xs opacity-90">({calculatedTotal.toFixed(2)})</span>
              </button>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleCheckout('card')}
                data-testid="pay-card"
                style={{ order: swapPayButtons ? 1 : 0 }}
                className="py-3 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 active:scale-98 transition"
              >
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>دفع شبكة</span>
                <span className="font-mono text-xs opacity-90">({calculatedTotal.toFixed(2)})</span>
              </button>
            </div>
            {(posButtons.credit || posButtons.bank) && (
              <div className={`grid gap-2 ${posButtons.credit && posButtons.bank ? 'grid-cols-2' : 'grid-cols-1'}`} data-testid="pos-extra-pay">
                {posButtons.credit && (
                  <button
                    type="button"
                    disabled={cart.length === 0 || calculatedTotal <= 0}
                    onClick={() => guard('pos.credit', () => setIsPartialModalOpen(true))}
                    className="w-full py-2.5 rounded-xl border-2 border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-amber-800 dark:text-amber-300 font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                    data-testid="pay-credit"
                  >
                    <span>🕒 دفع جزئي / آجل</span>
                  </button>
                )}
                {posButtons.bank && (
                  <button
                    type="button"
                    disabled={cart.length === 0 || calculatedTotal <= 0}
                    onClick={() => handleCheckout('bank')}
                    className="w-full py-2.5 rounded-xl border-2 border-indigo-500/60 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-800 dark:text-indigo-300 font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                    data-testid="pay-bank"
                  >
                    <span>🏦 تحويل بنكي</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={`${groceryList ? 'g-contents ' : ''}flex-1 bg-slate-200/50 dark:bg-slate-900 p-3 overflow-hidden flex flex-col gap-3 transition-colors`}>
          
          {/* شريط أدوات وتصفية المخزون لشبكة المنتجات (POS Products & Stock Toolbar) */}
          <div className={`${groceryList ? 'g-tools flex-wrap ' : 'flex-nowrap '}flex items-center justify-between gap-2.5 bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs`}>
            {groceryActivity && !lockCards && (
              <button type="button" onClick={() => setGroceryShowCards(!groceryShowCards)} data-testid="grocery-toggle"
                title={groceryList ? 'إظهار بطاقات الأصناف' : 'الرجوع لشاشة القائمة'}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-black cursor-pointer">
                {groceryList ? 'بطاقات الأصناف' : 'شاشة القائمة'}
              </button>
            )}
            <button
              type="button"
              onClick={() => guard('products.manage', () => setIsQuickProductOpen(true))}
              title="إضافة صنف جديد من شاشة البيع"
              className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <Plus className="w-3.5 h-3.5" /><span>صنف جديد</span>
            </button>
            <button
              type="button"
              data-testid="edit-item-btn"
              onClick={() => guard('products.manage', () => setEditPickerOpen(true))}
              title="تعديل صنف موجود (بحث أو مسح باركود)"
              className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <PencilLine className="w-3.5 h-3.5" /><span>تعديل صنف</span>
            </button>
            {/* 1. حقل البحث السريع في المنتجات */}
            <div className="g-search relative flex-1 min-w-[9rem] max-w-xs">
              <input
                type="text"
                placeholder="بحث في الأصناف أو الباركود..."
                value={posProductSearch}
                data-testid="pos-product-search"
                onChange={(e) => { setPosProductSearch(e.target.value); setPosSearchOpen(true); }}
                onFocus={() => setPosSearchOpen(true)}
                onBlur={() => setTimeout(() => setPosSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (!searchDropdown) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPosSearchHi(h => Math.min(h + 1, posSearchMatches.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setPosSearchHi(h => Math.max(0, h - 1)); }
                  else if (e.key === 'Escape') { setPosProductSearch(''); setPosSearchOpen(false); }
                  else if (e.key === 'Enter') {
                    e.preventDefault();
                    const pick = posSearchMatches[posSearchHi] || posSearchMatches[0];
                    if (pick) { addToCart(pick); setPosProductSearch(''); }
                  }
                }}
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pr-8 pl-7 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
              />
              {/* القائمة المنسدلة: الضغط على صنف (أو Enter) يضيفه للسلة */}
              {searchDropdown && posSearchOpen && posProductSearch.trim() && (
                <div className="absolute z-40 mt-1 right-0 w-96 max-w-[90vw] max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl" data-testid="pos-search-dropdown">
                  {posSearchMatches.length === 0 && <div className="px-4 py-3 text-sm font-bold text-slate-500">لا يوجد صنف مطابق</div>}
                  {posSearchMatches.map((p, idx) => (
                    <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setPosSearchHi(idx)}
                      onClick={() => { addToCart(p); setPosProductSearch(''); }}
                      className={`w-full px-3 py-2 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0 text-right ${idx === posSearchHi ? 'bg-cyan-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                      <span className="min-w-0">
                        <span className="block font-black text-sm text-slate-900 dark:text-white truncate">{p.nameAr}</span>
                        {p.barcode && <span className="block text-[11px] font-mono font-bold text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>{p.barcode}</span>}
                      </span>
                      {searchShowStock && !p.isService && (() => {
                        const st = Number(p.stock ?? 0);
                        const tone = st <= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : st <= (p.minStock ?? 5) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
                        return <span className={`shrink-0 mr-auto px-2 py-0.5 rounded-lg text-[11.5px] font-black ${tone}`} data-testid="search-stock">متوفر: <span className="font-mono">{+st.toFixed(3)}</span></span>;
                      })()}
                      <span className="font-mono font-black text-sm text-emerald-600 shrink-0 inline-flex items-center gap-0.5">{p.price.toFixed(2)}<SaudiRiyalSymbol className="w-3 h-3" /></span>
                    </button>
                  ))}
                </div>
              )}
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              {posProductSearch && (
                <button
                  type="button"
                  onClick={() => setPosProductSearch('')}
                  className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* عدد الأصناف يبقى في زر «الكل» بجانب فلاتر المخزون */}

            {/* 2. أزرار تصفية حالة المخزون (Stock Status Filter) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 shrink">
              <button
                type="button"
                onClick={() => setPosStockFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  posStockFilter === 'all'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>الكل</span>
                <span className="font-mono text-[10px] opacity-75 font-black">({products.length})</span>
              </button>

              {showStockAlerts && (<>
              <button
                type="button"
                onClick={() => setPosStockFilter('low')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                  posStockFilter === 'low'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                }`}
                title="عرض الأصناف التي قارب مخزونها على الانتهاء (المخزون <= الحد الأدنى)"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-current" />
                <span>مخزون منخفض</span>
                <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-black ${
                  posStockFilter === 'low' ? 'bg-black/20 text-slate-950' : 'bg-amber-500/25 text-amber-800 dark:text-amber-200'
                }`}>
                  {lowStockProductsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPosStockFilter('out')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
                  posStockFilter === 'out'
                    ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-500/50'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                }`}
                title="عرض الأصناف النافدة من المخزون (0 متبقي)"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>نفذ المخزون</span>
                <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-black ${
                  posStockFilter === 'out' ? 'bg-white/20 text-white' : 'bg-rose-500/25 text-rose-800 dark:text-rose-200'
                }`}>
                  {outOfStockProductsCount}
                </span>
              </button>
              </>)}
            </div>

            {/* 3. دليل الألوان وتنبيه المخزون (Legend) */}
            <div className={`${showStockAlerts ? 'hidden 2xl:flex' : 'hidden'} items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 pr-2.5`}>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold" title="إطار ذهبي وأيقونة تحذير تعني المخزون وصل للحد الأدنى أو أقل">
                <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/50 animate-pulse"></span>
                إطار أصفر: منخفض
              </span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold" title="إطار أحمر وأيقونة تنبيه تعني نفاد المخزون بالكامل (0 متبقي)">
                <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/50"></span>
                إطار أحمر: نافد
              </span>
            </div>
          </div>

          {/* شريط المجموعات أُزيل: المجموعات بطاقات في الشبكة نفسها */}
          {/* شبكة المنتجات (POS Products Grid) */}
          <div className={`flex-1 overflow-y-auto bg-transparent pr-1 ${groceryList ? 'hidden' : ''}`}>
            {posShowGroups ? (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 auto-rows-[7.25rem]" data-testid="pos-groups">
                  {posTopPager.visible.map(t => t.kind === 'product' ? posProductCard(t.p) : (
                    <button
                      key={`g:${t.g.key}`}
                      type="button"
                      onClick={() => setActiveCategory(t.g.key)}
                      data-testid="pos-group-card"
                      className="shelf-group group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right p-3 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition"
                      style={{ ['--g' as string]: t.g.color }}
                      title={`${t.g.name} — ${t.g.count} صنف`}
                    >
                      <span aria-hidden className="absolute inset-y-0 right-0 w-1.5" style={{ backgroundColor: t.g.color }} />
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: t.g.color }}>
                        <Layers className="w-6 h-6" />
                      </span>
                      <span className="block">
                        <span className="block font-black text-sm sm:text-[15px] leading-snug text-slate-900 dark:text-white line-clamp-2">{t.g.name}</span>
                        <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{t.g.count} صنف</span>
                      </span>
                    </button>
                  ))}
                </div>
                {posTopTiles.length > posTopPager.pageSize && <Pagination pager={posTopPager} unit="بطاقة" sizes={[24, 30, 48, 60]} />}
              </>
            ) : filteredProducts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white/40 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
                <Package className="w-12 h-12 text-slate-400 mb-2" />
                <p className="font-bold text-slate-700 dark:text-slate-300">لا توجد أصناف مطابقة لخيارات البحث أو التصفية الحالية</p>
                {(posStockFilter !== 'all' || posProductSearch || activeCategory !== 'الكل') && (
                  <button
                    onClick={() => { setPosStockFilter('all'); setPosProductSearch(''); setActiveCategory('الكل'); }}
                    className="mt-3 text-xs text-cyan-600 dark:text-cyan-400 font-bold hover:underline cursor-pointer"
                  >
                    إلغاء التصفية وعرض جميع الأصناف
                  </button>
                )}
              </div>
            ) : (
              <>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 auto-rows-[7.25rem]" data-testid="pos-products">
                {/* داخل المجموعة: أول بطاقة سهم للرجوع للمجموعات (بنفس حجم بطاقة الصنف — أسهل للكاشير) */}
                {activeCategory !== 'الكل' && posVisibleGroups.length > 0 && (() => {
                  const g = posVisibleGroups.find(x => x.key === activeCategory);
                  const color = g?.color || '#2f8f87';
                  return (
                    <button type="button" onClick={() => setActiveCategory('الكل')} data-testid="pos-back-groups" title="الرجوع إلى المجموعات"
                      className="relative overflow-hidden rounded-2xl border-2 text-white flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] transition shadow-sm hover:brightness-110"
                      style={{ backgroundColor: color, borderColor: color }}>
                      <span className="absolute top-1.5 right-2.5 text-[10px] font-bold opacity-80">البداية</span>
                      <ArrowRight className="w-10 h-10" strokeWidth={2.5} />
                      <span className="font-black text-sm leading-tight px-2 text-center line-clamp-2">{activeCategory === UNGROUPED ? 'أصناف أخرى' : activeCategory}</span>
                    </button>
                  );
                })()}
                {posGrid.visible.map((product) => posProductCard(product))}
              </div>
              {filteredProducts.length > posGrid.pageSize && <Pagination pager={posGrid} unit="صنف" sizes={[24, 30, 48, 60]} />}
              </>
            )}
          </div>
        </div>
        {selectedProductForOptions && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md z-40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 text-right animate-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-500 dark:text-cyan-400 shrink-0 shadow-xs overflow-hidden">
                    {selectedProductForOptions.image ? (
                      <img 
                        src={selectedProductForOptions.image} 
                        alt={selectedProductForOptions.nameAr}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Boxes className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">
                        {selectedProductForOptions.nameAr}
                      </h3>
                      {selectedProductForOptions.categoryAr && (
                        <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                          {selectedProductForOptions.categoryAr}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">
                      اختر التعبئة أو المقاس / الحجم المطلوب لإضافته للفاتورة مباشرة
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedProductForOptions(null)} 
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5"/>
                </button>
              </div>

              {/* Sub-bar showing base price & info */}
              <div className="bg-slate-100/70 dark:bg-slate-800/40 px-5 py-2.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                {selectedProductForOptions.sellBaseUnit === false ? (
                  <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-cyan-500" /><span>اختر المقاس / الحجم</span></span>
                ) : (
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-cyan-500" />
                  <span>السعر الأساسي للصنف:</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white inline-flex items-center gap-1">
                    {selectedProductForOptions.price.toFixed(2)}
                    <SaudiRiyalSymbol className="w-3 h-3 text-slate-500" />
                  </span>
                </span>
                )}

                {selectedProductForOptions.barcode && (
                  <span className="text-[11px] font-mono text-slate-400">
                    الباركود: {selectedProductForOptions.barcode}
                  </span>
                )}
              </div>

              {/* Options Grid */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
                
                {/* Base Product Option (when units are configured and none is base) */}
                {selectedProductForOptions.units && selectedProductForOptions.units.length > 0 && selectedProductForOptions.sellBaseUnit !== false && !selectedProductForOptions.units.some(u => u.price === selectedProductForOptions.price && (u.factor === 1 || !u.factor)) && (
                  <button 
                    onClick={() => addToCart(selectedProductForOptions, { 
                      id: 'base', 
                      name: 'حبة فردي (الأساسي)', 
                      price: selectedProductForOptions.price,
                      unitType: 'unit',
                      factor: 1
                    })} 
                    className="p-4 bg-white dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-2xl flex flex-col justify-between gap-3 group transition-all text-right hover:shadow-lg cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-black text-sm text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors block">
                            حبة فردي (الأساسي)
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            الوحدة الافتراضية • 1 قطعة
                          </span>
                        </div>
                      </div>
                      <span className="text-[9.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                        أساسي
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-[10px] text-slate-400 font-bold">السعر:</span>
                      <span className="font-mono font-black text-base text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                        <span>{selectedProductForOptions.price.toFixed(2)}</span>
                        <SaudiRiyalSymbol className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </span>
                    </div>
                  </button>
                )}

                {/* Units List */}
                {selectedProductForOptions.units?.map(unit => {
                  const getUnitIconAndBadge = () => {
                    const t = unit.unitType || '';
                    const n = unit.name.toLowerCase();
                    if (t === 'flavor') return { icon: <Sparkles className="w-4 h-4 text-rose-500" />, badge: 'نوع / إضافة', color: 'rose' };
                    if (t === 'size' || n.includes('صغير') || n.includes('وسط') || n.includes('كبير') || n.includes('مقاس') || n.includes('سنجل') || n.includes('دبل')) {
                      return { icon: <Ruler className="w-4 h-4 text-blue-500" />, badge: 'مقاس', color: 'blue' };
                    }
                    if (t === 'volume' || n.includes('مل') || n.includes('لتر') || n.includes('سعة') || n.includes('كوب') || n.includes('جالون')) {
                      return { icon: <Maximize2 className="w-4 h-4 text-emerald-500" />, badge: 'حجم / سعة', color: 'emerald' };
                    }
                    if (t === 'pack' || n.includes('كرتون') || n.includes('شدة') || n.includes('علبة') || n.includes('باكت') || n.includes('صندوق')) {
                      return { icon: <Boxes className="w-4 h-4 text-purple-500" />, badge: 'عبوة / كرتون', color: 'purple' };
                    }
                    if (t === 'weight' || n.includes('كيلو') || n.includes('جم') || n.includes('وزن')) {
                      return { icon: <Sliders className="w-4 h-4 text-amber-500" />, badge: 'وزن', color: 'amber' };
                    }
                    return { icon: <Package className="w-4 h-4 text-cyan-500" />, badge: 'تعبئة', color: 'cyan' };
                  };

                  const meta = getUnitIconAndBadge();
                  // «العنوان فقط»: لا مقارنة بسعر أساسي غير موجود
                  const priceDiff = selectedProductForOptions.sellBaseUnit === false ? 0 : unit.price - selectedProductForOptions.price;

                  return (
                    <button 
                      key={unit.id} 
                      onClick={() => addToCart(selectedProductForOptions, { 
                        id: unit.id, 
                        name: unit.name, 
                        price: unit.price,
                        unitType: unit.unitType,
                        factor: unit.factor
                      })} 
                      className="p-4 bg-white dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 hover:border-cyan-500 dark:hover:border-cyan-400 rounded-2xl flex flex-col justify-between gap-3 group transition-all text-right hover:shadow-lg cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            {meta.icon}
                          </div>
                          <div>
                            <span className="font-black text-sm text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors block">
                              {unit.name}
                            </span>
                            {unit.factor && unit.factor > 1 && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                تحتوي على {unit.factor} قطعة
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-[9.5px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full shrink-0">
                          {meta.badge}
                        </span>
                      </div>

                      {unit.barcode && (
                        <div className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md inline-block self-start">
                          باركود: {unit.barcode}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        {/* Price Difference Indicator */}
                        <div>
                          {priceDiff > 0 ? (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                              +{priceDiff.toFixed(2)} ﷼
                            </span>
                          ) : priceDiff < 0 ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                              -{Math.abs(priceDiff).toFixed(2)} ﷼
                            </span>
                          ) : selectedProductForOptions.sellBaseUnit === false ? null : (
                            <span className="text-[10px] text-slate-400">
                              السعر الأساسي
                            </span>
                          )}
                        </div>

                        {/* Price */}
                        <span className="font-mono font-black text-base text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                          <span>{unit.price.toFixed(2)}</span>
                          <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Variants List (fallback if no units configured) */}
                {(!selectedProductForOptions.units || selectedProductForOptions.units.length === 0) && selectedProductForOptions.variants?.map(variant => {
                  const priceDiff = variant.price - selectedProductForOptions.price;

                  return (
                    <button 
                      key={variant.id} 
                      onClick={() => addToCart(selectedProductForOptions, { 
                        id: variant.id, 
                        name: variant.name, 
                        price: variant.price,
                        unitType: 'size'
                      })} 
                      className="p-4 bg-white dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 hover:border-cyan-500 dark:hover:border-cyan-400 rounded-2xl flex flex-col justify-between gap-3 group transition-all text-right hover:shadow-lg cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Ruler className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-black text-sm text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors block">
                              {variant.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              خيار / مقاس الصنف
                            </span>
                          </div>
                        </div>

                        <span className="text-[9.5px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full shrink-0">
                          مقاس
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div>
                          {priceDiff > 0 ? (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                              +{priceDiff.toFixed(2)} ﷼
                            </span>
                          ) : priceDiff < 0 ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                              -{Math.abs(priceDiff).toFixed(2)} ﷼
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              السعر الأساسي
                            </span>
                          )}
                        </div>

                        <span className="font-mono font-black text-base text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                          <span>{variant.price.toFixed(2)}</span>
                          <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        </span>
                      </div>
                    </button>
                  );
                })}

              </div>

              {/* Footer Tip */}
              <div className="bg-slate-50 dark:bg-slate-950 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>يمكن مسح باركود التعبئة مباشرة بالماسح لإدراجها فوراً دون فتح النافذة.</span>
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedProductForOptions(null)}
                  className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Modal: واجهة تطبيق الخصم على الفاتورة (مبلغ مالي ثابت أو نسبة مئوية) */}
        <DiscountModal
          isOpen={isDiscountModalOpen}
          onClose={() => setIsDiscountModalOpen(false)}
          rawSubtotal={rawSubtotal}
          taxRatePercent={companySettings.taxRate ?? 15}
          initialType={discountType}
          initialValue={discountValue}
          initialScope={discountScope}
          validate={(type, val, scope) => checkDiscount(discountRules, { type, value: val, scope, rawSubtotal, rawTotalWithTax })}
          onApplyDiscount={(type, val, scope) => {
            setDiscountType(type);
            setDiscountValue(val);
            setDiscountScope(scope);
            if (val > 0) {
              triggerPrintNotification(
                type === 'fixed'
                  ? `تم تطبيق خصم بقيمة مالية ثابتة ${val} ﷼ ${scope === 'total' ? 'على إجمالي الفاتورة' : 'قبل الضريبة'}`
                  : `تم تطبيق خصم ${val}% على الفاتورة`
              );
            }
          }}
          onClearDiscount={() => {
            setDiscountValue(0);
            triggerPrintNotification('تم إلغاء وتصفير خصم الفاتورة');
          }}
        />

        {/* Modal 1: تعليق وحفظ الطلب الحالي (Park Order Modal) */}
        {isParkModalOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsParkModalOpen(false);
            }}
          >
            <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <div className="bg-amber-500 text-slate-950 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2 font-black text-base">
                  <PauseCircle className="w-5 h-5" />
                  <span>تعليق وحفظ الطلب مؤقتاً (Park Order)</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsParkModalOpen(false)}
                  className="p-1 hover:bg-black/10 rounded-lg transition cursor-pointer"
                  title="إغلاق النافذة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmParkOrder} className="p-5 space-y-4">
                {/* Summary Info Box */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold space-y-1.5">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>عدد أصناف السلة:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{cart.length} أصناف ({cart.reduce((s, i) => s + i.qty, 0)} قطعة)</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>الإجمالي المستحق:</span>
                    <span className="font-mono font-black text-cyan-600 dark:text-cyan-400 text-sm inline-flex items-center gap-1">{calculatedTotal.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 inline-block align-middle" /></span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>الخصم المطبق:</span>
                      <span className="font-mono font-bold">- {discountAmount.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 inline-block align-middle" /> ({discountType === 'percent' ? `${cleanDiscountVal}%` : 'ثابت'})</span>
                    </div>
                  )}
                </div>

                {/* Input: Label */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    عنوان أو مسمى الطلب المعلق
                  </label>
                  <input
                    type="text"
                    value={parkOrderLabel}
                    onChange={(e) => setParkOrderLabel(e.target.value)}
                    placeholder="اسم مختصر للطلب المعلق"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    autoFocus
                  />
                </div>

                {/* Input: Customer Name or Table */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    اسم العميل أو رقم الطاولة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={parkOrderCustomer}
                    onChange={(e) => setParkOrderCustomer(e.target.value)}
                    placeholder="اسم العميل أو ملاحظة تعريفية"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Input: Note */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    ملاحظة على الطلب (اختياري)
                  </label>
                  <input
                    type="text"
                    value={parkOrderNote}
                    onChange={(e) => setParkOrderNote(e.target.value)}
                    placeholder="مثال: العميل سيعود بعد 5 دقائق لإكمال الشراء"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Input: Expected Return / Delivery Time & Due Date */}
                <div className="bg-amber-500/5 dark:bg-slate-900/60 p-3 rounded-xl border border-amber-500/20 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>موعد العودة أو الاستلام المتوقع (Due Date / Pickup Time)</span>
                    </label>
                    {(parkOrderDueTime || parkOrderDueDate) && (
                      <button
                        type="button"
                        onClick={clearParkDue}
                        className="text-[11px] text-rose-500 hover:text-rose-600 font-bold transition cursor-pointer"
                      >
                        مسح الموعد
                      </button>
                    )}
                  </div>

                  {/* Quick Preset Buttons for Cashier */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-slate-400 font-bold ml-1">اختيار سريع:</span>
                    {[
                      { label: '+10 دقائق', mins: 10 },
                      { label: '+15 دقيقة', mins: 15 },
                      { label: '+30 دقيقة', mins: 30 },
                      { label: '+1 ساعة', mins: 60 },
                      { label: '+2 ساعة', mins: 120 },
                    ].map((preset) => (
                      <button
                        key={preset.mins}
                        type="button"
                        onClick={() => applyQuickDueMinutes(preset.mins)}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 transition cursor-pointer active:scale-95"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Date and Time Inputs */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        تاريخ الاستلام (Due Date):
                      </span>
                      <DateField value={parkOrderDueDate}
                        onChange={(v) => setParkOrderDueDate(v)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        وقت العودة (Pickup Time):
                      </span>
                      <input
                        type="time"
                        value={parkOrderDueTime}
                        onChange={(e) => setParkOrderDueTime(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {parkOrderDueTime && (
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 font-bold bg-amber-500/15 px-2.5 py-1.5 rounded-lg border border-amber-500/30 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        <span>الموعد المحدد للعودة:</span>
                      </span>
                      <span className="font-mono font-black">{formatDueDateTime(parkOrderDueDate, parkOrderDueTime)}</span>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                  💡 سيتم تفريغ السلة الحالية والبدء في طلب جديد للعميل التالي، ويمكنك استرجاع هذا الطلب لاحقاً بنقرة زر واحدة.
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleQuickParkOrder()}
                    className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title="تعليق الطلب مباشرة بالبيانات الافتراضية بدون ملء الحقول"
                  >
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>تعليق فوري وسريع (بدون تفاصيل إضافية)</span>
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleConfirmParkOrder(e)}
                      className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد وحفظ الطلب المعلق</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsParkModalOpen(false)}
                      className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal 2: إدارة واسترجاع الطلبات المعلقة (Parked Orders List) */}
        {isParkedOrdersModalOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsParkedOrdersModalOpen(false);
            }}
          >
            <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="bg-slate-900 dark:bg-black text-white p-4 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-base">الطلبات المعلقة (Parked Orders)</h3>
                      <span className="bg-amber-500 text-slate-950 text-xs font-black font-mono px-2 py-0.5 rounded-full">
                        {parkedOrders.length} طلبات
                      </span>
                      {overdueParkedOrdersCount > 0 && (
                        <span className="bg-rose-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <AlertCircle className="w-3 h-3" />
                          <span>{overdueParkedOrdersCount} طلب متأخر عن الموعد!</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">استرجاع سلة المشتريات المعلقة للكاشير أو متابعة مواعيد عودة العملاء</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsParkedOrdersModalOpen(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {parkedOrders.length === 0 ? (
                  <div className="py-14 text-center space-y-3">
                    <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-2xl flex items-center justify-center">
                      <Clock className="w-8 h-8 opacity-60" />
                    </div>
                    <h4 className="font-black text-slate-700 dark:text-slate-300 text-base">لا توجد أي طلبات معلقة حالياً</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      يمكنك تعليق أي طلب نشط في السلة بالضغط على زر <span className="font-bold text-amber-500">"تعليق الطلب (Park)"</span> عند رغبة العميل بالانتظار أو إحضار سلع أخرى.
                    </p>
                  </div>
                ) : (
                  parkedOrders.map((order) => (
                    <div 
                      key={order.id}
                      className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 transition-all hover:border-amber-500/40 shadow-sm"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center font-mono font-black text-xs">
                            #{order.orderNumber}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-sm text-slate-900 dark:text-white">{order.label}</h4>
                              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                                تعليق: {order.createdAt}
                              </span>
                              {(order.dueTime || order.dueDate) && (() => {
                                const dueStatus = getDueStatus(order.dueDate, order.dueTime);
                                const formattedDue = formatDueDateTime(order.dueDate, order.dueTime);
                                
                                if (dueStatus.status === 'overdue') {
                                  return (
                                    <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                                      <AlertCircle className="w-3 h-3 text-rose-500" />
                                      <span>العودة المتوقعة: <strong className="font-mono">{formattedDue}</strong></span>
                                      <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-mono font-black">({dueStatus.text})</span>
                                    </span>
                                  );
                                } else if (dueStatus.status === 'soon') {
                                  return (
                                    <span className="text-[11px] font-black text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-amber-500" />
                                      <span>العودة المتوقعة: <strong className="font-mono">{formattedDue}</strong></span>
                                      <span className="text-[9px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono font-black">({dueStatus.text})</span>
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="text-[11px] font-bold text-cyan-700 dark:text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-cyan-500" />
                                      <span>العودة المتوقعة: <strong className="font-mono">{formattedDue}</strong></span>
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>العميل: <strong className="text-slate-700 dark:text-slate-300">{order.customerName || 'نقدي'}</strong></span>
                              {order.note && (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">• {order.note}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Pricing & Item Count */}
                        <div className="text-left font-mono" dir="ltr">
                          <span className="text-base font-black text-cyan-600 dark:text-cyan-400 block">
                            {order.total.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-400 inline-block align-middle" />
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans block">
                            {order.items.length} أصناف ({order.items.reduce((s, i) => s + i.qty, 0)} قطعة)
                            {order.discountAmount > 0 && (
                              <span className="text-amber-500 font-bold mr-1">
                                (خصم {order.discountType === 'percent' ? `${order.discountValue}%` : `${order.discountAmount.toFixed(2)} ﷼`})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Items Preview Chips */}
                      <div className="py-2.5 flex flex-wrap gap-1.5 items-center">
                        {order.items.slice(0, 4).map((it, idx) => (
                          <span 
                            key={idx}
                            className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300 font-medium"
                          >
                            {it.name} <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">×{it.qty}</span>
                          </span>
                        ))}
                        {order.items.length > 4 && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold bg-slate-200/60 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            +{order.items.length - 4} أصناف أخرى
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleRequestRestore(order)}
                          className="flex-1 py-2.5 bg-gradient-to-l from-emerald-500 to-green-600 hover:from-emerald-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>استرجاع الطلب إلى السلة الحالية</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewParkedOrder(order)}
                          className="px-3.5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition border border-slate-300 dark:border-slate-700"
                          title="معاينة تفاصيل الأصناف"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>معاينة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteParkedOrder(order.id)}
                          className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition border border-rose-200 dark:border-rose-900/50"
                          title="حذف هذا الطلب المعلق نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-3 bg-slate-100 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-500">
                  إجمالي الطلبات المعلقة: <strong className="text-slate-900 dark:text-white font-mono">{parkedOrders.length}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsParkedOrdersModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 3: تأكيد استرجاع الطلب عند وجود سلة نشطة */}
        {orderToRestore && (
          <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOrderToRestore(null);
            }}
          >
            <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 space-y-4 text-right">
              <div className="flex items-center gap-3 text-amber-500">
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">السلة الحالية غير فارغة!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">توجد أصناف مسبقة في سلة المبيعات</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 font-bold">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>السلة الحالية:</span>
                  <span className="font-mono text-slate-900 dark:text-white">{cart.length} أصناف ({calculatedTotal.toFixed(2)} ﷼)</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>الطلب المراد استرجاعه:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">{orderToRestore.label} ({orderToRestore.total.toFixed(2)} ﷼)</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 font-bold">
                كيف ترغب في معالجة السلة الحالية مع الطلب المعلق المسترجع؟
              </p>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => executeRestore(orderToRestore, 'replace')}
                  className="py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>استبدال السلة الحالية بالطلب المسترجع بالكامل</span>
                </button>

                <button
                  type="button"
                  onClick={() => executeRestore(orderToRestore, 'merge')}
                  className="py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>دمج أصناف الطلبين معاً في سلة واحدة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderToRestore(null)}
                  className="py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  إلغاء الاسترجاع والاحتفاظ بالسلة الحالية
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 4: تفاصيل ومعاينة الطلب المعلق */}
        {previewParkedOrder && (
          <div 
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPreviewParkedOrder(null);
            }}
          >
            <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]">
              <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-black text-sm">تفاصيل: {previewParkedOrder.label}</h4>
                </div>
                <button 
                  type="button"
                  onClick={() => setPreviewParkedOrder(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">
                  <div>العميل: <strong className="text-slate-800 dark:text-slate-200">{previewParkedOrder.customerName || 'نقدي'}</strong></div>
                  <div>وقت التعليق: <span className="font-mono text-slate-800 dark:text-slate-200">{previewParkedOrder.createdAt}</span></div>
                  {(previewParkedOrder.dueTime || previewParkedOrder.dueDate) && (
                    <div className="col-span-2 flex items-center justify-between text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>موعد العودة / الاستلام المتوقع:</span>
                        <strong className="font-mono font-black">{formatDueDateTime(previewParkedOrder.dueDate, previewParkedOrder.dueTime)}</strong>
                      </div>
                      {(() => {
                        const st = getDueStatus(previewParkedOrder.dueDate, previewParkedOrder.dueTime);
                        if (st.status === 'overdue') {
                          return <span className="text-[10px] bg-rose-500 text-white font-mono px-1.5 py-0.5 rounded font-black animate-pulse">{st.text}</span>;
                        } else if (st.status === 'soon') {
                          return <span className="text-[10px] bg-amber-500 text-slate-950 font-mono px-1.5 py-0.5 rounded font-black">{st.text}</span>;
                        }
                        return null;
                      })()}
                    </div>
                  )}
                  {previewParkedOrder.note && (
                    <div className="col-span-2 text-amber-600 dark:text-amber-400">ملاحظة: {previewParkedOrder.note}</div>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-12 gap-1 bg-slate-100 dark:bg-slate-900 p-2 font-black text-slate-600 dark:text-slate-400 text-center">
                    <div className="col-span-6 text-right pr-2">الصنف</div>
                    <div className="col-span-2">السعر</div>
                    <div className="col-span-2">الكمية</div>
                    <div className="col-span-2">المجموع</div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                    {previewParkedOrder.items.map((it, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1 p-2 text-center text-slate-800 dark:text-slate-200 items-center">
                        <div className="col-span-6 text-right pr-2">{it.name}</div>
                        <div className="col-span-2 font-mono">{it.price.toFixed(2)}</div>
                        <div className="col-span-2 font-mono">{it.qty}</div>
                        <div className="col-span-2 font-mono font-black">{it.total.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 text-xs font-bold">
                  <div className="flex justify-between">
                    <span>المجموع قبل الخصم:</span>
                    <span className="font-mono inline-flex items-center gap-1">{previewParkedOrder.rawSubtotal.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 inline-block align-middle" /></span>
                  </div>
                  {previewParkedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-amber-500">
                      <span>الخصم{previewParkedOrder.discountType === 'percent' ? ` (${previewParkedOrder.discountValue}%)` : ''}:</span>
                      <span className="font-mono font-black inline-flex items-center gap-1">- {previewParkedOrder.discountAmount.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 inline-block align-middle" /></span>
                    </div>
                  )}
                  <div className={`flex justify-between text-rose-500 ${taxRate > 0 ? '' : 'hidden'}`}>
                    <span>الضريبة ({companySettings.taxRate}%):</span>
                    <span className="font-mono inline-flex items-center gap-1">{previewParkedOrder.tax.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 text-rose-400 inline-block align-middle" /></span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400">
                    <span>الإجمالي المستحق:</span>
                    <span className="font-mono inline-flex items-center gap-1">{previewParkedOrder.total.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-400 inline-block align-middle" /></span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const ord = previewParkedOrder;
                    setPreviewParkedOrder(null);
                    handleRequestRestore(ord);
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>استرجاع هذا الطلب الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewParkedOrder(null)}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: تنبيه استرجاع الباقي للعميل (Cash Change Due) */}
        {lastCashChange && (
          <div 
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in zoom-in-95"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLastCashChange(null);
            }}
          >
            <div className="bg-white dark:bg-slate-800 border-2 border-emerald-500 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center text-slate-800 dark:text-white relative overflow-hidden" dir="rtl">
              {/* Top Accent Strip */}
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />
              
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5 text-right">
                  <div className="p-2.5 bg-emerald-500/15 text-emerald-500 rounded-2xl shadow-inner">
                    <Zap className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      {lastCashChange.splitCard ? 'تم الدفع المقسّم (نقدي + شبكة)' : lastCashChange.isQuickPay ? 'تم الدفع السريع بنجاح (Quick Pay)' : 'تم إتمام الدفع النقدي'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      فاتورة: #{lastCashChange.invoiceNumber} • {lastCashChange.timestamp}
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setLastCashChange(null)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Big Prominent Cash Change Box */}
              <div className="bg-gradient-to-b from-emerald-50 to-emerald-100/50 dark:from-emerald-950/60 dark:to-emerald-900/40 border-2 border-emerald-500/60 rounded-2xl p-5 shadow-inner">
                <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 mb-1 flex items-center justify-center gap-1.5">
                  <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>المبلغ المتبقي للعميل (الباقي)</span>
                </div>
                <div className="text-4xl sm:text-5xl font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight my-1 inline-flex items-center justify-center gap-2">
                  <span>{lastCashChange.changeAmount.toFixed(2)}</span>
                  <SaudiRiyalSymbol className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold mt-1">
                  {lastCashChange.changeAmount > 0 ? '👈 يرجى تسليم هذا الباقي للعميل فوراً' : '✨ تم استلام المبلغ بالضبط - لا يوجد باقي'}
                </p>
              </div>

              {/* Summary breakdown: Total vs Paid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-right">
                  <span className="text-slate-500 dark:text-slate-400 block mb-0.5 text-[11px]">{lastCashChange.splitCard ? 'الجزء النقدي المطلوب:' : 'إجمالي الفاتورة:'}</span>
                  <span className="font-mono text-base font-black text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                    {lastCashChange.total.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 inline-block align-middle" />
                  </span>
                  {lastCashChange.splitCard ? <span className="block mt-1 text-[11px] text-indigo-600 dark:text-indigo-300" data-testid="change-split-card">+ شبكة: <b className="font-mono">{lastCashChange.splitCard.toFixed(2)}</b></span> : null}
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-right">
                  <span className="text-slate-500 dark:text-slate-400 block mb-0.5 text-[11px]">المبلغ المستلم كاش:</span>
                  <span className="font-mono text-base font-black text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
                    {lastCashChange.paidAmount.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 inline-block align-middle" />
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLastCashChange(null)}
                  className="flex-1 py-3 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95 transition"
                  autoFocus
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>تم تسليم الباقي (عميل جديد)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const devicesPanel = (only: 'drawer' | 'displayScale') => (
              <DevicesSettings
                only={only}
                devices={deviceSettings}
                setDevices={(u) => setDeviceSettings((p) => u({ ...DEFAULT_DEVICE_SETTINGS, ...p }))}
                scale={scaleSettings}
                setScale={(u) => setScaleSettings((p) => u({ ...DEFAULT_SCALE_SETTINGS, ...p }))}
                scaleStatus={scaleStatus}
                vfdStatus={vfdStatus}
                onTestVfd={() => {
                  if (!devicesApi?.vfdWrite) { triggerPrintNotification('شاشة VFD متاحة في النسخة المكتبية فقط'); return; }
                  if (!vfdStatus.connected) { triggerPrintNotification(`الشاشة غير متصلة على ${vfdCfg.port}${vfdStatus.reason ? ` — ${vfdStatus.reason}` : ''}`, 6000); return; }
                  void devicesApi.vfdWrite(vfdFrame(vfdLine('TEST OK', '123.45', vfdCfg.columns), vfdLine('TOTAL', '123.45', vfdCfg.columns), vfdCfg));
                  triggerPrintNotification('أُرسل نص تجريبي إلى شاشة العميل');
                }}
                liveWeight={liveWeight}
                onTestDrawer={() => void openCashDrawer()}
                onTestDisplay={async () => {
                  if (!devicesApi) { triggerPrintNotification('شاشة العميل متاحة في النسخة المكتبية فقط'); return; }
                  if (!deviceSettings.customerDisplay) setDeviceSettings((p) => ({ ...DEFAULT_DEVICE_SETTINGS, ...p, customerDisplay: true }));
                  await devicesApi.displayClose();
                  const r = await devicesApi.displayOpen();
                  triggerPrintNotification(r.secondary ? 'تم فتح شاشة العميل على الشاشة الثانية' : 'لا توجد شاشة ثانية — فُتحت نافذة تجريبية');
                }}
              />
  );

  const renderDashboardView = () => {
    switch (currentView) {
      case 'quotations':
        return (
          <QuotationsManager
            invoicePreviewPaper={previewTemplate === 'thermal80' ? 'thermal' : (printSettings.dotMatrix ? printSettings.dotMatrixPaper === 'A5' : printSettings.largePaper === 'A5') ? 'A5' : 'A4'}
            discountRules={discountRules}
            quotations={quotations}
            setQuotations={setQuotations}
            canWrite={requireLicense}
            peekNumber={() => peekDocNumber('QT')}
            allocateNumber={() => allocateDocNumber('QT')}
            customers={customers}
            onAddCustomer={(d) => { const nc: Customer = { id: `cust-${Date.now()}`, balance: 0, ...d }; setCustomers(prev => [...prev, nc]); return nc; }}
            products={products}
            groups={productGroups}
            onAddProduct={!currentUser || can(currentUser, 'products.manage') ? ((np) => setProducts(prev => [np, ...prev])) : undefined}
            onUpdateProduct={!currentUser || can(currentUser, 'products.manage') ? ((p) => setProducts(prev => prev.map(x => x.id === p.id ? p : x))) : undefined}
            taxRatePercent={companySettings.taxRate ?? 15}
            pricesIncludeTax={pricesIncludeTax}
            company={{
              name: companySettings.companyName,
              nameEn: companySettings.companyNameEn,
              vat: companySettings.vatNumber,
              address: companySettings.address,
              shortAddress: companySettings.shortAddress,
              phone: companySettings.phone,
              mobile: companySettings.mobile,
              logoUrl: companySettings.logoUrl,
              footerInfo: companySettings.footerCompanyInfo,
            }}
            printSettings={printSettings}
            onChangePrintSettings={setPrintSettings}
            afterSaleMode={afterSaleMode}
            notify={triggerPrintNotification}
            onConvert={handleConvertQuotation}
            scan={quoteScan}
          />
        );

      case 'stats':
        return <SalesStatsView invoices={invoices} products={products} groups={productGroups} />;

      case 'dailyReports':
        return (
          <ReportsView
            invoices={invoices}
            products={products}
            purchases={purchases}
            purchaseReturns={purchaseReturns}
            groups={productGroups}
            customers={customers}
            company={{ name: companySettings.companyName, nameEn: companySettings.companyNameEn, vat: companySettings.vatNumber, address: companySettings.address, shortAddress: companySettings.shortAddress }}
            printSettings={printSettings}
            notify={triggerPrintNotification}
            tobaccoEnabled={!!companySettings.tobaccoFee?.enabled}
            cashMovements={cashMovements}
            zReports={zClosings}
          />
        );

      case 'dailyClosing':
        return (
          <ZReportManager 
            invoices={invoices}
            settings={companySettings}
            currentUser={currentUser || undefined}
            cashierName={cashierDisplayName}
            canCloseDaily={!currentUser || can(currentUser, 'reports.close')}
            canCloseShift={!!currentUser && can(currentUser, 'pos.closeShift')}
            onPrintZReport={(record) => {
              setCloseSignal(record.cutoff || record.closedAt || localTimestamp());
              setPrintZReportData(record);
              triggerPrintNotification(`جاري إرسال تقرير Z #${record.reportNumber} إلى طابعة الكاشير...`);
            }}
            onNotify={(msg) => triggerPrintNotification(msg)}
            cashMovements={cashMovements}
            onCashDiff={(m) => { saveUrgently(); setCashMovements((prev) => [m, ...prev]); }}
            onShiftClosed={() => { if (restOpts.resetOnClosing && orderCounter) { setOrderCounter(0); triggerPrintNotification('تم تصفير رقم الطلبات — يبدأ الطلب التالي من 1', 4000); } }}
          />
        );

      case 'cashBox':
        return (
          <CashBoxManager
            movements={cashMovements}
            invoices={invoices}
            cashierName={cashierDisplayName}
            currency={cur.baseIsRiyal ? "ريال" : (cur.base.symbol || cur.baseCode)}
            floatEnabled={cashFloat.enabled}
            canWrite={!currentUser || can(currentUser, 'cash.manage')}
            canDelete={!currentUser || can(currentUser, 'cash.delete')}
            onAdd={(m) => { saveUrgently(); setCashMovements((prev) => [m, ...prev]); }}
            onDelete={(id) => { saveUrgently(); setCashMovements((prev) => prev.filter((x) => x.id !== id)); }}
            onEdit={(m) => { saveUrgently(); setCashMovements((prev) => prev.map((x) => (x.id === m.id ? m : x))); }}
            notify={(msg) => triggerPrintNotification(msg)}
          />
        );

      case 'salesLog':
      case 'invoices':
      case 'creditInvoices':
        return (
          <InvoicesList 
            creditOnly={currentView === 'creditInvoices'}
            key={currentView === 'creditInvoices' ? 'inv-credit' : 'inv-all'}
            invoices={invoices} 
            onNewInvoice={canView(currentUser, 'pos') ? () => setCurrentView('pos') : undefined}
            onPayInvoice={(id, amount, method) => guard('invoices.collect', () => handlePayInvoice(id, amount, method))}
            onCreateReturn={(id, req) => { if (requireLicense()) guard('sales.return', () => handleCreateReturn(id, req)); }}
            onViewInvoice={(invoice) => setSelectedInvoiceForModal(invoice)} 
            onPrintInvoice={(invoice, currCode) => openInvoicePrint(invoice, 'print', undefined, currCode, true)}
            onPdfInvoice={(invoice, currCode) => openInvoicePrint(invoice, 'pdf', 'A4', currCode, true)}
            multiCurrencySettings={companySettings.multiCurrency}
            scan={invoiceScan}
            notify={triggerPrintNotification}
          />
        );

      case 'barcodeLabels':
      case 'products':
        return (
          <ProductsManager 
            expiryWarnDays={expirySettings.warnDays}
            products={products}
            groups={productGroups}
            printers={printersList}
            key={currentView === 'barcodeLabels' ? 'pm-barcode' : 'pm-products'}
            initialTab="products"
            initialCodeFilter={currentView === 'products' ? productsInitFilter : undefined}
            tobaccoEnabled={!!companySettings.tobaccoFee?.enabled}
            openBarcode={currentView === 'barcodeLabels'}
            onBarcodeClose={() => setCurrentView('products')}
            onAddProduct={(newProd) => setProducts(prev => [newProd, ...prev])}
            onUpdateProduct={(id, updated) => setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))}
            onDeleteProduct={handleDeleteProduct}
            onDeleteProducts={handleDeleteProducts}
            getDeleteBlockReason={getProductDeleteBlockReason}
            pricesIncludeTax={pricesIncludeTax}
            onAddGroup={handleAddGroup}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onImportProducts={handleImportProducts}
            notify={triggerPrintNotification}
            barcodePrint={{ printSettings, onChangePrintSettings: setPrintSettings, companyName: companySettings.companyName, taxRatePercent: companySettings.taxRate ?? 15, pricesIncludeTax }}
          />
        );

      case 'promotions':
        return (
          <PromotionsManager
            promotions={promotions}
            setPromotions={setPromotions}
            products={products}
            groups={productGroups}
            pricesIncludeTax={pricesIncludeTax}
            notify={triggerPrintNotification}
          />
        );

      case 'productGroups':
        return (
          <ProductsManager 
            expiryWarnDays={expirySettings.warnDays}
            products={products}
            groups={productGroups}
            printers={printersList}
            key="pm-groups"
            initialTab="groups"
            tobaccoEnabled={!!companySettings.tobaccoFee?.enabled}
            onAddProduct={(newProd) => setProducts(prev => [newProd, ...prev])}
            onUpdateProduct={(id, updated) => setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))}
            onDeleteProduct={handleDeleteProduct}
            onDeleteProducts={handleDeleteProducts}
            getDeleteBlockReason={getProductDeleteBlockReason}
            pricesIncludeTax={pricesIncludeTax}
            onAddGroup={handleAddGroup}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onImportProducts={handleImportProducts}
            notify={triggerPrintNotification}
            barcodePrint={{ printSettings, onChangePrintSettings: setPrintSettings, companyName: companySettings.companyName, taxRatePercent: companySettings.taxRate ?? 15, pricesIncludeTax }}
          />
        );

      case 'inventory':
        return (
          <InventoryManager 
            products={stockProducts}
            onUpdateStock={(prodId, newStock) => {
              setProducts(prev => prev.map(p => p.id === prodId ? { ...p, stock: newStock } : p));
              triggerPrintNotification('تم تحديث رصيد المخزون بنجاح');
            }}
            onUpdateCost={(id, cost) => {
              setProducts(prev => prev.map(p => (p.id === id ? { ...p, cost } : p)));
              triggerPrintNotification('تم تحديث سعر التكلفة');
            }}
            onApplyCount={(entries) => {
              saveUrgently();
              const m = new Map(entries.map(e => [e.id, e.stock]));
              setProducts(prev => prev.map(p => (m.has(p.id) ? { ...p, stock: m.get(p.id)! } : p)));
              triggerPrintNotification(`تم اعتماد الجرد — تحديث رصيد ${entries.length} صنف`);
            }}
            companySettings={companySettings}
            expiryWarnDays={expirySettings.warnDays}
            onUpdateExpiry={(id, d) => setProducts(prev => prev.map(p => (p.id === id ? { ...p, expiryDate: d } : p)))}
            onRecordDamage={(id, qty, note) => {
              const name = products.find(p => p.id === id)?.nameAr || '';
              setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: Math.max(0, round2((p.stock || 0) - qty)), damaged: round2((p.damaged || 0) + qty), damageLog: [...(p.damageLog || []), { date: localTimestamp(), qty, cost: p.cost || 0, ...(note ? { note } : {}) }].slice(-200) } : p)));
              triggerPrintNotification(`تم تسجيل ${qty} تالف من «${name}» وخصمها من الرصيد`);
            }}
          />
        );

      case 'customers':
        return (
          <CustomersManager 
            customers={customers}
            onAddCustomer={(newCust) => setCustomers(prev => [...prev, newCust])}
            onUpdateCustomer={(id, updated) => setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))}
            onDeleteCustomer={(id) => setCustomers(prev => prev.filter(c => c.id !== id))}
            deleteBlockReason={customerDeleteBlockReason}
            onRecordPayment={handleRecordCustomerPayment}
          />
        );

      case 'suppliers':
        return (
          <SuppliersManager 
            suppliers={suppliers}
            onAddSupplier={(newSup) => setSuppliers(prev => [...prev, newSup])}
            onUpdateSupplier={(id, updated) => setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))}
            onDeleteSupplier={(id) => setSuppliers(prev => prev.filter(s => s.id !== id))}
          />
        );

      case 'purchases':
        return (
          <PurchasesManager 
            purchases={purchases}
            taxRatePercent={companySettings.taxRate ?? 15}
            costMethod={costMethod}
            companyVatRegistered={!vatUnregistered}
            salePricesIncludeTax={pricesIncludeTax}
            onUpdateSalePrices={(fixes) => {
              saveUrgently();
              setProducts(prev => prev.map(p => {
                const mine = fixes.filter(x => x.productId === p.id);
                if (!mine.length) return p;
                const base = mine.find(x => !x.unitId);
                return { ...p, price: base ? base.price : p.price, units: p.units?.map(u => { const fx = mine.find(x => x.unitId === u.id); return fx ? { ...u, price: fx.price } : u; }) };
              }));
            }}
            onPrintLabels={(p) => setPurchaseLabels(p)}
            products={products}
            groups={productGroups}
            suppliers={suppliers}
            notify={triggerPrintNotification}
            onAddProduct={(np) => setProducts(prev => [np, ...prev])}
            onAddPurchase={(newPur, extras) => {
              if (!requireLicense()) return;
              saveUrgently();
              setPurchases(prev => [newPur, ...prev]);
              // إضافة المخزون بالحبة: الكمية × عدد حبات وحدة الشراء (الكرتون = 12 حبة)
              const add = new Map<string, number>(); const lastCost = new Map<string, number>(); const exp = new Map<string, string>();
              const costSum = new Map<string, number>(); const costUnits = new Map<string, number>();
              for (const it of newPur.items) {
                const units = it.qty * (it.factor || 1);
                add.set(it.productId, (add.get(it.productId) || 0) + units);
                if (it.pieceCost && it.pieceCost > 0) {
                  lastCost.set(it.productId, it.pieceCost);
                  costSum.set(it.productId, (costSum.get(it.productId) || 0) + units * it.pieceCost);
                  costUnits.set(it.productId, (costUnits.get(it.productId) || 0) + units);
                }
                if (it.expiryDate && (!exp.has(it.productId) || it.expiryDate < exp.get(it.productId)!)) exp.set(it.productId, it.expiryDate);
              }
              setProducts(prev => prev.map(p => {
                if (!add.has(p.id)) return p;
                const stock = round2((p.stock || 0) + add.get(p.id)!);
                let cost = p.cost;
                if (extras?.updateCost && lastCost.has(p.id)) {
                  if (costMethod === 'average') {
                    // متوسط مرجّح: (الرصيد السابق × تكلفته + المشترى × سعره) ÷ الرصيد الجديد — الرصيد السالب أو بلا تكلفة يُعامل صفراً
                    const oldQ = Math.max(0, p.stock || 0), oldC = p.cost > 0 ? p.cost : 0;
                    const q = costUnits.get(p.id) || 0, sum = costSum.get(p.id) || 0;
                    cost = oldQ > 0 && oldC > 0 && q > 0 ? Math.round(((oldQ * oldC + sum) / (oldQ + q)) * 10000) / 10000 : Math.round((sum / (q || 1)) * 10000) / 10000;
                  } else cost = round2(lastCost.get(p.id)!);
                }
                // الصلاحية: الأقرب انتهاءً ما دام المخزون السابق صالحاً
                return { ...p, stock, cost, expiryDate: mergeExpiry(p, exp.get(p.id)) };
              }));
            }}
            company={{ name: companySettings.companyName, nameEn: companySettings.companyNameEn, vat: companySettings.vatNumber, address: companySettings.address, shortAddress: companySettings.shortAddress, phone: companySettings.phone, mobile: companySettings.mobile, email: companySettings.email, logoUrl: companySettings.logoUrl, footerInfo: companySettings.footerCompanyInfo }}
            printSettings={printSettings}
            onUpdatePurchase={(before, after, extras) => {
              if (!requireLicense()) return;
              saveUrgently();
              setPurchases(prev => prev.map(p => (p.id === before.id ? after : p)));
              // فاتورة عليها مرتجع وتغيّر وضع ضريبتها فقط: المرتجع المرتبط يأخذ نفس الوضع (أسطره بأسعار الفاتورة)
              if (extras?.vatOnly) {
                const rate = (after.vat || 0) > 0 || (after.vatRate || 0) > 0 ? (after.vatRate || companySettings.taxRate || 15) / 100 : 0;
                const inc = !!after.pricesInclusive;
                setPurchaseReturns(prev => prev.map(r => {
                  if (r.purchaseId !== after.id) return r;
                  const sum = round2(r.items.reduce((s, it) => s + (Number(it.total) || 0), 0));
                  const t = !rate ? { subtotal: sum, vat: 0, total: sum }
                    : inc ? { subtotal: round2(sum / (1 + rate)), vat: round2(sum - sum / (1 + rate)), total: sum }
                    : { subtotal: sum, vat: round2(sum * rate), total: round2(sum * (1 + rate)) };
                  return { ...r, ...t, vatRate: rate ? Math.round(rate * 100) : 0, pricesInclusive: (rate > 0 && inc) || undefined };
                }));
              }
              // فرق المخزون بالحبة = (الجديدة) − (القديمة)
              const delta = new Map<string, number>(); const lastCost = new Map<string, number>();
              const oldSum = new Map<string, number>(); const oldUnits = new Map<string, number>(); const newSum = new Map<string, number>(); const newUnits = new Map<string, number>();
              const acc = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
              for (const it of before.items) {
                delta.set(it.productId, (delta.get(it.productId) || 0) - it.qty * (it.factor || 1));
                if (it.pieceCost && it.pieceCost > 0) { acc(oldSum, it.productId, it.qty * (it.factor || 1) * it.pieceCost); acc(oldUnits, it.productId, it.qty * (it.factor || 1)); }
              }
              for (const it of after.items) {
                delta.set(it.productId, (delta.get(it.productId) || 0) + it.qty * (it.factor || 1));
                if (it.pieceCost && it.pieceCost > 0) { lastCost.set(it.productId, it.pieceCost); acc(newSum, it.productId, it.qty * (it.factor || 1) * it.pieceCost); acc(newUnits, it.productId, it.qty * (it.factor || 1)); }
              }
              const exp = new Map<string, string>();
              for (const it of after.items) if (it.expiryDate && (!exp.has(it.productId) || it.expiryDate < exp.get(it.productId)!)) exp.set(it.productId, it.expiryDate);
              setProducts(prev => prev.map(p => {
                if (!delta.has(p.id) && !lastCost.has(p.id) && !exp.has(p.id)) return p;
                const stock = round2((p.stock || 0) + (delta.get(p.id) || 0));
                let cost = p.cost;
                if (extras?.updateCost && lastCost.has(p.id)) {
                  if (costMethod === 'average') {
                    // نُلغي أثر الفاتورة القديمة على المتوسط ثم نطبّق الجديدة
                    const cur = Math.max(0, p.stock || 0), ou = oldUnits.get(p.id) || 0, os = oldSum.get(p.id) || 0;
                    const baseQ = Math.max(0, cur - ou);
                    const baseC = baseQ > 0 && p.cost > 0 ? Math.max(0, (cur * p.cost - os) / baseQ) : 0;
                    const nu = newUnits.get(p.id) || 0, ns = newSum.get(p.id) || 0;
                    cost = baseQ > 0 && baseC > 0 && nu > 0 ? Math.round(((baseQ * baseC + ns) / (baseQ + nu)) * 10000) / 10000 : Math.round((ns / (nu || 1)) * 10000) / 10000;
                  } else cost = round2(lastCost.get(p.id)!);
                }
                return { ...p, stock, cost, expiryDate: mergeExpiry(p, exp.get(p.id)) };
              }));
            }}
            onDeletePurchase={(id) => {
              const pur = purchases.find(p => p.id === id);
              if (!pur) return;
              saveUrgently();
              setPurchases(prev => prev.filter(p => p.id !== id));
              // إرجاع المخزون الذي أضافته الفاتورة
              const sub = new Map<string, number>();
              for (const it of pur.items) sub.set(it.productId, (sub.get(it.productId) || 0) + it.qty * (it.factor || 1));
              setProducts(prev => prev.map(p => (sub.has(p.id) ? { ...p, stock: round2((p.stock || 0) - sub.get(p.id)!) } : p)));
              triggerPrintNotification('تم حذف فاتورة الشراء وإرجاع كمياتها من المخزون');
            }}
            onAddSupplier={(s) => { setSuppliers(prev => [...prev, s]); triggerPrintNotification(`تمت إضافة المورد ${s.name}`); }}
            lockedIds={new Set(purchaseReturns.map(r => r.purchaseId).filter((x): x is string => !!x))}
          />
        );

      case 'purchaseReturns':
        return (
          <PurchaseReturnsManager
            returns={purchaseReturns}
            purchases={purchases}
            suppliers={suppliers}
            products={products}
            taxRatePercent={companySettings.taxRate ?? 15}
            company={{ name: companySettings.companyName, nameEn: companySettings.companyNameEn, vat: companySettings.vatNumber, address: companySettings.address, shortAddress: companySettings.shortAddress, phone: companySettings.phone, mobile: companySettings.mobile, email: companySettings.email, logoUrl: companySettings.logoUrl, footerInfo: companySettings.footerCompanyInfo }}
            printSettings={printSettings}
            userName={currentUser?.fullName}
            notify={triggerPrintNotification}
            onAdd={(r) => {
              if (!requireLicense()) return;
              saveUrgently();
              setPurchaseReturns(prev => [r, ...prev]);
              // خصم الكميات المرتجعة من المخزون بالحبة
              const sub = new Map<string, number>();
              for (const it of r.items) sub.set(it.productId, (sub.get(it.productId) || 0) + it.qty * (it.factor || 1));
              setProducts(prev => prev.map(p => (sub.has(p.id) ? { ...p, stock: round2((p.stock || 0) - sub.get(p.id)!) } : p)));
            }}
            onDelete={(id) => {
              const r = purchaseReturns.find(x => x.id === id);
              if (!r) return;
              saveUrgently();
              setPurchaseReturns(prev => prev.filter(x => x.id !== id));
              const add = new Map<string, number>();
              for (const it of r.items) add.set(it.productId, (add.get(it.productId) || 0) + it.qty * (it.factor || 1));
              setProducts(prev => prev.map(p => (add.has(p.id) ? { ...p, stock: round2((p.stock || 0) + add.get(p.id)!) } : p)));
              triggerPrintNotification(`تم حذف المرتجع ${r.number} وإعادة الكميات للمخزون`);
            }}
          />
        );

      case 'users':
        return (
          <UsersManager 
            users={users}
            currentUserId={currentUser?.id}
            onSaveUser={(u, isNew) => setUsers(prev => isNew ? [...prev, u] : prev.map(x => x.id === u.id ? u : x))}
            onDeleteUser={(id) => setUsers(prev => prev.filter(u => u.id !== id))}
            hasSales={(u) => invoices.some(inv => inv.cashierName === u.fullName || inv.cashierName === u.username)}
            notify={triggerPrintNotification}
          />
        );

      case 'settings':
        return (
          <SettingsView 
            settings={companySettings} 
            taxLockReason={zatcaActive ? 'المنشأة مرتبطة بالفوترة الإلكترونية (هيئة الزكاة)' : invoices.some(i => Math.abs(i.tax || 0) > 0) ? 'توجد فواتير صادرة بضريبة — تغيير النسبة يُفسد حساب المرتجعات والتقارير' : undefined}
            onSaveSettings={(updated) => {
              // دمج: حفظ شاشة المنشأة لا يمسح إعدادات محفوظة من شاشات أخرى (تذييل A4، ...)
              setCompanySettings(prev => ({ ...prev, ...updated }));
              triggerPrintNotification('تم حفظ إعدادات المنشأة بنجاح!');
            }} 
          />
        );

      case 'network':
        return <NetworkSettings notify={triggerPrintNotification} />;

      case 'branches':
        return <BranchesManager notify={triggerPrintNotification} onOpenAccounting={canView(currentUser, 'accounting') ? () => setCurrentView('accounting') : undefined} />;

      case 'accounting': {
        const bapi = window.ledger?.branches;
        const branchSources: BranchSource[] | undefined = hqBranches && bapi && hqBranches.list.length
          ? hqBranches.list.map((b) => ({
              id: b.id,
              label: `${b.name} (${b.code})`,
              load: async () => (await bapi.data(b.id, ['invoices', 'purchases', 'purchaseReturns', 'cashMovements', 'products', 'journalEntries'])) as SourceData,
            }))
          : undefined;
        return (
          <AccountingManager
            accounts={accounts}
            setAccounts={setAccounts}
            entries={journalEntries}
            setEntries={(v) => { saveUrgently(); setJournalEntries(v); }}
            settings={acctSettings}
            setSettings={setAcctSettings}
            local={{ invoices, purchases, purchaseReturns, cashMovements, products }}
            localLabel={hqBranches?.label || companySettings.companyName || 'هذا الجهاز'}
            customers={customers}
            suppliers={suppliers}
            branches={branchSources}
            company={{ name: companySettings.companyName, nameEn: companySettings.companyNameEn, vat: companySettings.vatNumber, address: companySettings.address, shortAddress: companySettings.shortAddress }}
            printSettings={printSettings}
            userName={cashierDisplayName}
            canManage={!currentUser || can(currentUser, 'accounting.manage')}
            deviceTag={deviceStamp().deviceTag}
            notify={triggerPrintNotification}
          />
        );
      }

      case 'einvoice':
        if (zatcaAllowed) return <ZatcaPanel settings={companySettings} onActiveChange={setZatcaActive} notify={triggerPrintNotification} canOnboard={zatcaLicensed} subscription={license.status?.featureStates?.zatca || null} onOpenLicense={() => setCurrentView('license')} />;
        return zatcaExpiredOn
          ? <FeatureLocked
              expired
              title="انتهى اشتراك الفاتورة الإلكترونية"
              note={`انتهى الاشتراك في ${zatcaExpiredOn} ومضت مهلة الشهر، فتوقّف ختم الفواتير وإرسالها للهيئة. بقية البرنامج تعمل كالمعتاد، والربط مع منصة فاتورة محفوظ: بمجرد تفعيل مفتاح التجديد يعود العمل وتُرسل الفواتير المعلّقة تلقائياً بلا رمز OTP جديد.`}
              onOpenLicense={() => setCurrentView('license')}
            />
          : <FeatureLocked
              title="الفاتورة الإلكترونية (الربط مع منصة فاتورة)"
              note="هذه الميزة بترخيص منفصل: ختم الفواتير إلكترونياً وإرسالها لهيئة الزكاة والضريبة والجمارك في المرحلة الثانية."
              onOpenLicense={() => setCurrentView('license')}
            />;

      case 'devices':
        return (
          <div className="p-6 h-full overflow-y-auto flex flex-col gap-5 animate-in fade-in zoom-in-95 max-w-7xl mx-auto dark:text-white text-right" data-testid="devices-view">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="p-3 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 rounded-xl"><MonitorSmartphone className="w-8 h-8" /></div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white">شاشة العميل والميزان</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1">شاشة العرض الثانية للعميل وإعدادات الميزان الإلكتروني وباركود الميزان</p>
              </div>
            </div>
            {devicesPanel('displayScale')}
          </div>
        );

      case 'printers':
        return (
          <PrintersManager
            printers={printersList}
            setPrinters={setPrintersList}
            printSettings={printSettings}
            setPrintSettings={setPrintSettings}
            notify={triggerPrintNotification}
            restaurant={businessType === 'restaurant'}
            storeName={companySettings.companyName}
            extra={devicesPanel('drawer')}
          />
        );

      case 'appSettings':
        return (
          <div id="app-settings-root" className="p-6 h-full overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 max-w-5xl mx-auto dark:text-white text-right">
            <div className="flex items-center gap-3 mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-xl"><Palette className="w-8 h-8"/></div>
              <div className="flex-1"><h2 className="text-2xl font-black text-slate-800 dark:text-white">إعدادات التطبيق والمظهر</h2></div>
              <SettingsSearch rootId="app-settings-root" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6">
                <div className="space-y-4">
                  <div className="setting-block flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">{isDarkMode ? <Moon className="w-6 h-6 text-indigo-400"/> : <Sun className="w-6 h-6 text-amber-500"/>} <p className="font-bold">الوضع الداكن</p></div>
                    <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-12 h-6 rounded-full relative ${isDarkMode ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${isDarkMode ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3"><ArrowRightLeft className="w-6 h-6 text-blue-500"/> <p className="font-bold">عكس اتجاه الشاشة (شمالي/يميني)</p></div>
                    <button onClick={() => setIsLayoutReversed(!isLayoutReversed)} className={`w-12 h-6 rounded-full relative ${isLayoutReversed ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${isLayoutReversed ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-language">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🌐</span>
                      <div>
                        <p className="font-bold">لغة الواجهة</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">تغيّر القوائم والشاشات فقط — الفواتير والإيصالات المطبوعة تبقى بالعربي</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0" translate="no">
                      <button type="button" data-testid="lang-ar" onClick={() => setUiLanguage('ar')} className={`px-3 py-1.5 rounded-lg ${uiLanguage !== 'en' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>العربية</button>
                      <button type="button" data-testid="lang-en" onClick={() => setUiLanguage('en')} className={`px-3 py-1.5 rounded-lg ${uiLanguage === 'en' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>English</button>
                    </div>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-sidebar-side">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">↔️</span>
                      <div>
                        <p className="font-bold">مكان القائمة الجانبية</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">تلقائي: يمين في العربي ويسار في الإنجليزي</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0">
                      {([['auto', 'تلقائي'], ['right', 'يمين'], ['left', 'يسار']] as const).map(([k, l]) => (
                        <button key={k} type="button" data-testid={`sidebar-side-${k}`} onClick={() => setSidebarSide(k)}
                          className={`px-3 py-1.5 rounded-lg ${sidebarSide === k ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">👆</span>
                      <div>
                        <p className="font-bold">وضع شاشة اللمس</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{touchMode ? 'مفعّل: خطوط وأزرار وحقول أكبر وأشرطة تمرير عريضة لسهولة اللمس' : 'مغلق: الحجم العادي (يتناسب تلقائياً مع مقاس الشاشة)'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-touch" aria-pressed={touchMode} onClick={() => setTouchMode(!touchMode)} className={`w-12 h-6 rounded-full relative shrink-0 ${touchMode ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${touchMode ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  {touchMode && (
                    <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2" data-testid="setting-ui-zoom">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold flex items-center gap-2"><span className="text-xl">🔍</span> نسبة تكبير الواجهة</p>
                        <span className="font-mono font-black text-cyan-700 dark:text-cyan-300 text-lg" data-testid="ui-zoom-value">{uiZoom}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setUiZoom(uiZoom - 5)} disabled={uiZoom <= 60} className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 font-black text-lg disabled:opacity-40 cursor-pointer" title="تصغير">−</button>
                        <input type="range" min={60} max={160} step={5} value={uiZoom} onChange={(e) => setUiZoom(Number(e.target.value))} className="flex-1 accent-cyan-600" data-testid="ui-zoom-range" />
                        <button type="button" onClick={() => setUiZoom(uiZoom + 5)} disabled={uiZoom >= 160} className="w-10 h-10 rounded-xl bg-cyan-600 text-white font-black text-lg disabled:opacity-40 cursor-pointer" title="تكبير">+</button>
                        <button type="button" onClick={() => setUiZoom(100)} className="px-3 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">100%</button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">تكبّر أو تصغّر البرنامج كاملاً ليناسب الشاشة (60% – 160%). تُحفظ لهذا الجهاز فقط، ولا تؤثر على الطباعة.</p>
                    </div>
                  )}
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-pos-keyboard">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">⌨️</span>
                      <div>
                        <p className="font-bold">لوحة المفاتيح على شاشة البيع</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{posKeyboard ? 'مفعّل: زر لوحة المفاتيح بجانب السلة أعلى شاشة البيع — تكتب في الحقل المحدد (الباركود، البحث، الكمية...)' : 'مغلق: لا يظهر زر لوحة المفاتيح في شاشة البيع'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-pos-keyboard" aria-pressed={posKeyboard} onClick={() => { setPosKeyboard(!posKeyboard); setOskOpen(false); }} className={`w-12 h-6 rounded-full relative shrink-0 ${posKeyboard ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${posKeyboard ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🖥️</span>
                      <div>
                        <p className="font-bold">إخفاء شريط المهام (ملء الشاشة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{hideTaskbar ? 'مفعّل: البرنامج يملأ الشاشة ويختفي شريط مهام ويندوز — للخروج أوقف الزر' : 'مغلق: شريط مهام ويندوز ظاهر'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-hide-taskbar" aria-pressed={hideTaskbar} onClick={() => setHideTaskbar(!hideTaskbar)} className={`w-12 h-6 rounded-full relative shrink-0 ${hideTaskbar ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${hideTaskbar ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="doc-barcode-settings">
                    <div className="flex items-center gap-3 mb-3"><ScanLine className="w-6 h-6 text-teal-600" /><div><p className="font-bold">باركود رقم الفاتورة في المستندات</p><p className="text-xs text-slate-500 dark:text-slate-400">يُمسح لاستدعاء الفاتورة أو المرتجع أو عرض السعر</p></div></div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {([['receipt', 'إيصال 80مم'], ['a4', 'فاتورة A4 والمرتجع'], ['quotation', 'عرض السعر']] as const).map(([k, label]) => {
                        const on = printSettings.docBarcode?.[k] !== false;
                        return (
                          <button key={k} type="button" data-k={k} aria-pressed={on}
                            onClick={() => setPrintSettings(p => ({ ...p, docBarcode: { ...(p.docBarcode || {}), [k]: !(p.docBarcode?.[k] !== false) } }))}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2 text-xs font-black transition ${on ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                            <span>{label}</span>
                            <span className={`w-8 h-4 rounded-full relative shrink-0 ${on ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${on ? 'left-0.5' : 'left-4'}`} /></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-cost-method">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">⚖️</span>
                      <div>
                        <p className="font-bold">تكلفة الصنف عند الشراء</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{costMethod === 'average' ? 'متوسط مرجّح: (الرصيد × تكلفته + المشترى × سعره) ÷ الرصيد الجديد — مثال: 10 بـ5 ثم 10 بـ7 = 6' : 'آخر سعر شراء: التكلفة = سعر الحبة في آخر فاتورة شراء — مثال: 10 بـ5 ثم 10 بـ7 = 7'}</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0">
                      {([['average', 'متوسط مرجّح'], ['last', 'آخر سعر']] as const).map(([k, l]) => (
                        <button key={k} type="button" data-testid={`cost-method-${k}`} onClick={() => setCostMethod(k)}
                          className={`px-3 py-1.5 rounded-lg ${costMethod === k ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="doc-numbering-settings">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🔢</span>
                      <div>
                        <p className="font-bold">ترقيم الفواتير والمرتجعات</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">الرقم التالي: <span className="font-mono font-black text-slate-700 dark:text-slate-200" dir="ltr" data-testid="next-inv-number">{peekDocNumber('INV')}</span></p>
                      </div>
                    </div>
                    {([
                      ['yearly', 'سنوي — INV-27-00001 (السنة مختصرة ثم رقم الفاتورة) ويبدأ من 1 كل سنة', 'السنة التي فيها فواتير بالترقيم المستمر تكمل عليه، والسنوي يبدأ من أول فاتورة في السنة التالية'],
                      ['continuous', 'مستمر — INV-00001 بلا بداية جديدة', 'تسلسل واحد لكل السنوات'],
                    ] as const).map(([k, label, hint]) => (
                      <button key={k} type="button" data-testid={`numbering-${k}`} onClick={() => setDocNumbering(k)}
                        className={`w-full text-right flex items-start gap-3 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border-2 cursor-pointer ${docNumbering === k ? 'border-cyan-500' : 'border-slate-100 dark:border-slate-700'}`}>
                        <span className={`mt-1 w-4 h-4 rounded-full border-2 shrink-0 ${docNumbering === k ? 'border-cyan-500 bg-cyan-500 ring-2 ring-white dark:ring-slate-900 ring-inset' : 'border-slate-300'}`} />
                        <span><span className="block text-sm font-bold">{label}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span></span>
                      </button>
                    ))}
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-large-paper">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">📄</span>
                      <div>
                        <p className="font-bold">مقاس الفاتورة الكبيرة</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{printSettings.largePaper === 'A5' ? 'A5 (نصف A4): نفس تصميم الفاتورة مصغّراً على ورقة A5 — للطابعة والـ PDF' : 'A4: الفاتورة الكاملة على ورقة A4'}</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0">
                      {(['A4', 'A5'] as const).map((k) => (
                        <button key={k} type="button" data-testid={`paper-${k}`} onClick={() => setPrintSettings(p => ({ ...p, largePaper: k }))}
                          className={`px-3 py-1.5 rounded-lg ${(printSettings.largePaper || 'A4') === k ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{k}</button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const lhs = { ...DEFAULT_LETTERHEAD, ...(printSettings.letterhead || {}) };
                    const setLh = (patch: Partial<typeof lhs>) => setPrintSettings(p => ({ ...p, letterhead: { ...DEFAULT_LETTERHEAD, ...(p.letterhead || {}), ...patch } }));
                    const mm = (v: string, def: number) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(0, Math.min(150, n)) : def; };
                    return (
                      <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="setting-letterhead">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl shrink-0">🗒️</span>
                            <div>
                              <p className="font-bold">الطباعة على ورق بترويسة جاهزة</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{lhs.enabled ? 'مفعّل: فاتورة A4/A5 تُطبع بلا ترويسة ولا تذييل، ويُترك مكانهما فارغاً لورق المنشأة المطبوع مسبقاً' : 'مغلق: الفاتورة تُطبع كاملة بترويستها وتذييلها'}</p>
                            </div>
                          </div>
                          <button data-testid="toggle-letterhead" aria-pressed={lhs.enabled} onClick={() => setLh({ enabled: !lhs.enabled })} className={`w-12 h-6 rounded-full relative shrink-0 ${lhs.enabled ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${lhs.enabled ? 'left-1' : 'right-1'}`} /></button>
                        </div>
                        {lhs.enabled && (
                          <div className="grid gap-2 text-xs font-bold text-slate-600 dark:text-slate-300" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                            <label className="flex items-center gap-2">ارتفاع الترويسة
                              <input type="number" min={0} max={150} step={1} value={lhs.topMm} onChange={(e) => setLh({ topMm: mm(e.target.value, 40) })} data-testid="lh-top-mm"
                                className="w-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 font-mono text-sm" dir="ltr" /> مم
                            </label>
                            <label className="flex items-center gap-2">ارتفاع التذييل
                              <input type="number" min={0} max={150} step={1} value={lhs.bottomMm} onChange={(e) => setLh({ bottomMm: mm(e.target.value, 25) })} data-testid="lh-bottom-mm"
                                className="w-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 font-mono text-sm" dir="ltr" /> مم
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer" style={{ gridColumn: '1 / -1' }}>
                              <input type="checkbox" checked={lhs.hideSeller} onChange={(e) => setLh({ hideSeller: e.target.checked })} data-testid="lh-hide-seller" />
                              إخفاء بطاقة «البائع» (الرقم الضريبي والسجل) — فقط إن كانت مطبوعة في الترويسة الجاهزة
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer" style={{ gridColumn: '1 / -1' }}>
                              <input type="checkbox" checked={lhs.pdfFull} onChange={(e) => setLh({ pdfFull: e.target.checked })} data-testid="lh-pdf-full" />
                              حفظ PDF والمشاركة بالترويسة الكاملة (للإرسال بالواتساب والبريد) — والأرشيف دائماً كامل
                            </label>
                            <p className="text-[11px] font-semibold text-slate-500" style={{ gridColumn: '1 / -1' }}>قِس ارتفاع ترويسة الورق وتذييله بالمسطرة. في المعاينة يظهر مكانهما مربعاً منقّطاً لا يُطبع. ترقيم الصفحات وتاريخ الطباعة لا يُطبعان في هذا الوضع حتى لا يقعا فوق التذييل.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-dot-matrix">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🖨️</span>
                      <div>
                        <p className="font-bold">طابعة إبرية</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{printSettings.dotMatrix ? 'مفعّل: فاتورة A4/A5 وعرض السعر بلا خلفيات ولا ألوان، بخطوط رفيعة وخط أوضح وباركود وQR أكبر — أسرع وأنظف على الطابعة الإبرية. PDF والمشاركة تبقى بالألوان' : 'مغلق: الطباعة بالتصميم الملوّن (لطابعات الليزر والحبر)'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-dot-matrix" aria-pressed={!!printSettings.dotMatrix} onClick={() => setPrintSettings(p => ({ ...p, dotMatrix: !p.dotMatrix }))} className={`w-12 h-6 rounded-full relative shrink-0 ${printSettings.dotMatrix ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${printSettings.dotMatrix ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  {printSettings.dotMatrix && (
                    <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-2" data-testid="setting-dot-matrix-paper">
                      <p className="font-bold text-sm">مقاس ورق الطابعة الإبرية</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['cf11', CONTINUOUS_PAPERS.cf11.label + ' إنش', CONTINUOUS_PAPERS.cf11.hint],
                          ['cf12', CONTINUOUS_PAPERS.cf12.label + ' إنش', CONTINUOUS_PAPERS.cf12.hint],
                          ['A4', 'A4', '\u206621×29.7\u2069 سم'],
                          ['A5', 'A5', 'نصف A4'],
                        ] as [DotMatrixPaper, string, string][]).map(([k, label, hint]) => {
                          const on = (printSettings.dotMatrixPaper || 'cf11') === k;
                          return (
                            <button key={k} type="button" data-testid={`dm-paper-${k}`} onClick={() => setPrintSettings(p => ({ ...p, dotMatrixPaper: k }))}
                              className={`text-right rounded-lg px-3 py-2 border-2 cursor-pointer bg-white dark:bg-slate-900 ${on ? 'border-cyan-500' : 'border-slate-100 dark:border-slate-700'}`}>
                              <span className="block text-sm font-black" dir="rtl">{label}</span>
                              <span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500">يُستخدم هذا المقاس بدل «مقاس الفاتورة الكبيرة» ما دام وضع الإبرية مفعّلاً. في الورق المتصل يُترك {CONTINUOUS_SIDE_MM} مم يميناً ويساراً لشريطي الثقوب. واضبط في تعريف الطابعة (ويندوز) نفس مقاس الورق.</p>
                    </div>
                  )}
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-extras-pdf-only">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">📄</span>
                      <div>
                        <p className="font-bold">الشروط والأحكام وبيانات البنك في PDF فقط</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{printSettings.extrasPdfOnly
                          ? `مفعّل: تظهر في PDF والمشاركة والأرشيف، وتُخفى عند الطباعة بالطابعة الإبرية أو على الترويسة الجاهزة${!printSettings.dotMatrix && !printSettings.letterhead?.enabled ? ' — (لا أثر الآن: فعّل الطابعة الإبرية أو الترويسة الجاهزة)' : ''}`
                          : 'مغلق: تظهر في الطباعة وPDF معاً (حسب إعدادات المنشأة)'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-extras-pdf-only" aria-pressed={!!printSettings.extrasPdfOnly} onClick={() => setPrintSettings(p => ({ ...p, extrasPdfOnly: !p.extrasPdfOnly }))} className={`w-12 h-6 rounded-full relative shrink-0 ${printSettings.extrasPdfOnly ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${printSettings.extrasPdfOnly ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="preview-template">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🖨️</span>
                      <div>
                        <p className="font-bold">قالب المعاينة الأول (عند إلغاء الطباعة الصامتة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">تفتح معاينة الفاتورة بعد البيع على هذا القالب، ويمكن التبديل قبل الطباعة</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0">
                      <button type="button" onClick={() => setPreviewTemplate('A4')} className={`px-3 py-1.5 rounded-lg ${previewTemplate === 'A4' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{printSettings.largePaper === 'A5' ? 'A5' : 'A4'}</button>
                      <button type="button" onClick={() => setPreviewTemplate('thermal80')} className={`px-3 py-1.5 rounded-lg ${previewTemplate === 'thermal80' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>إيصال 80مم</button>
                    </div>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-receipt-cashier">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🧑‍💼</span>
                      <div>
                        <p className="font-bold">اسم الكاشير في الإيصال الحراري وورقة المطبخ</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{companySettings.receiptCashier !== false ? 'مفعّل: يظهر «الكاشير: الاسم» في الإيصال تحت طريقة الدفع وفي ورقة المطبخ والأقسام' : 'مغلق: لا يظهر اسم الكاشير في الإيصال ولا في ورقة المطبخ'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-receipt-cashier" aria-pressed={companySettings.receiptCashier !== false} onClick={() => setCompanySettings(c => ({ ...c, receiptCashier: c.receiptCashier === false }))} className={`w-12 h-6 rounded-full relative shrink-0 ${companySettings.receiptCashier !== false ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${companySettings.receiptCashier !== false ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-receipt-line-tax">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🧾</span>
                      <div>
                        <p className="font-bold">مبلغ الضريبة بجانب كل صنف في الإيصال الحراري</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{vatUnregistered
                          ? 'المنشأة غير مسجّلة بالضريبة — لا تظهر الضريبة في الإيصال أصلاً'
                          : companySettings.receiptLineTax !== false
                            ? 'مفعّل: يظهر «ضريبة 0.00» بين الكمية×السعر ومجموع السطر'
                            : 'مغلق: يظهر إجمالي الضريبة في آخر الإيصال فقط'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-receipt-line-tax" disabled={vatUnregistered} aria-pressed={!vatUnregistered && companySettings.receiptLineTax !== false} onClick={() => setCompanySettings(c => ({ ...c, receiptLineTax: c.receiptLineTax === false }))} className={`w-12 h-6 rounded-full relative shrink-0 disabled:opacity-40 ${!vatUnregistered && companySettings.receiptLineTax !== false ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${!vatUnregistered && companySettings.receiptLineTax !== false ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-item-names">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🔤</span>
                      <div>
                        <p className="font-bold">أسماء الأصناف في الفواتير</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">للأصناف المسجّل لها اسم إنجليزي: عربي فقط، أو إنجليزي فقط، أو الاثنان (الإنجليزي تحت العربي)</p>
                      </div>
                    </div>
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-black shrink-0">
                      {([['ar', 'عربي'], ['en', 'إنجليزي'], ['both', 'الاثنان']] as const).map(([k, l]) => (
                        <button key={k} type="button" data-testid={`item-names-${k}`} onClick={() => setCompanySettings({ ...companySettings, invoiceItemNames: k })}
                          className={`px-3 py-1.5 rounded-lg ${(companySettings.invoiceItemNames || 'ar') === k ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <Building2 className={`w-6 h-6 shrink-0 ${companySettings.footerCompanyInfo ? 'text-cyan-600' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">اسم المنشأة أسفل الفاتورة</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{companySettings.footerCompanyInfo ? 'مفعّل: اسم المنشأة وهاتفها وعنوانها في تذييل فاتورة A4' : 'مغلق: التذييل يعرض نص التذييل فقط'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-footer-company" aria-pressed={!!companySettings.footerCompanyInfo} onClick={() => setCompanySettings(c => ({ ...c, footerCompanyInfo: !c.footerCompanyInfo }))} className={`w-12 h-6 rounded-full relative shrink-0 ${companySettings.footerCompanyInfo ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${companySettings.footerCompanyInfo ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setBusinessType('restaurant')} className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-3 ${businessType === 'restaurant' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                    <Utensils className="w-8 h-8" /> <span className="font-bold">مطعم / كافيه</span>
                  </button>
                  <button onClick={() => setBusinessType('retail')} className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-3 ${businessType === 'retail' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                    <Store className="w-8 h-8" /> <span className="font-bold">تجزئة (كاشير ويندوز)</span>
                  </button>
                </div>
                {businessType === 'retail' && <p className="text-sm font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200">وضع كاشير التجزئة مفعل: توجيه الطباعة وقارئ الباركود النشط متاحان الآن.</p>}
                <h3 className="font-black text-lg text-slate-800 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-700">شاشة البيع</h3>
                <div className="space-y-4" data-testid="pos-settings-col">
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-cost-peek">
                    <div className="flex items-center gap-3">
                      <Eye className={`w-6 h-6 shrink-0 ${costPeekEnabled ? 'text-cyan-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">رؤية تكلفة الصنف في شاشة البيع (بشكل سرّي)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">اضغط مطوّلاً (نصف ثانية) على اسم الصنف في السلة بالماوس أو بالإصبع، فيظهر تحته سطر صغير مثل «ت 6.00 · ر 2.70»: <b>ت</b> = تكلفة الوحدة و<b>ر</b> = ربحها قبل الضريبة. يختفي فور رفع الإصبع والضغطة العادية لا تُظهر شيئاً — فلا ينتبه العميل.</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">متاحة للمدير فقط، ويمكنه منحها لأي مستخدم من «المستخدمون والصلاحيات» ← صلاحية «رؤية تكلفة الصنف وربحه في شاشة البيع».</p>
                      </div>
                    </div>
                    <button type="button" aria-pressed={costPeekEnabled} data-testid="toggle-cost-peek" onClick={() => setCostPeekEnabled(!costPeekEnabled)} className={`w-12 h-6 rounded-full relative shrink-0 ${costPeekEnabled ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${costPeekEnabled ? 'left-1' : 'left-7'}`}></div></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-search-stock">
                    <div className="flex items-center gap-3">
                      <Package className={`w-6 h-6 shrink-0 ${searchShowStock ? 'text-cyan-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">الكمية المتوفرة في قائمة البحث المنسدلة</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">عند البحث عن صنف تظهر بجانبه الكمية المتوفرة (أخضر متوفر · برتقالي قارب النفاد · أحمر نفد)</p>
                      </div>
                    </div>
                    <button type="button" aria-pressed={searchShowStock} data-testid="toggle-search-stock" onClick={() => setSearchShowStock(!searchShowStock)} className={`w-12 h-6 rounded-full relative shrink-0 ${searchShowStock ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${searchShowStock ? 'left-1' : 'left-7'}`}></div></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="pos-dropdown-setting">
                    <div className="flex items-center gap-3">
                      <Search className={`w-6 h-6 shrink-0 ${posSearchDropdown ? 'text-cyan-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">البحث بالقائمة المنسدلة في شاشة البيع</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{posSearchDropdown ? 'مفعّل: نتائج البحث تظهر في قائمة أسفل الخانة — اضغط الصنف أو Enter لإضافته' : 'مقفل: البحث يصفّي بطاقات الأصناف في الشاشة'}</p>
                      </div>
                    </div>
                    <button type="button" aria-pressed={posSearchDropdown} onClick={() => setPosSearchDropdown(!posSearchDropdown)} className={`w-12 h-6 rounded-full relative shrink-0 ${posSearchDropdown ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${posSearchDropdown ? 'left-1' : 'left-7'}`}></div></button>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-below-cost">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ShieldAlert className={`w-6 h-6 shrink-0 ${belowCostRule.enabled ? 'text-rose-500' : 'text-slate-400'}`} />
                        <div>
                          <p className="font-bold">منع البيع بأقل من سعر التكلفة</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{belowCostRule.enabled
                            ? (belowCostRule.minMarginPct > 0 ? `مفعّل: لا يُباع صنف إلا بربح ${belowCostRule.minMarginPct}% على الأقل فوق تكلفته` : 'مفعّل: لا يُباع صنف بأقل من تكلفته')
                            : 'مقفل: يُسمح بأي سعر'} — يُحسب السعر بعد خصم الصنف وخصم الفاتورة وقبل الضريبة، والأصناف بلا تكلفة مسجّلة لا تُمنع</p>
                        </div>
                      </div>
                      <button data-testid="toggle-below-cost" aria-pressed={belowCostRule.enabled} onClick={() => setBelowCostRule({ ...belowCostRule, enabled: !belowCostRule.enabled })} className={`w-12 h-6 rounded-full relative shrink-0 ${belowCostRule.enabled ? 'bg-rose-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${belowCostRule.enabled ? 'left-1' : 'right-1'}`} /></button>
                    </div>
                    {belowCostRule.enabled && (
                      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                        أقل هامش ربح مسموح فوق التكلفة:
                        <input type="number" min="0" max="1000" step="0.5" value={belowCostRule.minMarginPct || ''} placeholder="0" data-testid="below-cost-pct"
                          onChange={(e) => setBelowCostRule({ ...belowCostRule, minMarginPct: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono text-center" />
                        %
                        <span className="text-xs font-semibold text-slate-500">مثال: تكلفة 10 وهامش 20% ← أقل سعر 12 قبل الضريبة. اتركه فارغاً = لا يُباع بأقل من التكلفة.</span>
                      </label>
                    )}
                    {belowCostRule.enabled && (
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">الكاشير يُمنع ويُطلب له موافقة المشرف، والمدير والمشرف يُسألان للتأكيد فقط. تُمنح الصلاحية من «المستخدمون والصلاحيات» ← «البيع بأقل من سعر التكلفة».</p>
                    )}
                    {belowCostHits.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300" data-testid="below-cost-hits">
                        <p>{`⚠️ ${belowCostHits.length} صنف سعرها الحالي أقل من ${belowCostRule.enabled && belowCostRule.minMarginPct > 0 ? 'السعر المسموح' : 'تكلفتها'} — ستتوقف عند الكاشير حتى تُعدَّل:`}</p>
                        <ul className="mt-1.5 space-y-0.5 font-semibold">
                          {belowCostHits.slice(0, 6).map((h, i) => (
                            <li key={i}>{`• ${h.label}: السعر ${h.price.toFixed(2)} وأقل سعر ${h.minPrice.toFixed(2)}`}</li>
                          ))}
                          {belowCostHits.length > 6 && <li>{`… و${belowCostHits.length - 6} غيرها`}</li>}
                        </ul>
                        <button type="button" data-testid="below-cost-open" onClick={() => { setProductsInitFilter('belowcost'); setCurrentView('products'); }}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black cursor-pointer">عرضها في شاشة الأصناف</button>
                      </div>
                    )}
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <LockKeyhole className={`w-6 h-6 shrink-0 ${blockNegativeStock ? 'text-rose-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">قفل البيع بالسالب</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{blockNegativeStock ? 'مقفل: لا يُباع صنف بكمية أكبر من رصيده' : 'مفتوح: يُسمح بالبيع حتى لو نفد المخزون'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-negative" aria-pressed={blockNegativeStock} onClick={() => setBlockNegativeStock(!blockNegativeStock)} className={`w-12 h-6 rounded-full relative shrink-0 ${blockNegativeStock ? 'bg-rose-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${blockNegativeStock ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`w-6 h-6 shrink-0 ${showStockAlerts ? 'text-amber-500' : 'text-slate-400'}`} />
                      <div>
                        <p className="font-bold">عرض تنبيهات المخزون</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{showStockAlerts ? 'مفعّل: إطارات وشارات «منخفض/نافد» ورسائل التنبيه في شاشة البيع' : 'مغلق: لا تظهر تنبيهات المخزون في شاشة البيع'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-stock-alerts" aria-pressed={showStockAlerts} onClick={() => setShowStockAlerts(!showStockAlerts)} className={`w-12 h-6 rounded-full relative shrink-0 ${showStockAlerts ? 'bg-amber-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${showStockAlerts ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">💵</span>
                      <div>
                        <p className="font-bold">مربع «الباقي» بعد البيع النقدي</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{showChangeBox ? 'مفعّل: يظهر المبلغ المدفوع والباقي للعميل بعد كل فاتورة نقدية' : 'مغلق: لا يظهر مربع الباقي'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-change-box" aria-pressed={showChangeBox} onClick={() => setShowChangeBox(!showChangeBox)} className={`w-12 h-6 rounded-full relative shrink-0 ${showChangeBox ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${showChangeBox ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">✏️</span>
                      <div>
                        <p className="font-bold">السماح بتعديل سعر الصنف في السلة</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{allowPriceEdit ? 'مفعّل: يعدّل الكاشير السعر حسب صلاحيته' : 'متوقف: خانة السعر في السلة للقراءة فقط لكل المستخدمين'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-price-edit" aria-pressed={allowPriceEdit} onClick={() => setAllowPriceEdit(!allowPriceEdit)} className={`w-12 h-6 rounded-full relative shrink-0 ${allowPriceEdit ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${allowPriceEdit ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  {cardsLockable && (
                    <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-lock-cards">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl shrink-0">🗂️</span>
                        <div>
                          <p className="font-bold">تثبيت البيع ببطاقات الأصناف</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{lockCardsSetting ? 'مفعّل: شاشة البيع دائماً ببطاقات الأصناف (يختفي زر «شاشة القائمة»)' : 'مغلق: شاشة البيع بالقائمة، مع زر للتبديل إلى بطاقات الأصناف'}</p>
                        </div>
                      </div>
                      <button data-testid="toggle-lock-cards" aria-pressed={lockCardsSetting} onClick={() => setLockCardsSetting(!lockCardsSetting)} className={`w-12 h-6 rounded-full relative shrink-0 ${lockCardsSetting ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${lockCardsSetting ? 'left-1' : 'right-1'}`} /></button>
                    </div>
                  )}
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="setting-delivery">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl shrink-0">🛵</span>
                        <div>
                          <p className="font-bold">رسوم التوصيل</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{deliverySettings.enabled ? (businessType === 'restaurant' && restOpts.orderTypes ? 'مفعّل: تُضاف تلقائياً سطراً في الفاتورة عند اختيار نوع الطلب «توصيل»' : 'مفعّل: زر «🛵 توصيل» في السلة يضيف سطر «رسوم التوصيل» للفاتورة') + ' — خاضعة للضريبة ولا يشملها خصم الفاتورة' : 'مقفل: لا تظهر رسوم التوصيل في شاشة البيع'}</p>
                        </div>
                      </div>
                      <button data-testid="toggle-delivery" aria-pressed={deliverySettings.enabled} onClick={() => setDeliverySettings(d => ({ ...d, enabled: !d.enabled }))} className={`w-12 h-6 rounded-full relative shrink-0 ${deliverySettings.enabled ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${deliverySettings.enabled ? 'left-1' : 'right-1'}`} /></button>
                    </div>
                    {deliverySettings.enabled && (
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                        <span>المبلغ الافتراضي</span>
                        <input type="number" min={0} step={0.5} value={deliverySettings.amount} data-testid="delivery-default"
                          onChange={(e) => setDeliverySettings(d => ({ ...d, amount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="w-24 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 font-mono text-sm" dir="ltr" />
                        <span>{pricesIncludeTax ? 'شامل الضريبة' : 'قبل الضريبة'} — يمكن تعديله لكل فاتورة</span>
                      </label>
                    )}
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-swap-pay">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">⇄</span>
                      <div>
                        <p className="font-bold">عكس الدفع (كاش / شبكة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{swapPayButtons ? 'مفعّل: «دفع شبكة» أولاً ثم «دفع كاش»' : 'مغلق: «دفع كاش» أولاً ثم «دفع شبكة»'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-swap-pay" aria-pressed={swapPayButtons} onClick={() => setSwapPayButtons(!swapPayButtons)} className={`w-12 h-6 rounded-full relative shrink-0 ${swapPayButtons ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${swapPayButtons ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-confirm-pay">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">✅</span>
                      <div>
                        <p className="font-bold">تأكيد الدفع</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{confirmPayment ? 'مفعّل: يُسأل الكاشير عن تأكيد الدفع قبل حفظ الفاتورة' : 'مغلق: تُحفظ الفاتورة مباشرة عند الضغط على الدفع'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-confirm-pay" aria-pressed={confirmPayment} onClick={() => setConfirmPayment(!confirmPayment)} className={`w-12 h-6 rounded-full relative shrink-0 ${confirmPayment ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${confirmPayment ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-line-note">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">📝</span>
                      <div>
                        <p className="font-bold">وصف الصنف (شاشة البيع بالقائمة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{lineNoteBtn ? 'مفعّل: بجانب كل صنف زر لكتابة وصف يظهر في الفاتورة تحت اسمه (مقاس، لون، ملاحظة)' : 'مغلق: لا يظهر زر الوصف في سطور الأصناف'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-line-note" aria-pressed={lineNoteBtn} onClick={() => setLineNoteBtn(!lineNoteBtn)} className={`w-12 h-6 rounded-full relative shrink-0 ${lineNoteBtn ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${lineNoteBtn ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-line-serial">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🔢</span>
                      <div>
                        <p className="font-bold">الرقم التسلسلي للصنف (شاشة البيع بالقائمة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{lineSerialBtn ? 'ظاهر: بجانب كل صنف زر لكتابة أو مسح الرقم التسلسلي (S/N) ويُطبع في الفاتورة' : 'مخفي: يظهر الزر عند تفعيله من هنا (للأجهزة والقطع ذات الضمان)'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-line-serial" aria-pressed={lineSerialBtn} onClick={() => setLineSerialBtn(!lineSerialBtn)} className={`w-12 h-6 rounded-full relative shrink-0 ${lineSerialBtn ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${lineSerialBtn ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-cash-float">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl shrink-0">🪙</span>
                        <div>
                          <p className="font-bold">نقدية بداية الوردية (العهدة)</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{cashFloat.enabled
                            ? 'مفعّلة: يُسأل الكاشير عن نقد الدرج في بداية كل وردية، ويُسجَّل في الصندوق ويدخل في النقد المتوقع عند الإقفال'
                            : 'مقفلة: لا يُسأل أحد، والدرج يبدأ من صفر في الصندوق وفي الإقفال'}</p>
                        </div>
                      </div>
                      <button data-testid="toggle-cash-float" aria-pressed={cashFloat.enabled} onClick={() => setCashFloat({ ...cashFloat, enabled: !cashFloat.enabled })} className={`w-12 h-6 rounded-full relative shrink-0 ${cashFloat.enabled ? 'bg-amber-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${cashFloat.enabled ? 'left-1' : 'right-1'}`} /></button>
                    </div>
                    {cashFloat.enabled && (
                      <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {floatOwed
                          ? <button type="button" data-testid="float-ask-open" onClick={openFloatAsk} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black cursor-pointer">تسجيل نقدية هذه الوردية الآن</button>
                          : 'سُجّلت نقدية هذه الوردية. يُسأل الكاشير من جديد بعد الإقفال القادم.'}
                      </div>
                    )}
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-list-vat">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🧾</span>
                      <div>
                        <p className="font-bold">عمود الضريبة (شاشة البيع بالقائمة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{listVatCol ? `ظاهر: بعد عمود السعر يظهر مبلغ ضريبة كل سطر (${Math.round(taxRate * 100)}%)` : 'مخفي: يظهر عمود «الضريبة» بعد السعر عند تفعيله من هنا'}{!taxRate ? ' — الضريبة غير مفعّلة في إعدادات المنشأة' : ''}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-list-vat" aria-pressed={listVatCol} onClick={() => setListVatCol(!listVatCol)} className={`w-12 h-6 rounded-full relative shrink-0 ${listVatCol ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${listVatCol ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-card-serial">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🔢</span>
                      <div>
                        <p className="font-bold">الرقم التسلسلي للصنف (شاشة البيع بالبطاقات)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{cardSerialBtn ? 'ظاهر: زر «S/N» بجانب زري الوصف والخصم لكل صنف في السلة، ويُطبع الرقم في الفاتورة' : 'مخفي: يظهر الزر عند تفعيله من هنا'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-card-serial" aria-pressed={cardSerialBtn} onClick={() => setCardSerialBtn(!cardSerialBtn)} className={`w-12 h-6 rounded-full relative shrink-0 ${cardSerialBtn ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${cardSerialBtn ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700" data-testid="setting-line-disc">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">٪</span>
                      <div>
                        <p className="font-bold">خصم الصنف (شاشة البيع بالقائمة)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{lineDiscBtn ? 'ظاهر: بجانب كل صنف زر خصم بنسبة أو مبلغ (حسب صلاحية الخصم)' : 'مخفي: يظهر الزر عند تفعيله من هنا'}</p>
                      </div>
                    </div>
                    <button data-testid="toggle-line-disc" aria-pressed={lineDiscBtn} onClick={() => setLineDiscBtn(!lineDiscBtn)} className={`w-12 h-6 rounded-full relative shrink-0 ${lineDiscBtn ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${lineDiscBtn ? 'left-1' : 'right-1'}`} /></button>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="pos-buttons-settings">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">💳</span>
                      <div>
                        <p className="font-bold">طرق الدفع في شاشة البيع</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">إظهار أو إخفاء أزرار الدفع الإضافية أسفل السلة</p>
                      </div>
                    </div>
                    {([
                      ['credit', '🕒 دفع جزئي / آجل', 'bg-amber-500'],
                      ['bank', '🏦 تحويل بنكي', 'bg-indigo-500'],
                      ['quickPay', '⚡ الدفع السريع (أزرار الفئات النقدية)', 'bg-emerald-500'],
                      ['split', '⇄ تقسيم الدفع (جزء نقدي وجزء شبكة)', 'bg-indigo-500'],
                    ] as const).map(([k, label, on]) => (
                      <div key={k} className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                        <span className="text-sm font-bold">{label}</span>
                        <button data-testid={`toggle-pos-${k}`} aria-pressed={posButtons[k]} onClick={() => setPosButtons({ ...posButtons, [k]: !posButtons[k] })}
                          className={`w-12 h-6 rounded-full relative shrink-0 ${posButtons[k] ? on : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${posButtons[k] ? 'left-1' : 'right-1'}`} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="restaurant-settings">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🍽️</span>
                      <div>
                        <p className="font-bold">طلبات المطعم (محلي / سفري / رقم الطلب)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{businessType === 'restaurant' ? 'تظهر أعلى شاشة البيع وتُطبع في الإيصال وتذكرة المطبخ' : 'تعمل عند اختيار نشاط «مطعم» في إعدادات المنشأة'}</p>
                      </div>
                    </div>
                    {([
                      ['orderTypes', 'نوع الطلب: محلي / سفري / توصيل'],
                      ['orderNumbers', 'ترقيم الطلبات (طلب #1، #2...)'],
                      ['resetOnClosing', 'تصفير رقم الطلبات عند الإقفال اليومي'],
                    ] as const).map(([k, label]) => (
                      <div key={k} className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                        <span className="text-sm font-bold">{label}</span>
                        <button data-testid={`toggle-rest-${k}`} aria-pressed={restOpts[k]} onClick={() => setRestOpts({ ...restOpts, [k]: !restOpts[k] })}
                          className={`w-12 h-6 rounded-full relative shrink-0 ${restOpts[k] ? 'bg-cyan-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${restOpts[k] ? 'left-1' : 'right-1'}`} /></button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700" data-testid="default-order-type">
                      <span className="text-sm font-bold">نوع الطلب المفضّل (يبدأ به كل طلب)</span>
                      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                        {([['dine_in', '🍽️ محلي'], ['takeaway', '🥡 سفري'], ['delivery', '🛵 توصيل']] as const).map(([v, t]) => (
                          <button key={v} type="button" data-type={v} onClick={() => setRestOpts({ ...restOpts, defaultOrderType: v })}
                            className={`px-2.5 py-1 rounded-md text-xs font-black ${restOpts.defaultOrderType === v ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span>آخر رقم طلب: <b className="font-mono" data-testid="order-counter">{Number(orderCounter) || 0}</b></span>
                      <button type="button" onClick={() => { setOrderCounter(0); triggerPrintNotification('تم تصفير رقم الطلبات'); }} className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 font-black text-xs" data-testid="reset-orders">تصفير الآن</button>
                    </div>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="expiry-settings">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">📅</span>
                      <div>
                        <p className="font-bold">تاريخ صلاحية الأصناف</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">يظهر التنبيه في المخزون وعند تسجيل الدخول قبل الانتهاء بعدد الأيام المحدد</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
                      <label className="flex items-center gap-2">التنبيه قبل
                        <input type="number" min={1} max={365} value={expirySettings.warnDays} data-testid="expiry-warn-days"
                          onChange={(e) => setExpirySettings({ ...expirySettings, warnDays: Math.max(1, Math.min(365, Number(e.target.value) || 30)) })}
                          className="w-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-mono text-center" /> يوم</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={expirySettings.blockSale} onChange={(e) => setExpirySettings({ ...expirySettings, blockSale: e.target.checked })} className="w-4 h-4" data-testid="expiry-block" />
                        منع بيع الأصناف المنتهية (وإلا تنبيه فقط)
                      </label>
                    </div>
                  </div>
                  <div className="setting-block p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3" data-testid="discount-rules">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Percent className={`w-6 h-6 shrink-0 ${discountRules.enabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <div>
                          <p className="font-bold">السماح بالخصم</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{discountRules.enabled ? 'مفتوح: يمكن الخصم في البيع وعروض الأسعار حسب الحد أدناه' : 'مغلق: لا يمكن إضافة أي خصم'}</p>
                        </div>
                      </div>
                      <button data-testid="toggle-discount" aria-pressed={discountRules.enabled} onClick={() => setDiscountRules(r => ({ ...r, enabled: !r.enabled }))} className={`w-12 h-6 rounded-full relative shrink-0 ${discountRules.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 ${discountRules.enabled ? 'left-1' : 'right-1'}`} /></button>
                    </div>
                    {discountRules.enabled && (
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold pr-9">
                        <span className="text-slate-600 dark:text-slate-300">الحد الأعلى للخصم:</span>
                        <input type="number" min={1} max={100} value={discountRules.maxPercent} onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setDiscountRules(r => ({ ...r, maxPercent: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))) }))}
                          className="w-20 text-center font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1" data-testid="discount-max" />
                        <span className="text-slate-600 dark:text-slate-300">% من قيمة الفاتورة</span>
                        <span className="text-xs text-slate-500 w-full">{discountRules.maxPercent >= 100 ? '100 = بلا حد إضافي.' : ''} في كل الأحوال لا يُقبل خصم يساوي قيمة الفاتورة أو يتجاوزها.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* أيقونة البرنامج */}
            <div className="mt-6 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <h3 className="font-black text-lg text-slate-800 dark:text-white">أيقونة البرنامج</h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                تظهر أعلى لوحة التحكم وشاشة البيع، وعلى نافذة البرنامج في شريط المهام.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {([
                  { mode: 'default' as const, title: 'أيقونة الدفتر الذكي', src: appIcon, disabled: false, hint: '' },
                  { mode: 'logo' as const, title: 'شعار المنشأة', src: companySettings.logoUrl || '', disabled: !companySettings.logoUrl, hint: 'ارفع الشعار أولاً من إعدادات المنشأة' },
                  { mode: 'custom' as const, title: 'صورة من جهازك', src: appIconSetting.custom || '', disabled: !appIconSetting.custom, hint: 'اضغط «رفع صورة» بالأسفل' },
                ]).map(o => {
                  const active = appIconSetting.mode === o.mode && (o.mode === 'default' || !!o.src);
                  return (
                    <button
                      key={o.mode}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => setAppIconSetting(s => ({ ...s, mode: o.mode }))}
                      className={`p-3 rounded-xl border-2 flex items-center gap-3 text-right transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border-cyan-600 bg-cyan-50 dark:bg-cyan-900/30' : 'border-slate-200 dark:border-slate-700 hover:border-cyan-400'}`}
                    >
                      <span className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                        {o.src ? <img src={o.src} alt="" className="w-full h-full object-contain" /> : <span className="text-slate-400 text-xl">؟</span>}
                      </span>
                      <span>
                        <span className="block font-black text-sm text-slate-800 dark:text-white">{o.title}</span>
                        {o.disabled && <span className="block text-[11px] font-bold text-slate-400 mt-0.5">{o.hint}</span>}
                        {active && <span className="block text-[11px] font-bold text-cyan-700 dark:text-cyan-300 mt-0.5">مستخدمة الآن</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <label className="px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-black cursor-pointer">
                  رفع صورة
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleAppIconUpload} className="hidden" />
                </label>
                {appIconSetting.custom && (
                  <button type="button" onClick={() => setAppIconSetting({ mode: 'default' })} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-bold cursor-pointer">
                    حذف الصورة والرجوع للأيقونة الأصلية
                  </button>
                )}
                <span className="text-[11px] text-slate-400 font-bold">يُفضَّل صورة مربعة بخلفية ملونة أو شفافة. أيقونة سطح المكتب وملف التثبيت لا تتغير من هنا.</span>
              </div>
            </div>
            <div className="mt-6 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-lg text-slate-800 dark:text-white">الطباعة الصامتة</h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  طباعة الإيصالات وملصقات الباركود مباشرة على الطابعة المحددة دون ظهور نافذة اختيار الطابعة (النسخة المثبتة فقط).
                </p>
                <button onClick={() => setCurrentView('printers')} className="mt-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 cursor-pointer">تحديد الطابعات ←</button>
              </div>
              <button
                disabled={!window.ledger}
                onClick={() => setPrintSettings(p => ({ ...p, silent: !p.silent }))}
                title={window.ledger ? '' : 'متاح في النسخة المثبتة فقط'}
                className={`w-12 h-6 rounded-full relative shrink-0 transition disabled:opacity-40 ${printSettings.silent ? 'bg-emerald-500' : 'bg-slate-400'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${printSettings.silent ? 'right-0.5' : 'right-6'}`} />
              </button>
            </div>
          </div>
        );

      case 'license':
        return <LicenseView status={license.status} onStatus={license.setStatus} notify={triggerPrintNotification} canManage={canView(currentUser, 'settings')} companyName={companySettings.companyName} companyPhone={companySettings.mobile || companySettings.phone} />;

      case 'about':
        return <AboutView iconSrc={brandIcon} canManage={allowed('settings.manage')} />;

      case 'backup':
        return (
          <div className="p-6 max-w-5xl mx-auto">
            <BackupManager notify={triggerPrintNotification} invoices={invoices} onArchiveInvoice={(inv) => archiveInvoice(inv, false)} />
            <DataResetPanel
              isAdmin={currentUser?.role === 'admin'}
              zatcaActive={zatcaActive}
              counts={{ products: products.length, groups: productGroups.length, customers: customers.length, invoices: invoices.length }}
              onReset={resetData}
            />
          </div>
        );

      default:
        return (<div className="h-full flex items-center justify-center text-slate-500"><h2 className="text-2xl font-black">الواجهة: {currentView}</h2></div>);
    }
  };

  // Real browser system printing effect - keep preview open and allow stable printing
  useEffect(() => {
    if (printInvoiceData) {
      const intent = printIntentRef.current;
      printIntentRef.current = 'print';
      if (intent === 'preview') return;
      // الطباعة الصامتة مغلقة: تبقى المعاينة ليختار المستخدم القالب (إيصال 80مم / A4) ثم «طباعة» على طابعته المخصصة
      if (intent === 'print' && !printSettings.silent && window.ledger) return;
      const timer = setTimeout(() => {
        if (intent === 'pdf') void saveInvoicePdf(activePrintTemplate);
        else void doPrint(activePrintTemplate, intent === 'direct');
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [printInvoiceData]);

  // Support ESC key to safely close print previews, alerts, and parked order modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDiscountModalOpen) setIsDiscountModalOpen(false);
        if (isParkModalOpen) setIsParkModalOpen(false);
        if (isParkedOrdersModalOpen) setIsParkedOrdersModalOpen(false);
        if (orderToRestore) setOrderToRestore(null);
        if (previewParkedOrder) setPreviewParkedOrder(null);
        if (lastCashChange) setLastCashChange(null);
        if (printInvoiceData) setPrintInvoiceData(null);
        if (printZReportData) setPrintZReportData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [printInvoiceData, printZReportData, lastCashChange, isParkModalOpen, isParkedOrdersModalOpen, orderToRestore, previewParkedOrder, isDiscountModalOpen]);

  if (!isLoggedIn) {
    return (
      <div className={`font-sans ${isDarkMode ? 'dark' : ''}`}>
        <LoginScreen
          users={users}
          iconSrc={brandIcon}
          companyName={companySettings.companyName}
          lastUserId={lastUserId}
          onLogin={loginAs}
          onSetupAdmin={loginAs}
          onResetPassword={loginAs}
          fullscreen={hideTaskbar}
          onExitFullscreen={() => setHideTaskbar(false)}
          language={uiLanguage}
          onToggleLanguage={() => setUiLanguage(uiLanguage === 'en' ? 'ar' : 'en')}
        />
      </div>
    );
  }

  return (
    <div className={`font-sans ${isDarkMode ? 'dark' : ''}`}>
      {floatAsk && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in" data-testid="float-ask">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="bg-amber-500 text-slate-950 p-4 flex items-center gap-2 font-black">
              <Coins className="w-5 h-5" />
              <span>نقدية بداية الوردية</span>
            </div>
            <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); recordFloat(Number(floatAskValue) || 0); }}>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">كم النقد الموجود في الدرج الآن قبل البيع؟ سيُحسب في الصندوق وفي النقد المتوقع عند الإقفال.</p>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="any" autoFocus value={floatAskValue} placeholder="0.00" data-testid="float-ask-amount"
                  onChange={(e) => setFloatAskValue(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border-2 border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 font-mono text-center text-lg font-black" dir="ltr" />
                <SaudiRiyalSymbol className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">الكاشير: {cashierDisplayName}{lastCloseAt ? ` — بعد إقفال ${lastCloseAt.slice(0, 16)}` : ''}</p>
              <div className="flex gap-2">
                <button type="submit" data-testid="float-ask-save" className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl cursor-pointer">تسجيل وبدء الوردية</button>
                <button type="button" data-testid="float-ask-zero" onClick={() => recordFloat(0)} className="px-3 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-bold rounded-xl text-sm cursor-pointer" title="الدرج يبدأ فارغاً">الدرج فارغ</button>
                <button type="button" data-testid="float-ask-later" onClick={() => setFloatAsk(false)} className="px-3 py-2.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold rounded-xl text-sm cursor-pointer">لاحقاً</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingApproval && (
        <ApprovalModal
          users={users}
          permission={pendingApproval.perm}
          onClose={() => setPendingApproval(null)}
          onApproved={(approver) => {
            const { perm, run } = pendingApproval;
            if (SALE_SCOPED.includes(perm)) setSaleApprovals(prev => new Set(prev).add(perm));
            setPendingApproval(null);
            triggerPrintNotification(`تمت الموافقة بواسطة ${approver.fullName}`);
            run();
          }}
        />
      )}
      {/* Dynamic layout container for desktop/tablet rendering */}
      <div className="print:hidden">
        {currentView === 'pos' ? renderPOS() : (
          <div className="h-screen bg-slate-100 dark:bg-slate-900 flex flex-col overflow-hidden transition-colors" dir={uiDir}>
            {zatcaActive && <ZatcaUnsentBanner onOpen={() => (canView(currentUser, 'einvoice') ? setCurrentView('einvoice') : triggerPrintNotification('اطلب من المدير مراجعة شاشة الفاتورة الإلكترونية'))} />}
            <LicenseBanner status={license.status} onOpen={() => setCurrentView('license')} />
            <TopBar onLogout={handleLogout} activeLanguage={uiLanguage} onToggleLanguage={() => setUiLanguage(uiLanguage === 'en' ? 'ar' : 'en')} iconSrc={brandIcon} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} sidebarCollapsed={sidebarCollapsed} />
            {printNotification && (
              <div data-testid="app-toast" className="fixed top-4 left-1/2 -translate-x-1/2 z-[10050] bg-slate-800 text-white px-6 py-3 rounded-2xl max-w-[90vw] shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0" /> <span className="font-bold">{printNotification}</span>
              </div>
            )}
            <div className={`flex flex-1 min-h-0 overflow-hidden ${sideReverse ? 'flex-row-reverse' : ''}`} data-sidebar-side={sideIsLeft ? 'left' : 'right'}>
               <Sidebar dir={uiDir} currentView={currentView} onViewChange={(view) => setCurrentView(view as ExtendedViewType)} onLogout={handleLogout} isAllowed={viewAllowed} user={currentUser} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)} />
               <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 relative p-4 transition-colors">
                 {renderDashboardView()}
               </main>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Details view overlay modal */}
      {selectedInvoiceForModal && (
        <InvoiceView 
          invoice={selectedInvoiceForModal} 
          onClose={() => setSelectedInvoiceForModal(null)} 
          onPrint={(inv, currCode) => { setSelectedInvoiceForModal(null); openInvoicePrint(inv, 'preview', undefined, currCode, true); }} 
          multiCurrencySettings={companySettings.multiCurrency}
          companySettings={companySettings}
        />
      )}

      {/* فاتورة من شاشة البيع (بحث أو مسح باركود الإيصال): الإجراءات دون مغادرة الشاشة */}
      {posDoc && (() => {
        const live = invoices.find((i) => i.id === posDoc.id) || posDoc;
        const isRet = isReturnDoc(live);
        const returnedLines = isRet ? undefined : returnedQtyByLine(invoices, live.id);
        const canRet = !isRet && hasReturnableQty(live, returnedLines);
        const related = isRet ? invoices.filter((i) => i.id === live.originalInvoiceId) : invoices.filter((i) => isReturnDoc(i) && i.originalInvoiceId === live.id);
        return (
          <ScannedInvoicePanel
            invoice={live}
            related={related}
            canReturn={canRet}
            returnedAll={!isRet && related.length > 0 && !canRet}
            onClose={() => { setPosDoc(null); setTimeout(() => barcodeInputRef.current?.focus(), 0); }}
            onView={() => { setPosDoc(null); setSelectedInvoiceForModal(live); }}
            onPrint={() => { setPosDoc(null); openInvoicePrint(live, 'print', undefined, undefined, true); }}
            onReturn={canRet ? () => { setPosDoc(null); setPosReturnInv(live); } : undefined}
            onPay={() => { setPosDoc(null); setPosPayInv(live); }}
            onOpen={(inv) => setPosDoc(inv)}
          />
        );
      })()}
      {posReturnInv && (
        <SalesReturnModal
          invoice={posReturnInv}
          allInvoices={invoices}
          onClose={() => setPosReturnInv(null)}
          onConfirm={(req) => { const inv = posReturnInv; setPosReturnInv(null); if (requireLicense()) guard('sales.return', () => handleCreateReturn(inv.id, req)); }}
        />
      )}
      {posPayInv && (
        <InvoicePaymentModal
          invoice={posPayInv}
          onClose={() => setPosPayInv(null)}
          onConfirm={(amount, method) => { const inv = posPayInv; setPosPayInv(null); guard('invoices.collect', () => handlePayInvoice(inv.id, amount, method)); }}
        />
      )}

      {payConfirm && (
        <PayConfirmModal data={payConfirm} onCancel={() => setPayConfirm(null)}
          onConfirm={() => { const a = payConfirm.args; setPayConfirm(null); void handleCheckout(a[0], a[1], a[2], a[3], a[4], true); }} />
      )}

      {/* Real Windows Printer rendering container for Invoices */}
      {printInvoiceData && (
        <div 
          id="printable-invoice-container" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrintInvoiceData(null);
            }
          }}
          className={`fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start print:static print:p-0 print:bg-white ${printGhost ? 'print-ghost' : 'animate-in fade-in duration-150'}`}
          data-ghost={printGhost ? '1' : undefined}
          dir="rtl"
        >
          {/* شريط التحكم: العنوان في المنتصف، وتحته القوالب والأزرار في سطر واحد */}
          <div className="no-print bg-slate-900 border border-slate-700 text-white px-3.5 py-3 rounded-2xl mb-4 max-w-[900px] w-full flex flex-col items-center gap-2.5 shadow-2xl" data-testid="print-preview-bar">
            <div className="text-center leading-tight">
              <span className="block text-white font-black text-sm">معاينة الطباعة — فاتورة #{printInvoiceData.invoiceNumber || printInvoiceData.number}</span>
              <span className="text-[11px] text-slate-400">متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك ({printInvoiceData?.zatca ? 'ZATCA Phase 2' : 'ZATCA Phase 1'})</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-nowrap w-full overflow-x-auto">
              {/* القوالب: إيصال 80مم / A4 / A5 */}
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold shrink-0" data-testid="print-templates">
                {([['thermal80', 'إيصال 80مم'], ['A4', printSettings.dotMatrix && (printSettings.dotMatrixPaper || 'cf11') in CONTINUOUS_PAPERS ? CONTINUOUS_PAPERS[(printSettings.dotMatrixPaper || 'cf11') as 'cf11' | 'cf12'].label : 'A4'], ['A5', 'A5']] as const).filter(([k]) => previewPaperOn(printSettings, k === 'thermal80' ? 'thermal' : k)).map(([k, label]) => {
                  const on = k === 'thermal80' ? activePrintTemplate === 'thermal80' : activePrintTemplate === 'A4' && previewPaper === k;
                  return (
                    <button key={k} type="button" data-testid={`tpl-${k}`}
                      onClick={() => { if (k === 'thermal80') setActivePrintTemplate('thermal80'); else { setActivePrintTemplate('A4'); setPreviewPaper(k); } }}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${on ? 'bg-cyan-500 text-slate-950 font-black shadow' : 'text-slate-300 hover:text-white'}`}>
                      {k === 'thermal80' ? <Receipt className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <button 
                type="button"
                onClick={() => { void doPrint(activePrintTemplate); }} 
                title={targetPrinterFor(activePrintTemplate) ? `الطابعة: ${targetPrinterFor(activePrintTemplate)}` : 'الطابعة الافتراضية'}
                className="shrink-0 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs cursor-pointer shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 active:scale-95 transition"
              >
                <Printer className="w-4 h-4" />
                <span className="max-w-[11rem] truncate">طباعة{targetPrinterFor(activePrintTemplate) ? ` ← ${targetPrinterFor(activePrintTemplate)}` : ''}</span>
              </button>
              <div className="shrink-0"><ShareMenu onShare={(t) => shareInvoice(activePrintTemplate, t)} /></div>
              <button 
                type="button"
                onClick={() => { void saveInvoicePdf(activePrintTemplate); }} 
                className="shrink-0 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-xl text-xs cursor-pointer flex items-center gap-1.5 active:scale-95 transition whitespace-nowrap"
                data-testid="save-pdf"
              >
                <FileText className="w-4 h-4" />
                <span>حفظ PDF</span>
              </button>
              <button 
                type="button"
                onClick={() => setPrintInvoiceData(null)} 
                className="shrink-0 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl text-xs cursor-pointer border border-slate-700 transition flex items-center gap-1 whitespace-nowrap"
                title="إغلاق المعاينة (Esc)"
              >
                <X className="w-4 h-4" />
                <span>إغلاق</span>
              </button>
            </div>
          </div>

          {/* Printable Invoice View */}
          <div className="w-full flex justify-center pb-8 print:pb-0" id="printable-invoice-body">
            <PrintableInvoice 
              invoice={printInvoiceData} 
              settings={companySettings} 
              customer={printInvoiceData.customerId ? customers.find(c => c.id === printInvoiceData.customerId) : undefined}
              printer={printersList.find(p => p.id === selectedRetailPrinterId)} 
              currencyCode={printInvoiceCurrency}
              templateOverride={activePrintTemplate}
              isCopy={printIsCopy}
            />
          </div>
        </div>
      )}

      {isCustomerPickerOpen && (
        <PosCustomerPicker
          customers={customers}
          selectedId={selectedCustomerId}
          onSelect={(id) => { setSelectedCustomerId(id); setIsCustomerPickerOpen(false); }}
          onCreate={handleCreateCustomerFromPos}
          onClose={() => setIsCustomerPickerOpen(false)}
        />
      )}

      {isQuickProductOpen && (
        <QuickProductModal
          groups={productGroups}
          products={products}
          defaultGroupId={activeCategory !== 'الكل' ? productGroups.find(g => g.nameAr === activeCategory)?.id : undefined}
          onSave={handleQuickAddProduct}
          onClose={() => setIsQuickProductOpen(false)}
          pricesIncludeTax={pricesIncludeTax}
          taxRatePercent={companySettings.taxRate ?? 15}
        />
      )}

      {purchaseLabels && (
        <BarcodeLabelsDialog
          key={purchaseLabels.id}
          products={products}
          initialIds={Array.from(new Set<string>(purchaseLabels.items.map(i => i.productId)))}
          initialCounts={purchaseLabels.items.map(i => ({ productId: i.productId, qty: i.qty, unitName: i.unitName, factor: i.factor }))}
          subtitle={`فاتورة شراء${purchaseLabels.supplierInvoiceNo ? ' ' + purchaseLabels.supplierInvoiceNo : ''} — ${purchaseLabels.supplierName}`}
          companyName={companySettings.companyName}
          taxRatePercent={companySettings.taxRate ?? 15}
          pricesIncludeTax={pricesIncludeTax}
          printSettings={printSettings}
          onChangePrintSettings={setPrintSettings}
          onUpdateProduct={(id, updated) => setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))}
          onAddProduct={(np) => setProducts(prev => [np, ...prev])}
          groups={productGroups}
          notify={triggerPrintNotification}
          onClose={() => setPurchaseLabels(null)}
        />
      )}
      {editPickerOpen && (
        <EditItemPicker products={products} onClose={() => setEditPickerOpen(false)}
          onPick={(p) => { setEditPickerOpen(false); setEditingProduct(p); }} />
      )}
      {editingProduct && (
        <QuickProductModal
          key={editingProduct.id}
          editing={editingProduct}
          hideAddToCart
          groups={productGroups}
          products={products}
          onSave={(p) => {
            setProducts(prev => prev.map(x => x.id === p.id ? p : x));
            setEditingProduct(null);
            triggerPrintNotification(`تم تعديل الصنف ${p.nameAr}`);
          }}
          onClose={() => setEditingProduct(null)}
          pricesIncludeTax={pricesIncludeTax}
          taxRatePercent={companySettings.taxRate ?? 15}
        />
      )}

      {isPartialModalOpen && (
        <PartialPaymentModal
          total={calculatedTotal}
          customers={customers}
          initialCustomerId={selectedCustomerId || undefined}
          onClose={() => setIsPartialModalOpen(false)}
          onConfirm={handlePartialConfirm}
        />
      )}

      {/* Real Windows Printer rendering container for Z-Report */}
      {printZReportData && (
        <div 
          id="printable-zreport-container" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrintZReportData(null);
            }
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start print:static print:p-0 print:bg-white animate-in fade-in duration-150" 
          dir="rtl"
        >
          <div className="no-print bg-slate-900 border border-slate-700 text-white p-3.5 rounded-2xl mb-4 max-w-[450px] w-full flex justify-between items-center shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-bold">
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-white font-black">معاينة تقرير الإقفال (Z-Report)</span>
                <span className="text-[11px] text-slate-400">معتمد برمز التدقيق والتوثيق المالي</span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <ShareMenu onShare={shareZReport} label="" className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg text-xs flex items-center gap-1 cursor-pointer" />
              <button 
                type="button"
 onClick={() => { void printZReportNow(); }}
                title="إعادة الطباعة على طابعة الكاشير" 
                className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-black rounded-lg text-xs cursor-pointer shadow flex items-center gap-1 active:scale-95 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة</span>
              </button>
              <button 
                type="button"
                onClick={() => setPrintZReportData(null)} 
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs cursor-pointer border border-slate-700 flex items-center gap-1"
                title="إغلاق (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>
          </div>
          {/* نفس معرّف حاوية الإيصال: الطباعة الحرارية المباشرة (بلا فراغ أعلى الورقة) وقياس الطول */}
          <div className="w-full flex justify-center" id={printInvoiceData ? undefined : 'printable-invoice-body'}>
            <PrintableZReport 
              record={printZReportData} 
              settings={companySettings}
              onClose={() => setPrintZReportData(null)}
            />
          </div>
        </div>
      )}

      {/* Embedded print overrides styled to isolate printable invoices completely */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-invoice-container, #printable-invoice-container *,
          #printable-zreport-container, #printable-zreport-container * {
            visibility: visible;
            /* إبقاء الخلفيات الملونة (شريط الترويسة، رأس الجدول، الإجمالي) في الطباعة وملف PDF */
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-invoice-container, #printable-zreport-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            display: block !important;
            overflow: visible !important;
          }
          .no-print, .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
          /* بقية شاشات البرنامج مخفية (visibility) لكنها تحجز مساحة → قد تُطبع ورقة فارغة إضافية؛ نُسقطها من التخطيط */
          body:has(#printable-invoice-container, #printable-zreport-container) *:not(:has(#printable-invoice-container, #printable-zreport-container)):not(#printable-invoice-container):not(#printable-invoice-container *):not(#printable-zreport-container):not(#printable-zreport-container *) {
            display: none !important;
          }
          body:has(#printable-invoice-container, #printable-zreport-container) *:has(#printable-invoice-container, #printable-zreport-container) {
            height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; padding: 0 !important; margin: 0 !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            /* الوضع الداكن: هوامش الصفحة كانت تُطبع داكنة (إطار) — الطباعة دائماً فاتحة */
            color-scheme: light !important;
            height: auto !important;
            overflow: visible !important;
          }
        }
      `}</style>
      {/* هامش الصفحة الافتراضي — في عنصر مستقل يُعطَّل أثناء طباعة الإيصال على «ورق الطابعة» (الهوامش من التعريف) */}
      <style id="sl-print-page-margin">{`@media print { @page { margin: 3mm; } }`}</style>
    </div>
  );
}

// ==========================================
// REAL COMPLIANT WINDOWS PRINTABLE INVOICE RECEIPT TEMPLATE WITH MULTI-CURRENCY & ZATCA QR
// ==========================================
type CheckoutMethod = 'cash' | 'card' | 'bank' | 'split';
type CheckoutPartial = { customerId: string; customerName: string; paid: number; method: PayMethod };
type CheckoutSplit = { cash: number; card: number };

/** نافذة «تأكيد الدفع وحفظ الفاتورة» — Enter للتأكيد و Esc للإلغاء */
function PayConfirmModal({ data, onConfirm, onCancel }: { data: { total: number; paid: number; change: number; remaining: number; label: string; split?: CheckoutSplit }; onConfirm: () => void; onCancel: () => void }) {
  const done = useRef(false);
  const ok = () => { if (done.current) return; done.current = true; onConfirm(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); ok(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const f = (v: number) => v.toFixed(2);
  const row = (k: string, v: string, cls = '') => <div className={`flex items-center justify-between gap-3 ${cls}`}><span className="text-slate-500 dark:text-slate-400">{k}</span><span className="font-mono font-black" dir="ltr">{v}</span></div>;
  return (
    <div className="fixed inset-0 z-[10050] bg-black/60 flex items-center justify-center p-4 print:hidden" onClick={onCancel}>
      <div dir="rtl" data-testid="pay-confirm" className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 flex items-center justify-center text-2xl mb-2">✓</div>
          <h3 className="font-black text-lg text-slate-900 dark:text-white">تأكيد الدفع وحفظ الفاتورة؟</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">طريقة الدفع: <b className="text-slate-800 dark:text-slate-100" data-testid="pay-confirm-method">{data.label}</b></p>
        </div>
        <div className="mx-5 mb-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-1.5 text-sm text-slate-800 dark:text-slate-100">
          {row('الإجمالي', f(data.total), 'text-base')}
          {data.split && <>{row('نقداً', f(data.split.cash))}{row('شبكة', f(data.split.card))}</>}
          {data.remaining > 0 && <>{row('المدفوع', f(data.paid))}{row('المتبقي على العميل', f(data.remaining), 'text-amber-600')}</>}
          {data.change > 0 && <>{row('المستلم', f(data.paid))}{row('الباقي للعميل', f(data.change), 'text-emerald-600')}</>}
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          <button type="button" autoFocus onClick={ok} data-testid="pay-confirm-ok" className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-pointer">تأكيد وحفظ <span className="text-[10px] opacity-80">(Enter)</span></button>
          <button type="button" onClick={onCancel} data-testid="pay-confirm-cancel" className="py-3 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-black cursor-pointer">إلغاء <span className="text-[10px] opacity-70">(Esc)</span></button>
        </div>
      </div>
    </div>
  );
}

/** نص رمز QR للفاتورة: المختوم من المرحلة الثانية إن وُجد، وإلا رمز المرحلة الأولى */
function invoiceQrPayload(invoice: Invoice, settings: CompanySettings): string {
  if (invoice.zatca?.qr) return invoice.zatca.qr;
  const legacyDiv = 1 + (settings.taxRate ?? 15) / 100;
  const sub = invoice.subtotal !== undefined ? invoice.subtotal : invoice.total / legacyDiv;
  const tax = invoice.tax !== undefined ? invoice.tax : invoice.total - sub;
  return generateZatcaTlvBase64({
    sellerName: settings.companyName,
    vatNumber: settings.vatNumber,
    timestamp: invoice.date || new Date().toISOString(),
    totalWithVat: Math.abs(invoice.total),
    vatAmount: Math.abs(tax),
  });
}

function PrintableZatcaQr({ payload, size = 110, framed = true, preset }: { payload: string; size?: number; framed?: boolean; preset?: string }) {
  const [url, setUrl] = useState<string>(preset || '');
  useEffect(() => {
    let mounted = true;
    // رمز المرحلة الثانية أطول بكثير → تصحيح أخطاء منخفض ليبقى مقروءاً على الطابعة الحرارية
    generateQrDataUrl(payload, { width: size * 3, margin: 1, errorCorrectionLevel: payload.length > 300 ? 'L' : 'M' }).then(u => {
      if (mounted) setUrl(u);
    });
    return () => { mounted = false; };
  }, [payload, size]);

  if (!url) {
    return <div style={{ width: size, height: size }} className="bg-gray-100 mx-auto" data-qr-pending="1" />;
  }
  return (
    <img 
      src={url} 
      alt="ZATCA Fatoora QR Code" 
      style={{ width: size, height: size }} 
      className={`mx-auto block object-contain bg-white ${framed ? 'border border-black p-0.5' : ''}`}
    />
  );
}

function PrintableInvoice({ 
  invoice, 
  settings, 
  printer, 
  currencyCode,
  templateOverride,
  customer,
  isCopy,
  qrDataUrl,
  bilingual = printBilingual(),
}: { 
  isCopy?: boolean;
  /** بلغتين (عربي + إنجليزي) — افتراضياً حسب زر «ترجمة» في شاشة الطابعات */
  bilingual?: boolean;
  /** رمز QR جاهز (للأرشفة: الرسم الثابت لا ينتظر توليد الرمز) */
  qrDataUrl?: string;
  invoice: Invoice; 
  settings: CompanySettings; 
  customer?: Customer;
  printer?: AppPrinter; 
  currencyCode?: string; 
  templateOverride?: 'thermal80' | 'A4';
}) {
  const invoiceNum = invoice.invoiceNumber || invoice.number || 'INV-0000';
  const legacyDiv = 1 + (settings.taxRate ?? 15) / 100; // للفواتير القديمة التي لم تُحفظ فيها الضريبة
  const subTotalAmount = invoice.subtotal !== undefined ? invoice.subtotal : (invoice.total / legacyDiv);
  const taxAmount = invoice.tax !== undefined ? invoice.tax : (invoice.total - subTotalAmount);
  const isA4 = templateOverride ? (templateOverride === 'A4') : (printer?.template === 'A4');
  const a5 = isA4 && largePaper() === 'A5';
  // ورق بترويسة وتذييل مطبوعين مسبقاً
  const lh = isA4 ? letterhead() : null;
  // وضع الطابعة الإبرية: بلا خلفيات ولا ألوان، خطوط رفيعة، باركود وQR أكبر
  const dm = isA4 && dotMatrix();
  // mono: بلا ألوان — وضع الإبرية أو تصميم «مفرّغ» (الإبرية وحدها تكبّر الخط والباركود)
  const mono = dm || (isA4 && plainTheme());
  // ورق متصل للإبرية (9.5×11 / 9.5×12 إنش): مقاس صريح وهامش جانبي يتجاوز شريطي الثقوب
  const cf = isA4 && !a5 ? continuousPaper() : null;
  // (أعلى يمين أسفل يسار) — المحتوى أعرض: 3مم يميناً و1مم يساراً
  const pageMargin = cf
    ? (lh ? `${lh.topMm}mm ${CONTINUOUS_SIDE_MM}mm ${lh.bottomMm}mm` : `8mm ${CONTINUOUS_SIDE_MM}mm 12mm`)
    : lh ? `${lh.topMm}mm ${a5 ? '2mm' : '3mm'} ${lh.bottomMm}mm ${a5 ? '6mm' : '5mm'}` : a5 ? '6mm 2mm 9mm 6mm' : '8mm 3mm 12mm 5mm';

  // Multi-Currency configuration resolution
  const baseCurrencyCode = settings.multiCurrency?.baseCurrency || 'SAR';
  const currenciesList = settings.multiCurrency?.currencies || [];
  const activeCurrency = currenciesList.find(c => c.code === (currencyCode || invoice.currency || baseCurrencyCode))
    || currenciesList.find(c => c.code === baseCurrencyCode)
    || { code: 'SAR', nameAr: 'ريال سعودي', symbol: '﷼', exchangeRate: 1.0, isBase: true, isEnabled: true };
  
  const isForeign = activeCurrency.code !== baseCurrencyCode;
  // اسم الصنف حسب إعداد «أسماء الأصناف في الفواتير»: عربي / إنجليزي / الاثنان (الإنجليزي تحت العربي)
  const nameMode = settings.invoiceItemNames || 'ar';
  const itemLabel = (item: Invoice['items'][number], enCls: string, forceBoth = false) => {
    const mode = forceBoth ? 'both' : nameMode;
    if (mode === 'ar') return item.name;
    const en = englishNameOf(item);
    // الاسم «الإنجليزي» نفس العربي أو مكتوب بالعربي (أُدخل في خانة الإنجليزي بالخطأ): لا نكرره
    const same = (x: string) => x.replace(/\s+/g, ' ').trim();
    if (!en || same(en) === same(item.name) || /[\u0600-\u06FF]/.test(en)) return item.name;
    if (mode === 'en') return <span dir="ltr" data-testid="item-name-en">{en}</span>;
    return <>{item.name}<div className={`${enCls} font-semibold leading-tight`} dir="ltr" style={{ textAlign: 'right' }} data-testid="item-name-en">{en}</div></>;
  };
  const rate = activeCurrency.exchangeRate || 1.0;
  const convert = (val: number) => (isForeign && rate > 0 ? val / rate : val);
  const currSym = activeCurrency.symbol;
  const isSar = activeCurrency.code === 'SAR' || activeCurrency.symbol === 'ر.س' || activeCurrency.symbol === '⃁' || activeCurrency.symbol === '﷼';
  const renderInvCurr = (className = "w-3 h-3 inline-block align-middle") => {
    if (isSar) {
      return <SaudiRiyalSymbol raw className={className} />;
    }
    return <span>{currSym}</span>;
  };

  // المرحلة الثانية: رمز QR المختوم من الفاتورة نفسها (أو المعتمد من الهيئة للضريبية) — وإلا رمز المرحلة الأولى
  const z = invoice.zatca;
  // بلا ختم إلكتروني (قبل الربط مع منصة فاتورة): النوع حسب الرقم الضريبي للعميل
  const isStandard = z?.kind ? z.kind === 'standard' : isValidVat(customer?.vatNumber);
  const a4c = mono ? { ...a4Colors(), main: '#000', soft: 'transparent', softBorder: '#000' } : a4Colors();
  const phase2 = !!z?.qr;
  const zatcaQrPayload = invoiceQrPayload(invoice, settings);
  const isReturnDocument = invoice.docType === 'return';
  // منشأة غير مسجّلة في الضريبة: فاتورة مبيعات عادية بلا ضريبة ولا رقم ضريبي ولا QR
  const noVat = settings.vatUnregistered === true;
  const docTitle = isReturnDocument
    ? (noVat ? 'إشعار مرتجع مبيعات' : isStandard ? 'إشعار دائن — مرتجع (فاتورة ضريبية)' : 'إشعار دائن — مرتجع مبيعات')
    : (noVat ? 'فاتورة مبيعات' : isStandard ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة');
  // فرق الهللات بين (الصافي + الضريبة) والمبلغ المدفوع — يظهر في فاتورة الهيئة كـ «تقريب»
  const payRounding = Math.round((Math.abs(invoice.total) - (Math.abs(invoice.subtotal ?? 0) + Math.abs(invoice.tax ?? 0))) * 100) / 100;
  const buyerLines = isStandard && customer ? [
    customer.vatNumber ? `الرقم الضريبي: ${customer.vatNumber}` : '',
    [customer.street, customer.buildingNumber && `مبنى ${customer.buildingNumber}`, customer.district, customer.city, customer.postalCode].filter(Boolean).join('، '),
  ].filter(Boolean) : [];

  if (isA4) {
    // فاتورة A4 أنيقة — تصلح للطباعة بالأبيض والأسود
    const m = (v: number) => convert(v).toFixed(2);
    const payLabel = paymentLabel(invoice);
    const lineNet = (it: Invoice['items'][number]) => (it.price || 0) * (it.qty || 0);
    const lineTax = (it: Invoice['items'][number]) => (it.tax !== undefined ? it.tax : (it.total || 0) - (it.total || 0) / legacyDiv);
    const titleEn = isReturnDocument ? (noVat ? 'SALES RETURN NOTE' : 'CREDIT NOTE') : noVat ? 'SALES INVOICE' : isStandard ? 'TAX INVOICE' : 'SIMPLIFIED TAX INVOICE';
    // بلغتين (إعداد «ترجمة» بجانب قوالب A4): T = الإنجليزي بجانب العربي، TB = الإنجليزي تحت العربي
    const bi = bilingual;
    // A5 = تصميم A4 مصغّر: الإنجليزي أكبر نصف درجة وأعرض حتى يبقى واضحاً
    const enCls = a5 ? 'font-bold' : 'font-semibold';
    const T = (ar: string, en: string) => bi ? <>{ar} <span className={`a4-en ${a5 ? 'text-[0.95em]' : 'text-[0.85em]'} ${enCls}`} dir="ltr">{en}</span></> : ar;
    const TB = (ar: string, en: string) => bi ? <>{ar}<span className={`a4-en block ${a5 ? 'text-[10.5px]' : 'text-[9.5px]'} ${enCls} leading-tight`} dir="ltr">{en}</span></> : ar;
    const enOf = (ar: string) => { const e = trUi(ar); return bi && e && e !== ar ? e : ''; };
    return (
      <div data-testid="a4-invoice" data-paper={cf ? 'CF' : a5 ? 'A5' : 'A4'} className={`a4-invoice${mono ? ' a4-dm' : ''}${dm ? ' text-[13px]' : ' text-[12px]'} bg-white text-black w-full max-w-[820px] mx-auto shadow-lg font-sans text-right print:shadow-none`} data-dot-matrix={mono ? '1' : undefined} dir="rtl" style={a5 ? { zoom: 0.76 } : undefined}>
        {/* ترقيم الصفحات عند الطباعة/PDF: «صفحة X من Y» أسفل كل صفحة */}
        <style>{`@media print { html, body { background: #fff !important; color-scheme: light !important; } @page { size: ${cf ? `${cf.w}mm ${cf.h}mm` : a5 ? 'A5' : 'A4'}; margin: ${pageMargin} !important; ${lh ? '' : `@bottom-center { content: ${bi ? PAGE_NO_BI : '"صفحة " counter(page) " من " counter(pages)'}; font: ${a5 ? 8 : 10}px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()}`} } .a4-invoice thead { display: table-header-group; } .a4-invoice tr { break-inside: avoid; } } ${mono ? dotMatrixCss('.a4-dm', dm) : ''}`}</style>
        {/* ورق بترويسة جاهزة: مكانها على الشاشة فقط (لا يُطبع — الهامش العلوي للصفحة يتركه فارغاً) */}
        {lh && <div className="print:hidden m-3 mb-0 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 font-bold text-xs" style={{ height: `${lh.topMm}mm` }} data-testid="lh-top">مكان الترويسة المطبوعة مسبقاً ({lh.topMm} مم) — لا تُطبع</div>}
        {/* شريط علوي — بعرض محتوى الورقة */}
        {!lh && !mono && <div className="px-10"><div className="h-2 rounded-b-sm" data-testid="a4-top-stripe" style={{ background: a4c.main }} /></div>}
        <div className={`px-10 ${lh ? 'pt-4 print:pt-0' : 'pt-8'} pb-6 print:pb-0`}>
          {/* ورق بترويسة جاهزة: العنوان في المنتصف، التاريخ يميناً، الرقم يساراً وتحته الباركود */}
          {lh && (
            <div className="pb-3 border-b-2" style={{ borderColor: a4c.main }} data-testid="lh-head">
              <div className="text-center pt-4">
                <div className="text-2xl font-black text-black leading-tight">{docTitle}</div>
                <div className={`${bi ? 'text-[12px]' : 'text-[10px]'} font-bold tracking-[0.2em] text-black`}>{titleEn}</div>
                {isCopy && <div className="mt-1.5"><span data-testid="copy-mark" className="inline-block border-2 border-rose-700 text-rose-700 rounded-md px-3 py-0.5 text-sm font-black">نسخة — معاد طباعتها{bi ? ' · COPY' : ''}</span></div>}
              </div>
              <div className="mt-2 flex items-start justify-between gap-6">
                <div className="text-right">
                  <div><span className="text-black">{T('التاريخ', 'Date')}: </span><span className="font-mono font-bold" dir="ltr" data-testid="lh-date">{String(invoice.date || '').split(/[ T]/)[0]}</span></div>
                  {String(invoice.date || '').split(/[ T]/)[1] && <div><span className="text-black">{T('الوقت', 'Time')}: </span><span className="font-mono font-bold" dir="ltr" data-testid="lh-time">{String(invoice.date || '').split(/[ T]/)[1].slice(0, 8)}</span></div>}
                  {isReturnDocument && invoice.originalInvoiceNumber && <div><span className="text-black">{T('عن الفاتورة', 'Ref. invoice')}: </span><span className="font-mono font-bold" dir="ltr">{invoice.originalInvoiceNumber}</span></div>}
                </div>
                <div className="text-left">
                  <div><span className="text-black">{T('رقم الفاتورة', 'Invoice No.')}: </span><span className="font-mono font-bold" dir="ltr">{invoiceNum}</span></div>
                  {docBarcodeOn('a4') && <div className="mt-1" data-testid="a4-barcode" dangerouslySetInnerHTML={{ __html: docBarcodeHtml(invoiceNum, { heightMm: dm ? 10 : 8, moduleMm: dm ? 0.3 : 0.25, text: false }) }} />}
                </div>
              </div>
            </div>
          )}
          {/* الترويسة */}
          {!lh && <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              {settings.logoUrl && (
                <img src={settings.logoUrl} alt="" className="h-20 w-20 object-contain shrink-0" referrerPolicy="no-referrer" />
              )}
              <div className="min-w-0 space-y-0.5">
                <h1 className="text-2xl font-black text-black leading-tight">{settings.companyName}</h1>
                {settings.companyNameEn?.trim() && <div className="text-[15px] font-bold text-black leading-tight" dir="ltr" style={{ textAlign: 'right' }} data-testid="a4-name-en">{settings.companyNameEn.trim()}</div>}
                {settings.address && <p className="text-black">{settings.address}</p>}
                {settings.shortAddress?.trim() && <p className="text-black" data-testid="a4-short-address">العنوان المختصر{bi ? <> <bdi dir="ltr">Short Address</bdi></> : null}: <span className="font-mono font-bold" dir="ltr">{settings.shortAddress.trim()}</span></p>}
                {contactParts({ phone: settings.phone, mobile: settings.mobile }).length > 0 && (
                  <p className="text-black" data-testid="a4-contact">
                    {contactParts({ phone: settings.phone, mobile: settings.mobile }, bi).map((c, i) => <span key={c.label}>{i > 0 ? ' · ' : ''}{c.label}: <span className="font-mono" dir="ltr">{c.value}</span></span>)}
                  </p>
                )}
                {settings.email && <p className="text-black" data-testid="a4-email">{T('البريد', 'Email')}: <span className="font-mono" dir="ltr">{settings.email}</span></p>}
              </div>
            </div>
            <div className="text-left shrink-0">
              <div className="text-2xl font-black text-black leading-tight text-right">{docTitle}</div>
              <div className={`${bi ? 'text-[12px]' : 'text-[10px]'} font-bold tracking-[0.2em] text-black text-right`} data-testid="a4-title-en">{titleEn}</div>
              {isCopy && (
                <div className="mt-2 text-right"><span data-testid="copy-mark" className="inline-block border-2 border-rose-700 text-rose-700 rounded-md px-3 py-0.5 text-sm font-black">نسخة — معاد طباعتها{bi ? ' · COPY' : ''}</span></div>
              )}
              <div className="mt-3 inline-grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right items-baseline">
                <span className="text-black">{T('رقم الفاتورة', 'Invoice No.')}</span><span className="font-mono font-bold" dir="ltr">{invoiceNum}</span>
                <span className="text-black">{T('التاريخ', 'Date')}</span><span className="font-mono font-bold" dir="ltr">{invoice.date}</span>
                {isReturnDocument && invoice.originalInvoiceNumber && (<><span className="text-black">{T('عن الفاتورة', 'Ref. invoice')}</span><span className="font-mono font-bold" dir="ltr">{invoice.originalInvoiceNumber}</span></>)}
              </div>
              {/* باركود رقم الفاتورة/المرتجع تحت التاريخ — 8 مم وبلا نص (الرقم مكتوب فوقه) */}
              {docBarcodeOn('a4') && <div className="mt-1.5 text-left" data-testid="a4-barcode" dangerouslySetInnerHTML={{ __html: docBarcodeHtml(invoiceNum, { heightMm: dm ? 10 : 8, moduleMm: dm ? 0.3 : 0.25, text: false }) }} />}
            </div>
          </div>}

          {/* بطاقات البائع والعميل والدفع */}
          <div className={`grid ${lh?.hideSeller ? 'grid-cols-2' : 'grid-cols-3'} gap-3 ${lh ? 'mt-4' : 'mt-7'}`}>
            {!lh?.hideSeller && <div className="rounded-md p-3" style={{ borderTop: `${mono ? 1 : 3}px solid ${a4c.main}`, background: a4c.soft }}>
              <div className="text-[11px] font-black mb-1.5" style={{ color: a4c.main }}>{T('البائع', 'Seller')}</div>
              <div className="font-bold">{settings.companyName}</div>
              {settings.companyNameEn?.trim() && <div className="font-bold text-[11px]" dir="ltr" style={{ textAlign: 'right' }}>{settings.companyNameEn.trim()}</div>}
              {!noVat && settings.vatNumber && <div className="text-black">{T('الرقم الضريبي', 'VAT No.')}: <span className="font-mono">{settings.vatNumber}</span></div>}
              {settings.grNumber && <div className="text-black">{T('السجل التجاري', 'CR No.')}: <span className="font-mono">{settings.grNumber}</span></div>}
              {settings.moNumber && <div className="text-black">{T('رخصة البلدية', 'Municipal license')}: <span className="font-mono">{settings.moNumber}</span></div>}
            </div>}
            <div className="rounded-md p-3" style={{ borderTop: `${mono ? 1 : 3}px solid ${a4c.main}`, background: a4c.soft }}>
              <div className="text-[11px] font-black mb-1.5" style={{ color: a4c.main }}>{T('العميل', 'Customer')}</div>
              <div className="font-bold">{customerLabel(invoice.customerName)}{enOf(customerLabel(invoice.customerName)) && <span className={`a4-en block ${a5 ? 'text-[11.5px]' : 'text-[10.5px]'} ${enCls}`} dir="ltr" style={{ textAlign: 'right' }}>{enOf(customerLabel(invoice.customerName))}</span>}</div>
              {isStandard && customer?.vatNumber && <div className="text-black">{T('الرقم الضريبي', 'VAT No.')}: <span className="font-mono">{customer.vatNumber}</span></div>}
              {buyerLines.filter((l) => !l.startsWith('الرقم الضريبي')).map((l, i) => <div key={i} className="text-black">{bi && i === 0 ? <>{T('العنوان', 'Address')}: {l}</> : l}</div>)}
              {!isStandard && customer?.vatNumber && <div className="text-black">{T('الرقم الضريبي', 'VAT No.')}: <span className="font-mono">{customer.vatNumber}</span></div>}
              {!isStandard && customer?.phone && <div className="text-black">{T('جوال', 'Mobile')}: <span className="font-mono">{customer.phone}</span></div>}
            </div>
            <div className="rounded-md p-3" style={{ borderTop: `${mono ? 1 : 3}px solid ${a4c.main}`, background: a4c.soft }}>
              <div className="text-[11px] font-black mb-1.5" style={{ color: a4c.main }}>{T('الدفع', 'Payment')}</div>
              <div className="font-bold">{payLabel}{enOf(payLabel) && <span className={`a4-en block ${a5 ? 'text-[11.5px]' : 'text-[10.5px]'} ${enCls}`} dir="ltr" style={{ textAlign: 'right' }}>{enOf(payLabel)}</span>}</div>
              {(() => { const sp = splitParts(invoice); return sp ? <div className="text-black" data-testid="a4-split">{T('نقدي', 'Cash')} <span className="font-mono">{m(sp.cash)}</span> · {T('شبكة', 'Card')} <span className="font-mono">{m(sp.card)}</span></div> : null; })()}
              {invoice.cashierName && <div className="text-black">{T('الكاشير', 'Cashier')}: {invoice.cashierName}</div>}
              {isForeign && <div className="text-black">{T('العملة', 'Currency')}: {activeCurrency.nameAr} ({activeCurrency.code}) — {T('سعر الصرف', 'Rate')} {rate}</div>}
            </div>
          </div>

          {/* الأصناف */}
          <table className="w-full mt-6 border-collapse text-[12px]">
            <thead>
              <tr className="text-white" style={{ background: a4c.main }}>
                <th className="py-2 px-2 font-bold w-8 text-center rounded-tr-md">#</th>
                <th className="py-2 px-2 font-bold text-right">{TB('الصنف', 'Item')}</th>
                <th className="py-2 px-2 font-bold text-center w-16">{TB('الكمية', 'Qty')}</th>
                <th className="py-2 px-2 font-bold text-center w-24">{TB('سعر الوحدة', 'Unit price')}</th>
                {!noVat && <th className="py-2 px-2 font-bold text-center w-24">{TB('قبل الضريبة', 'Excl. VAT')}</th>}
                {!noVat && <th className="py-2 px-2 font-bold text-center w-20">{TB('الضريبة', 'VAT')}</th>}
                <th className="py-2 px-2 font-bold text-center w-28 rounded-tl-md">{TB('الإجمالي', 'Total')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx} className={`border-b border-slate-200 ${idx % 2 ? 'bg-slate-50' : ''}`} style={{ breakInside: 'avoid' }}>
                  <td className="py-2 px-2 text-center font-mono text-black">{idx + 1}</td>
                  <td className="py-2 px-2 font-bold">{itemLabel(item, a5 ? 'text-[11.5px] font-bold' : 'text-[10.5px]', bi)}{item.description && <div className="text-[10px] font-normal text-black">{item.description}</div>}{item.serial && <div className="text-[10px] font-normal text-black" dir="ltr">S/N: {item.serial}</div>}
                    {item.bundle?.length ? <div className="text-[10px] font-normal text-black" data-testid="a4-bundle">{T('يشمل', 'Includes')}: {item.bundle.map((b) => `${bundleQty(b.qty, item.qty)}× ${b.name}`).join(' + ')}</div> : null}
                    {item.lineDiscount ? <div className="text-[10px] font-bold text-black">{item.promo ? <>{T('عرض', 'Offer')} «{item.promo}»</> : T('خصم الصنف', 'Item discount')}: {m(item.lineDiscount)}</div> : null}
                    {item.bundleSaving ? <div className="text-[10px] font-bold text-black">{T('توفير العرض', 'Offer saving')}: {m(item.bundleSaving)}</div> : null}</td>
                  <td className="py-2 px-2 text-center font-mono">{item.qty}</td>
                  <td className="py-2 px-2 text-center font-mono">{m(item.price || 0)}</td>
                  {!noVat && <td className="py-2 px-2 text-center font-mono">{m(lineNet(item))}</td>}
                  {!noVat && <td className="py-2 px-2 text-center font-mono">{m(lineTax(item))}</td>}
                  <td className="py-2 px-2 text-center font-mono font-bold">{m(item.total || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasVehicle(invoice.vehicle) && (
            <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="a4-vehicle">
              {vehicleRows(invoice.vehicle, bi).map(([k, v]) => <span key={k}><span className="font-black">{k}: </span><span dir="auto">{v}</span></span>)}
            </div>
          )}
          {invoice.note && (
            <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"><span className="font-black">{T('ملاحظة', 'Note')}: </span>{invoice.note}</div>
          )}

          {/* QR + الإجماليات */}
          <div className="flex items-start justify-between gap-8 mt-6" style={{ breakInside: 'avoid' }}>
            {!noVat && (
              <div className="shrink-0" data-testid="a4-qr">
                <PrintableZatcaQr payload={zatcaQrPayload} size={dm ? (phase2 ? 175 : 160) : (phase2 ? 150 : 130)} framed={false} preset={qrDataUrl} />
              </div>
            )}
            <div className="w-[52%] rounded-md overflow-hidden" style={{ borderTop: `${mono ? 1 : 3}px solid ${a4c.main}`, background: a4c.soft }}>
              <div className="p-3 space-y-1.5">
                {invoice.discount && invoice.discount > 0 ? (
                  <>
                    <div className="flex justify-between items-center"><span className="text-black">{TB('المجموع قبل الخصم', 'Subtotal before discount')}</span><span className="font-mono">{m(invoice.rawSubtotal || (subTotalAmount + invoice.discount))}</span></div>
                    <div className="flex justify-between items-center"><span className="text-black">{TB(`الخصم${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`, `Discount${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`)}</span><span className="font-mono">- {m(invoice.discount)}</span></div>
                  </>
                ) : null}
                {noVat ? (
                  <div className="flex justify-between items-center"><span className="text-black">{TB('الإجمالي', 'Subtotal')}</span><span className="font-mono">{m(subTotalAmount)}</span></div>
                ) : (<>
                  <div className="flex justify-between items-center"><span className="text-black">{TB('الإجمالي الخاضع للضريبة', 'Total taxable amount')}</span><span className="font-mono">{m(subTotalAmount)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-black">{TB(`ضريبة القيمة المضافة (${settings.taxRate}%)`, `VAT (${settings.taxRate}%)`)}</span><span className="font-mono">{m(taxAmount)}</span></div>
                </>)}
                {phase2 && Math.abs(payRounding) >= 0.005 && (
                  <div className="flex justify-between items-center"><span className="text-black">{TB('تقريب', 'Rounding')}</span><span className="font-mono">{m(payRounding)}</span></div>
                )}
              </div>
              <div className="flex justify-between items-center text-white px-3 py-2.5" data-dm="bar" style={{ background: a4c.main }}>
                <span className="font-black">{TB('الإجمالي المستحق', 'Total amount due')}</span>
                <span className="font-mono font-black text-lg inline-flex items-center gap-1">{m(invoice.total)} {renderInvCurr("w-4 h-4 inline-block")}</span>
              </div>
              {(invoice.remainingAmount !== undefined && invoice.remainingAmount > 0) ? (
                <div className="p-3 space-y-1 border-t border-slate-200">
                  <div className="flex justify-between items-center"><span className="text-black">{TB('المدفوع', 'Paid')}</span><span className="font-mono">{m(invoice.total - invoice.remainingAmount)}</span></div>
                  <div className="flex justify-between items-center font-black"><span>{TB('المتبقي على العميل', 'Balance due')}</span><span className="font-mono">{m(invoice.remainingAmount)}</span></div>
                </div>
              ) : splitParts(invoice) ? (() => { const sp = splitParts(invoice)!; return (
                <div className="p-3 space-y-1 border-t border-slate-200">
                  <div className="flex justify-between items-center"><span className="text-black">{TB('مدفوع نقداً', 'Paid in cash')}</span><span className="font-mono">{m(sp.cash)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-black">{TB('مدفوع بالشبكة', 'Paid by card')}</span><span className="font-mono">{m(sp.card)}</span></div>
                  {(invoice.changeAmount || 0) > 0 && <div className="flex justify-between items-center"><span className="text-black">{TB('المستلم نقداً / الباقي', 'Cash received / Change')}</span><span className="font-mono">{m(sp.cash + (invoice.changeAmount || 0))} / {m(invoice.changeAmount || 0)}</span></div>}
                </div>
              ); })() : invoice.paymentMethod === 'cash' && invoice.paidAmount !== undefined && (invoice.changeAmount || 0) > 0 ? (
                <div className="p-3 space-y-1 border-t border-slate-200">
                  <div className="flex justify-between items-center"><span className="text-black">{TB('المدفوع نقداً', 'Cash paid')}</span><span className="font-mono">{m(invoice.paidAmount)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-black">{TB('الباقي للعميل', 'Change')}</span><span className="font-mono">{m(invoice.changeAmount || 0)}</span></div>
                </div>
              ) : null}
              {isForeign && (
                <div className="px-3 py-2 border-t border-slate-200 flex justify-between items-center text-black"><span>{TB('المعادل بالريال', 'Equivalent in SAR')}</span><span className="font-mono">{invoice.total.toFixed(2)}</span></div>
              )}
            </div>
          </div>
          {!isForeign && tafqeet(invoice.total, baseCurrencyCode) && (
            <div className="mt-3 rounded-md px-3 py-2 font-bold" style={{ background: a4c.soft, borderRight: `${mono ? 1 : 4}px solid ${a4c.main}`, color: a4c.main }} data-testid="tafqeet">{tafqeet(invoice.total, baseCurrencyCode)}
              {bi && amountInWordsEn(invoice.total, baseCurrencyCode) && <div className={`a4-en ${a5 ? 'text-[12px]' : 'text-[11px]'} ${enCls} mt-0.5`} dir="ltr" style={{ textAlign: 'right' }} data-testid="words-en">{amountInWordsEn(invoice.total, baseCurrencyCode)}</div>}
            </div>
          )}

          {/* الشروط والأحكام + الحساب البنكي (بعد التفقيط وقبل التذييل) */}
          {(() => {
            // خيار «الشروط والبنك في PDF فقط»: تُخفى عند الطباعة بالإبرية/الترويسة الجاهزة وتبقى في PDF والمشاركة
            const pdfOnlyHidden = hidePrintExtras();
            const terms = settings.showTerms !== false && !pdfOnlyHidden ? (settings.invoiceTerms || '').split('\n').map(t => t.trim()).filter(Boolean) : [];
            const bank = (settings.bankOnA4 ?? true) && !pdfOnlyHidden && (settings.bankIban || settings.bankAccountNo) ? settings : null;
            if (!terms.length && !bank) return null;
            return (
              <div className={`mt-4 grid gap-4 ${terms.length && bank ? 'grid-cols-2' : 'grid-cols-1'}`} style={{ breakInside: 'avoid' }}>
                {terms.length > 0 && (
                  <div className="rounded-md p-3 text-[11px] leading-relaxed border" style={{ borderColor: a4c.softBorder }} data-testid="a4-terms">
                    <div className="font-black mb-1" style={{ color: a4c.main }}>{T('الشروط والأحكام', 'Terms & Conditions')}</div>
                    <ol className="list-decimal pr-4 space-y-0.5 text-black">{terms.map((t, i) => <li key={i}>{t}</li>)}</ol>
                  </div>
                )}
                {bank && (
                  <div className="rounded-md p-3 text-[11px] leading-relaxed" style={{ background: a4c.soft, borderTop: `${mono ? 1 : 3}px solid ${a4c.main}` }} data-testid="a4-bank">
                    <div className="font-black mb-1" style={{ color: a4c.main }}>{T('بيانات التحويل البنكي', 'Bank transfer details')}</div>
                    {bank.bankName && <div className="flex justify-between gap-2"><span className="text-black">{T('البنك', 'Bank')}</span><b>{bank.bankName}</b></div>}
                    {bank.bankAccountName && <div className="flex justify-between gap-2"><span className="text-black">{T('اسم الحساب', 'Account name')}</span><b>{bank.bankAccountName}</b></div>}
                    {bank.bankIban && <div className="flex justify-between gap-2"><span className="text-black">IBAN</span><b className="font-mono tracking-wide" dir="ltr">{bank.bankIban.replace(/(.{4})/g, '$1 ').trim()}</b></div>}
                    {bank.bankAccountNo && <div className="flex justify-between gap-2"><span className="text-black">{T('رقم الحساب', 'Account No.')}</span><b className="font-mono" dir="ltr">{bank.bankAccountNo}</b></div>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* التذييل: مستطيل بلون القالب يقابل الشريط العلوي (لا يظهر على ورق بتذييل جاهز) */}
          {!lh && <div className="mt-8 rounded-xl px-5 py-2.5 flex items-center justify-between gap-4 text-white" style={{ background: a4c.main, breakInside: 'avoid' }} data-dm="bar" data-testid="a4-footer">
            <div className="font-bold text-[10.5px] leading-relaxed flex-1">{settings.footer || (bi ? <>شكراً لتعاملكم معنا <span dir="ltr">· Thank you for your business</span></> : 'شكراً لتعاملكم معنا')}</div>
            {settings.footerCompanyInfo && <div className="text-[9.5px] font-bold text-left leading-relaxed opacity-95 shrink-0 max-w-[45%]">
              {settings.companyName && <div>{settings.companyName}{settings.companyNameEn?.trim() ? <span dir="ltr"> · {settings.companyNameEn.trim()}</span> : null}</div>}
              {(contactParts(settings).length > 0 || settings.address) && <div>{contactLine(settings)}{contactParts(settings).length > 0 && settings.address ? ' — ' : ''}{settings.address}{settings.shortAddress?.trim() ? <> · <bdi dir="ltr">{settings.shortAddress.trim()}</bdi></> : null}</div>}
            </div>}
          </div>}
        </div>
        {lh && <div className="print:hidden m-3 mt-0 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 font-bold text-xs" style={{ height: `${lh.bottomMm}mm` }} data-testid="lh-bottom">مكان التذييل المطبوع مسبقاً ({lh.bottomMm} مم) — لا يُطبع</div>}
      </div>
    );
  } else {
    // Printable dynamic 80mm Thermal Receipt (Xprinter / POS Windows Printers)
    // إيصال بلغتين: كل عنوان بالعربي وتحته الإنجليزي (يُختار عند الطباعة أو كإعداد افتراضي)
    const L = (ar: string, en: string) => bilingual
      ? <span className="inline-flex flex-col leading-[1.15]">{ar}<span className="text-[9.5px] font-bold tracking-tight" dir="ltr" style={{ textAlign: 'right' }}>{en}</span></span>
      : ar;
    const titleEnTh = isReturnDocument ? (noVat ? 'SALES RETURN NOTE' : 'CREDIT NOTE') : noVat ? 'SALES INVOICE' : (docTitle.includes('مبسطة') ? 'SIMPLIFIED TAX INVOICE' : 'TAX INVOICE');
    // ضريبة كل سطر في الإيصال الصغير (زر في إعدادات التطبيق) — تُخفى لغير المسجّل بالضريبة وللفواتير بلا ضريبة
    const lineTaxTh = (it: Invoice['items'][number]) => (it.tax !== undefined ? it.tax : (it.total || 0) - (it.total || 0) / legacyDiv);
    const showLineTax = !noVat && settings.receiptLineTax !== false && Math.abs(taxAmount) > 0.004;
    return (
      <div className="thermal-receipt bg-white text-black p-4 w-[290px] mx-auto border border-black font-sans text-[12.5px] font-semibold text-right shadow-md" dir="rtl">
        <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3" data-testid="receipt-header">
          {settings.logoUrl && receiptLogoMm() > 0 && (
            // صندوق بارتفاع ثابت بالملّيمتر: الشعار يتناسب داخله مهما كانت أبعاد الصورة الأصلية
            <div className="flex justify-center items-center mx-auto mb-2" style={{ height: `${receiptLogoMm()}mm`, maxWidth: '60mm' }} data-testid="receipt-logo">
              <img
                src={settings.logoUrl}
                alt={settings.companyName || 'شعار الشركة'}
                style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
                referrerPolicy="no-referrer"
                // شعار لا يُحمَّل (رابط محذوف): يختفي صندوقه بدل ترك مساحة فارغة أعلى الإيصال
                onError={(e) => { const box = e.currentTarget.parentElement; if (box) box.style.display = 'none'; }}
              />
            </div>
          )}
          {settings.companyName && <h2 className="font-black text-[18px] leading-snug" data-testid="receipt-store-name">{settings.companyName}</h2>}
          {settings.companyNameEn?.trim() && <p className="font-black text-[14px] leading-snug" dir="ltr" data-testid="receipt-name-en">{settings.companyNameEn.trim()}</p>}
          {settings.address && <p className="text-[11px] leading-snug mt-0.5">{settings.address}</p>}
          {settings.shortAddress?.trim() && <p className="text-[11px] font-bold leading-snug mt-0.5" data-testid="receipt-short-address">العنوان المختصر{bilingual ? ' Short Address' : ''}: <span className="font-mono" dir="ltr">{settings.shortAddress.trim()}</span></p>}
          {!noVat && settings.vatNumber && <p className="text-[13px] font-black mt-0.5" data-testid="receipt-vat">الرقم الضريبي{bilingual ? ' VAT No.' : ''}: <span className="font-mono font-black text-[14px]">{settings.vatNumber}</span></p>}
          {contactParts(settings, bilingual).map((c) => (
            <p key={c.label} className="text-[11px] mt-0.5" data-testid="receipt-contact">{c.label}: <span className="font-mono" dir="ltr">{c.value}</span></p>
          ))}
          <div className="mt-2"><span className="inline-block font-black border-2 border-black px-3 py-0.5 rounded text-[12px]">{docTitle}{bilingual && <span className="block text-[10px] tracking-wide" dir="ltr" data-testid="receipt-title-en">{titleEnTh}</span>}</span></div>
          {(invoice.orderNumber || invoice.orderType) && (
            <div className="mt-2 flex items-center justify-center gap-3" data-testid="receipt-order">
              {invoice.orderNumber ? <div><div className="text-[11px] font-bold">{L('رقم الطلب', 'Order No.')}</div><div className="text-3xl font-black leading-none">{invoice.orderNumber}</div></div> : null}
              {invoice.orderType && <div className="border-2 border-black rounded-full px-3 py-0.5 text-sm font-black">{({ dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل' } as Record<string, string>)[invoice.orderType]}{bilingual ? ` · ${({ dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' } as Record<string, string>)[invoice.orderType]}` : ''}</div>}
            </div>
          )}
          {isCopy && <p data-testid="copy-mark" className="text-[11px] font-black mt-1">*** نسخة — معاد طباعتها ***</p>}
          {isReturnDocument && <p className="text-[12px] font-bold mt-1">عن الفاتورة رقم {invoice.originalInvoiceNumber}</p>}
        </div>

        <div className="space-y-1 mb-3 font-bold border-b border-black pb-2">
          <div className="flex justify-between"><span>{L('رقم الفاتورة:', 'Invoice No.')}</span> <span className="font-mono font-black text-[14px]" data-testid="receipt-invno">{invoiceNum}</span></div>
          <div className="flex justify-between items-baseline"><span>{L('التاريخ والوقت:', 'Date & time')}</span> <span className="font-mono font-black text-[13px]" dir="ltr" data-testid="receipt-date">{invoice.date}</span></div>
          <div className="flex justify-between"><span>{L('طريقة الدفع:', 'Payment')}</span> <span data-testid="receipt-pay">{paymentLabel(invoice)}{bilingual && trUi(paymentLabel(invoice)) !== paymentLabel(invoice) ? <span className="block text-[10px]" dir="ltr">{trUi(paymentLabel(invoice))}</span> : null}</span></div>
          {settings.receiptCashier !== false && invoice.cashierName && (
            <div className="flex justify-between" data-testid="receipt-cashier"><span>{L('الكاشير:', 'Cashier')}</span> <span>{invoice.cashierName}</span></div>
          )}
          <div className="flex justify-between"><span>{L('العميل:', 'Customer')}</span> <span>{customerLabel(invoice.customerName)}{bilingual && trUi(customerLabel(invoice.customerName)) !== customerLabel(invoice.customerName) ? <span className="block text-[10px]" dir="ltr">{trUi(customerLabel(invoice.customerName))}</span> : null}</span></div>
          {buyerLines.map((l, i) => <div key={i} className="text-[11px] text-left" dir="rtl">{l}</div>)}
          {isForeign && (
            <div className="flex justify-between text-black border-t border-dashed pt-1">
              <span>{L('العملة:', 'Currency')}</span> 
              <span className="font-mono">{activeCurrency.code} ({currSym})</span>
            </div>
          )}
        </div>

        {/* الأصناف — تصميم يناسب الورق الصغير: الاسم بسطر كامل ثم «الكمية × السعر» والمجموع
            (أعمدة السعر والكمية والمجموع كانت تنحشر في عرض 72مم) */}
        <div className="mb-3" data-testid="receipt-items">
          <div className="flex justify-between items-end border-b-2 border-black pb-1 text-[11.5px] font-black">
            <span>{bilingual ? L('الصنف (الكمية × السعر)', 'Item (Qty × Price)') : <>الصنف <span className="font-bold">(الكمية × السعر)</span></>}</span>
            <span className="inline-flex items-center gap-0.5">{L('المجموع', 'Amount')} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
          </div>
          {invoice.items.map((item, idx) => (
            <div key={idx} className="py-1.5 border-b border-dashed border-black/40">
              <div className="text-[12.5px] font-black leading-snug">{itemLabel(item, 'text-[11.5px]', bilingual)}</div>
              {item.description && <div className="text-[10.5px] font-normal">{item.description}</div>}
              {item.serial && <div className="text-[10.5px] font-normal" dir="ltr">S/N: {item.serial}</div>}
              {/* الباقة/الكومبو: مكوّناتها تحت الاسم (الكمية الإجمالية لكل مكوّن) */}
              {item.bundle?.length ? (
                <div className="text-[10.5px] font-bold leading-snug pr-1.5 border-r-2 border-black/60 mt-0.5" data-testid="receipt-bundle">
                  {item.bundle.map((b, bi) => <div key={bi}>{bundleQty(b.qty, item.qty)}× {b.name}</div>)}
                </div>
              ) : null}
              <div className="flex justify-between items-baseline text-[12px] mt-0.5 gap-1">
                <span className="font-mono" dir="ltr">{item.qty} × {convert(item.price).toFixed(2)}</span>
                {showLineTax && (
                  <span className="text-[10.5px] font-bold whitespace-nowrap" data-testid="receipt-line-tax">
                    {bilingual ? 'VAT' : 'ضريبة'} <span className="font-mono">{convert(lineTaxTh(item)).toFixed(2)}</span>
                  </span>
                )}
                <span className="font-mono font-black">{convert(item.total).toFixed(2)}</span>
              </div>
              {item.lineDiscount ? <div className="text-[10.5px] font-bold">{item.promo ? `${bilingual ? 'عرض / Offer' : 'عرض'} «${item.promo}»` : bilingual ? 'خصم الصنف / Discount' : 'خصم الصنف'}: {convert(item.lineDiscount).toFixed(2)}</div> : null}
              {item.bundleSaving ? <div className="text-[10.5px] font-bold" data-testid="receipt-bundle-saving">★ وفّرت مع العرض: {convert(item.bundleSaving).toFixed(2)}</div> : null}
            </div>
          ))}
        </div>

        {hasVehicle(invoice.vehicle) && (
          <div className="border border-black p-1.5 mb-2 text-[12px] font-bold" data-testid="receipt-vehicle">
            {vehicleRows(invoice.vehicle, bilingual).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><span>{k}</span><span dir="auto">{v}</span></div>
            ))}
          </div>
        )}
        {invoice.note && (
          <div className="border border-dashed border-black p-1.5 mb-2 text-[12px] font-bold">{bilingual ? 'ملاحظة / Note' : 'ملاحظة'}: {invoice.note}</div>
        )}

        {/* Totals */}
        <div className="border-t border-black pt-2 space-y-1 font-bold mb-4">
          {invoice.discount && invoice.discount > 0 ? (
            <>
              <div className="flex justify-between">
                <span>{L('المجموع قبل الخصم:', 'Subtotal before discount')}</span> 
                <span className="font-mono inline-flex items-center gap-1">{convert(invoice.rawSubtotal || (subTotalAmount + invoice.discount)).toFixed(2)} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
              </div>
              <div className="flex justify-between text-black">
                <span>{L(`الخصم${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}:`, `Discount${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`)}</span> 
                <span className="font-mono font-black inline-flex items-center gap-1">- {convert(invoice.discount).toFixed(2)} {renderInvCurr("w-3 h-3 inline-block")}</span>
              </div>
              <div className="flex justify-between">
                <span>{L('الإجمالي الخاضع للضريبة:', 'Taxable amount')}</span> 
                <span className="font-mono inline-flex items-center gap-1">{convert(subTotalAmount).toFixed(2)} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span>{noVat ? L('المجموع:', 'Subtotal') : L('المجموع (الخاضع للضريبة):', 'Taxable amount')}</span> 
              <span className="font-mono inline-flex items-center gap-1">{convert(subTotalAmount).toFixed(2)} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
            </div>
          )}
          {!noVat && (
            <div className="flex justify-between">
              <span>{L(`الضريبة (${settings.taxRate}%):`, `VAT (${settings.taxRate}%)`)}</span> 
              <span className="font-mono inline-flex items-center gap-1">{convert(taxAmount).toFixed(2)} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
            </div>
          )}
          {phase2 && Math.abs(payRounding) >= 0.005 && (
            <div className="flex justify-between text-[12px]">
              <span>{L('تقريب:', 'Rounding')}</span>
              <span className="font-mono">{convert(payRounding).toFixed(2)}</span>
            </div>
          )}
          {/* الإجمالي الشامل: أوضح سطر في الإيصال */}
          <div className="flex justify-between items-center text-[16px] leading-tight border-t-2 border-dashed border-black pt-1.5 mt-1 font-black" data-testid="receipt-grand">
            <span>{noVat ? L('الإجمالي:', 'Total') : L('الإجمالي الشامل:', 'Total (incl. VAT)')}</span>
            <span className="font-mono inline-flex items-center gap-1">{convert(invoice.total).toFixed(2)} {renderInvCurr("w-[17px] h-[17px] inline-block")}</span>
          </div>
          {!isForeign && tafqeet(invoice.total, baseCurrencyCode) && <div className="text-[12px] font-bold text-center leading-snug" data-testid="tafqeet">{tafqeet(invoice.total, baseCurrencyCode)}
            {bilingual && amountInWordsEn(invoice.total, baseCurrencyCode) && <div className="text-[10.5px] font-bold leading-snug mt-0.5" dir="ltr" data-testid="words-en">{amountInWordsEn(invoice.total, baseCurrencyCode)}</div>}
          </div>}
          {invoice.remainingAmount !== undefined && invoice.remainingAmount > 0 && (
            <div className="border-t border-dotted border-black pt-1.5 mt-1 space-y-0.5 text-[12px]">
              <div className="flex justify-between"><span>{L('المدفوع:', 'Paid')}</span><span className="font-mono font-bold">{convert(invoice.total - invoice.remainingAmount).toFixed(2)}</span></div>
              <div className="flex justify-between font-black"><span>{L('المتبقي على العميل:', 'Balance due')}</span><span className="font-mono">{convert(invoice.remainingAmount).toFixed(2)}</span></div>
              <div className="text-center text-[10.5px] font-bold" data-testid="receipt-credit-note">* {invoice.total - invoice.remainingAmount > 0.004 ? 'دفع جزئي' : 'بيع آجل'} — العميل: {invoice.customerName} *</div>
            </div>
          )}
          {(() => { const sp = splitParts(invoice); return sp ? (
            <div className="border-t border-dotted border-black pt-1.5 mt-1 space-y-0.5 text-[12px]" data-testid="receipt-split">
              <div className="flex justify-between"><span>{L('مدفوع نقداً:', 'Paid cash')}</span><span className="font-mono font-bold">{convert(sp.cash).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>{L('مدفوع بالشبكة:', 'Paid card')}</span><span className="font-mono font-bold">{convert(sp.card).toFixed(2)}</span></div>
              {(invoice.changeAmount || 0) > 0 && (<>
                <div className="flex justify-between"><span>{L('المستلم نقداً:', 'Cash received')}</span><span className="font-mono">{convert(sp.cash + (invoice.changeAmount || 0)).toFixed(2)}</span></div>
                <div className="flex justify-between font-black"><span>{L('الباقي للعميل:', 'Change')}</span><span className="font-mono">{convert(invoice.changeAmount || 0).toFixed(2)}</span></div>
              </>)}
            </div>
          ) : null; })()}
          {invoice.paymentMethod === 'cash' && invoice.paidAmount !== undefined && !(invoice.remainingAmount && invoice.remainingAmount > 0) && (
            <div className="border-t border-dotted border-black pt-1.5 mt-1 space-y-0.5 text-[12px]">
              <div className="flex justify-between">
                <span>{L('المدفوع نقداً:', 'Cash paid')}</span>
                <span className="font-mono font-bold inline-flex items-center gap-1">{convert(invoice.paidAmount).toFixed(2)} {renderInvCurr("w-3 h-3 inline-block")}</span>
              </div>
              <div className="flex justify-between font-black">
                <span>{L('الباقي للعميل:', 'Change')}</span>
                <span className="font-mono inline-flex items-center gap-1">{convert(invoice.changeAmount || 0).toFixed(2)} {renderInvCurr("w-2.5 h-2.5 inline-block")}</span>
              </div>
              {invoice.isQuickPay && (
                <div className="text-[10.5px] text-black text-center font-bold">
                  * دفع كاش سريع (Quick Pay) *
                </div>
              )}
            </div>
          )}
          {isForeign && (
            <div className="flex justify-between text-[11px] text-black border-t border-dotted pt-1">
              <span>{L('المعادل بالريال:', 'Equivalent in SAR')}</span>
              <span className="font-mono font-bold inline-flex items-center gap-0.5">{invoice.total.toFixed(2)} <SaudiRiyalSymbol className="w-3 h-3 inline-block align-middle" /></span>
            </div>
          )}
        </div>

        {/* الشروط والأحكام + الحساب البنكي */}
        {settings.showTerms !== false && (settings.invoiceTerms || '').trim() && (
          <div className="border-t border-dashed border-black pt-1.5 mb-2 text-[10.5px] leading-snug" data-testid="receipt-terms">
            <div className="font-black text-center mb-0.5">الشروط والأحكام{bilingual ? ' / Terms' : ''}</div>
            {(settings.invoiceTerms || '').split('\n').map(t => t.trim()).filter(Boolean).map((t, i) => <div key={i}>• {t}</div>)}
          </div>
        )}
        {settings.bankOnReceipt && (settings.bankIban || settings.bankAccountNo) && (
          <div className="border border-black rounded p-1.5 mb-2 text-[10.5px] leading-snug" data-testid="receipt-bank">
            <div className="font-black text-center mb-0.5">التحويل البنكي{bilingual ? ' / Bank transfer' : ''}{settings.bankName ? ` — ${settings.bankName}` : ''}</div>
            {settings.bankAccountName && <div className="text-center">{settings.bankAccountName}</div>}
            {settings.bankIban && <div className="font-mono font-black text-center tracking-tight" dir="ltr">{settings.bankIban.replace(/(.{4})/g, '$1 ').trim()}</div>}
            {settings.bankAccountNo && <div className="font-mono text-center" dir="ltr">{settings.bankAccountNo}</div>}
          </div>
        )}
        {settings.footer && <p className="text-[12px] font-bold text-center pb-2">{settings.footer}</p>}
        {/* باركود رقم الفاتورة/المرتجع — يُمسح عند الاسترجاع أو البحث */}
        {docBarcodeOn('receipt') && <div className="flex justify-center min-w-0 overflow-hidden pt-1 pb-2" data-testid="thermal-barcode" dangerouslySetInnerHTML={{ __html: docBarcodeHtml(invoiceNum, { heightMm: 8, moduleMm: 0.4, maxWidthMm: 64, text: false }) }} />}
        <div className="flex justify-center pt-2 pb-8 border-t border-dashed border-black" data-testid="thermal-qr">
          {!noVat && <PrintableZatcaQr payload={zatcaQrPayload} size={phase2 ? 165 : 120} framed={false} />}
        </div>
      </div>
    );
  }
}

// ==========================================
// REAL WINDOWS PRINTABLE Z-REPORT TEMPLATE
// ==========================================
function PrintableZReport({ 
  record, 
  settings, 
  onClose 
}: { 
  record: any; 
  settings: CompanySettings; 
  onClose: () => void; 
}) {
  // بلغتين (زر «ترجمة»): العنوان بالعربي وتحته الإنجليزي — مثل الإيصال
  const bi = printBilingual();
  const L = (ar: string, en: string) => bi
    ? <span className="inline-flex flex-col leading-tight">{ar}<span className="text-[9px] font-bold" dir="ltr" style={{ textAlign: 'right' }}>{en}</span></span>
    : ar;
  const cur = <SaudiRiyalSymbol className="w-3 h-3 inline-block align-middle" />;
  return (
    <div className="bg-white text-black p-4 w-[300px] mx-auto border border-gray-300 font-sans text-xs text-right shadow-2xl relative" dir="rtl">
      <div className="text-center space-y-1 border-b-2 border-dashed border-gray-400 pb-3 mb-3">
        {/* الشعار بحجمه الفعلي (بلا مربع ثابت الارتفاع يترك فراغاً فوقه وتحته) */}
        {settings.logoUrl && receiptLogoMm() > 0 && (
          <div className="flex justify-center mx-auto mb-1.5">
            <img src={settings.logoUrl} alt={settings.companyName || 'شعار الشركة'} style={{ maxHeight: `${receiptLogoMm()}mm`, maxWidth: '60mm', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} referrerPolicy="no-referrer" />
          </div>
        )}
        <h2 className="font-black text-[15px] leading-snug">{settings.companyName}</h2>
        {settings.companyNameEn?.trim() && <p className="font-black text-[12px]" dir="ltr">{settings.companyNameEn.trim()}</p>}
        {settings.address && <p className="text-[11px] font-bold">{settings.address}</p>}
        {settings.shortAddress?.trim() && <p className="text-[11px] font-bold">العنوان المختصر{bi ? <> <bdi dir="ltr">Short Address</bdi></> : null}: <span className="font-mono" dir="ltr">{settings.shortAddress.trim()}</span></p>}
        {!settings.vatUnregistered && !!settings.vatNumber?.trim() && <p className="text-[11px] font-bold" data-testid="z-print-vat">الرقم الضريبي{bi ? <> <bdi dir="ltr">VAT No.</bdi></> : null}: <span className="font-mono">{settings.vatNumber.trim()}</span></p>}
        {/* العنوان: أسود واضح بلا خلفية رمادية (تظهر منقطة باهتة على الحرارية) */}
        <div className="pt-1.5"><span className="inline-block font-black border-2 border-black px-3 py-0.5 rounded text-[13px] text-black bg-white" data-testid="z-print-title">
          {record.kind === 'shift' ? 'تقرير إقفال وردية الكاشير' : (settings.vatUnregistered ? 'تقرير الإقفال اليومي' : 'تقرير الإقفال اليومي (Z-REPORT)')}
          {bi && <span className="block text-[10.5px] font-black" dir="ltr">{record.kind === 'shift' ? 'CASHIER SHIFT CLOSING REPORT' : 'DAILY CLOSING REPORT'}</span>}
        </span></div>
      </div>

      <div className="space-y-1 mb-3 font-bold border-b border-gray-200 pb-2 text-[11px]">
        <div className="flex justify-between items-baseline"><span>{L('رقم التقرير:', 'Report No.')}</span> <span className="font-mono">{record.reportNumber}</span></div>
        <div className="flex justify-between items-baseline"><span>{L('نقطة البيع:', 'POS terminal')}</span> <span className="font-mono">{record.posTerminalId}</span></div>
        <div className="flex justify-between items-baseline"><span>{record.kind === 'shift' ? L('صاحب الوردية:', 'Shift cashier') : L('الكاشير المسؤول:', 'Cashier in charge')}</span> <span>{record.cashierName}</span></div>
        {record.kind !== 'shift' && record.closedBy && record.closedBy !== record.cashierName && <div className="flex justify-between items-baseline"><span>{L('أقفل بواسطة:', 'Closed by')}</span> <span>{record.closedBy}</span></div>}
        <div className="flex justify-between items-baseline"><span>{L('بداية الوردية:', 'Shift start')}</span> <span className="font-mono text-[11px]" dir="ltr" data-testid="z-print-start">{displayTs(record.shiftStart)}</span></div>
        <div className="flex justify-between items-baseline"><span>{L('تاريخ الإقفال:', 'Closed at')}</span> <span className="font-mono text-[11px]" dir="ltr" data-testid="z-print-end">{displayTs(record.closedAt || record.shiftEnd)}</span></div>
        <div className="flex justify-between items-baseline"><span>{L('عدد الفواتير:', 'Invoices')}</span> <span><span className="font-mono">{record.invoicesCount}</span> فاتورة{record.returnsCount ? <> · <span className="font-mono">{record.returnsCount}</span> مرتجع</> : null}</span></div>
      </div>

      <div className="space-y-1.5 font-bold mb-3 border-b border-gray-200 pb-2 text-[11px]">
        <div className="flex justify-between items-baseline"><span>{bi ? L('مبيعات نقدي:', 'Cash sales') : 'مبيعات نقدي (CASH):'}</span> <span className="font-mono">{record.totalCash.toFixed(2)} {cur}</span></div>
        <div className="flex justify-between items-baseline"><span>{bi ? L('مبيعات شبكة:', 'Card sales') : 'مبيعات شبكة (CARD):'}</span> <span className="font-mono">{record.totalCard.toFixed(2)} {cur}</span></div>
        {record.totalBank > 0 && <div className="flex justify-between items-baseline"><span>{L('تحويلات بنكية:', 'Bank transfers')}</span> <span className="font-mono">{record.totalBank.toFixed(2)} {cur}</span></div>}
        {!!record.totalOther && <div className="flex justify-between items-baseline"><span>{L('دفع مختلط / أخرى:', 'Mixed / other')}</span> <span className="font-mono">{record.totalOther.toFixed(2)} {cur}</span></div>}
        <div className="flex justify-between items-baseline border-t border-gray-300 pt-1"><span>{L('إجمالي المبيعات المحصّلة:', 'Total collected')}</span> <span className="font-mono font-black">{(record.totalCash + record.totalCard + (record.totalBank || 0) + (record.totalOther || 0)).toFixed(2)} {cur}</span></div>
        {!!record.openingFloat && <div className="flex justify-between items-baseline"><span>{L('العهدة (بداية الوردية):', 'Opening float')}</span> <span className="font-mono">{record.openingFloat.toFixed(2)} {cur}</span></div>}
        {!!record.cashIn && <div className="flex justify-between items-baseline"><span>{L('إدخالات الصندوق:', 'Cash in')}</span> <span className="font-mono">{record.cashIn.toFixed(2)} {cur}</span></div>}
        {!!record.cashOut && <div className="flex justify-between items-baseline"><span>{L('مصروفات من الصندوق:', 'Cash out')}</span> <span className="font-mono" dir="ltr">-{record.cashOut.toFixed(2)} {cur}</span></div>}
        {(!!record.openingFloat || !!record.cashIn || !!record.cashOut) && record.expectedCash !== undefined && (<>
          <div className="flex justify-between items-baseline border-t border-gray-300 pt-1 font-black" data-testid="z-print-expected"><span>{L('النقد المتوقع في الدرج:', 'Expected cash in drawer')}</span> <span className="font-mono">{record.expectedCash.toFixed(2)} {cur}</span></div>
          <p className="text-[9px] font-bold leading-snug">نقدي {record.totalCash.toFixed(2)}{record.openingFloat ? ` + عهدة ${record.openingFloat.toFixed(2)}` : ''}{record.cashIn ? ` + إدخالات ${record.cashIn.toFixed(2)}` : ''}{record.cashOut ? ` − مصروفات ${record.cashOut.toFixed(2)}` : ''} = {record.expectedCash.toFixed(2)} — الشبكة لا تدخل في نقد الدرج</p>
          {typeof record.countedCash === 'number' && (<>
            <div className="flex justify-between items-baseline" data-testid="z-print-counted"><span>{L('النقد المعدود:', 'Counted cash')}</span> <span className="font-mono">{record.countedCash.toFixed(2)} {cur}</span></div>
            <div className="flex justify-between items-baseline font-black" data-testid="z-print-diff">
              <span>{Math.abs(record.cashDiff || 0) < 0.01 ? L('الفرق: مطابق', 'Difference: none') : (record.cashDiff || 0) < 0 ? L('عجز:', 'Shortage') : L('زيادة:', 'Overage')}</span>
              {Math.abs(record.cashDiff || 0) >= 0.01 && <span className="font-mono">{Math.abs(record.cashDiff || 0).toFixed(2)} {cur}</span>}
            </div>
          </>)}
          {!!record.handover && (<>
            <div className="border-t border-dashed border-black my-1" />
            <p className="text-[10px] font-black text-center">{L('تسليم نقدية', 'CASH HANDOVER')}</p>
            <div className="flex justify-between items-baseline font-black" data-testid="z-print-handover"><span>{L('المبلغ المسلَّم:', 'Handed over')}</span> <span className="font-mono">{record.handover.toFixed(2)} {cur}</span></div>
            <div className="flex justify-between items-baseline"><span>{L('المستلم:', 'Received by')}</span> <span>{record.handoverTo || '—'}</span></div>
            {typeof record.keptInDrawer === 'number' && <div className="flex justify-between items-baseline"><span>{L('بقي في الدرج (عهدة):', 'Kept in drawer (float)')}</span> <span className="font-mono">{record.keptInDrawer.toFixed(2)} {cur}</span></div>}
          </>)}
          {(typeof record.countedCash === 'number' || !!record.handover) && (
            <div className="mt-2 flex justify-between text-[9px] font-bold"><span>{L('توقيع المسلِّم:', 'Handed by')} ____________</span><span>{L('توقيع المستلم:', 'Received by')} ____________</span></div>
          )}
        </>)}
        {record.debtCollections > 0 && <div className="flex justify-between items-baseline text-[10px]"><span>{L('منها سداد آجل سابق:', 'Incl. earlier credit payments')}</span> <span className="font-mono">{record.debtCollections.toFixed(2)}</span></div>}
        {record.creditOutstanding > 0 && <div className="flex justify-between items-baseline"><span>{L('مبيعات آجلة (غير محصّلة):', 'Credit sales (uncollected)')}</span> <span className="font-mono">{record.creditOutstanding.toFixed(2)} {cur}</span></div>}
        {record.returnsCount > 0 && <div className="flex justify-between items-baseline"><span>{L(`المرتجعات (${record.returnsCount}):`, `Returns (${record.returnsCount})`)}</span> <span className="font-mono" dir="ltr">-{Number(record.returnsTotal || 0).toFixed(2)} {cur}</span></div>}
        {!settings.vatUnregistered && <>
          <div className="flex justify-between items-baseline border-t border-gray-300 pt-1"><span>{L('المجموع غير شامل:', 'Total excl. VAT')}</span> <span className="font-mono">{record.subtotal.toFixed(2)} {cur}</span></div>
          <div className="flex justify-between items-baseline"><span>{L(`الضريبة (${record.taxRate ?? settings.taxRate ?? 15}%):`, `VAT (${record.taxRate ?? settings.taxRate ?? 15}%)`)}</span> <span className="font-mono">{record.totalVat.toFixed(2)} {cur}</span></div>
        </>}
        <div className="flex justify-between items-baseline text-xs border-t-2 border-black pt-1.5 font-black">
          <span>{settings.vatUnregistered ? L('صافي المبيعات:', 'Net sales') : L('صافي المبيعات الشامل:', 'Net sales (incl. VAT)')}</span>
          <span className="font-mono">{record.grandTotal.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 inline-block align-middle" /></span>
        </div>
      </div>

      {/* الإقفال اليومي: ملخص كل كاشير */}
      {record.kind !== 'shift' && Array.isArray(record.cashiers) && record.cashiers.length > 0 && (
        <div className="mb-3 border-b border-gray-200 pb-2 text-[10.5px]" data-testid="z-print-cashiers">
          <div className="font-black mb-1">{L('حسب الكاشير:', 'By cashier')}</div>
          {record.cashiers.map((c: { name: string; count: number; cash: number; card: number; net: number; open: boolean }) => (
            <div key={c.name} className="py-0.5 border-b border-dotted border-gray-300 last:border-0">
              <div className="flex justify-between font-bold"><span>{c.name}{c.open ? ' (وردية مفتوحة)' : ''}</span><span className="font-mono">{c.net.toFixed(2)}</span></div>
              <div className="flex justify-between text-[9.5px]"><span>{c.count} فاتورة{bi ? ' · invoices' : ''}</span><span className="font-mono">{bi ? 'نقدي/Cash' : 'نقدي'} {c.cash.toFixed(2)} · {bi ? 'شبكة/Card' : 'شبكة'} {c.card.toFixed(2)}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* ZATCA Audit QR Code */}
      {!settings.vatUnregistered && (
        <div className="flex flex-col items-center justify-center space-y-1.5 pt-2 border-t border-dashed border-gray-400">
          <p className="text-[9px] font-bold text-center">رمز التدقيق المالي والإقفال المعتمد{bi ? <span className="block" dir="ltr">Closing audit code</span> : null}</p>
          <PrintableZatcaQr payload={record.base64Payload} size={115} />
          <p className="text-[8px] text-gray-500 text-center font-mono">ZATCA AUDIT SIGNATURE VERIFIED</p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-300 grid grid-cols-2 gap-2 text-[9px] text-center">
        <div>
          <p className="font-bold">توقيع الكاشير{bi ? <span className="block" dir="ltr">Cashier signature</span> : null}</p>
          <div className="border-b border-gray-400 mt-4"></div>
        </div>
        <div>
          <p className="font-bold">اعتماد المشرف{bi ? <span className="block" dir="ltr">Supervisor approval</span> : null}</p>
          <div className="border-b border-gray-400 mt-4"></div>
        </div>
      </div>
    </div>
  );
}