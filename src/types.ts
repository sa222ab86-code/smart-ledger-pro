export interface Variant {
  id: string;
  name: string;
  price: number;
}

export interface ProductUnit {
  id: string;
  name: string;
  factor: number;
  price: number;
  barcode: string;
  unitType?: 'size' | 'volume' | 'pack' | 'weight' | 'unit' | 'flavor';
  cost?: number;
}

export interface BundleItem {
  productId: string;
  productName: string;
  qty: number;
}

export interface ProductGroup {
  id: string;
  nameAr: string;
  nameEn?: string;
  color?: string; // Hex color (e.g. #06b6d4, #f59e0b, #ef4444, #10b981, #8b5cf6, #ec4899)
  icon?: string;  // Icon name (e.g. 'Coffee', 'Utensils', 'Sandwich', 'Flame', 'Boxes', 'Package', 'Sparkles', 'Tag')
  description?: string;
  printerId?: string; // Linked printer for kitchen/station routing
  displayOrder?: number;
  isActive?: boolean;
}

export interface Product {
  id: string;
  nameAr: string;
  nameEn: string;
  price: number;
  cost: number;
  categoryAr: string;
  categoryEn: string;
  groupId?: string; // Reference to ProductGroup.id
  subCategoryAr?: string;
  stock: number;
  minStock?: number; // Minimum stock threshold for alert
  barcode: string;
  /** باركودات إضافية لنفس الصنف */
  barcodes?: string[];
  image?: string; // Product photo URL or data URL
  description?: string; // وصف الصنف (يظهر في الفاتورة تحت الاسم)
  variants?: Variant[];
  units?: ProductUnit[];
  /** صنف موقوف: لا يظهر في شاشة البيع ولا يُباع بالباركود (يبقى في السجلات والتقارير) */
  disabled?: boolean;
  /** صنف خدمي (تركيب، توصيل، صيانة...): لا مخزون ولا جرد ولا تنبيهات نفاد */
  isService?: boolean;
  /** يباع بالوزن: السعر للكيلو والكمية من الميزان */
  soldByWeight?: boolean;
  /** كود الصنف في الميزان الإلكتروني (PLU) داخل باركود الميزان */
  scaleCode?: string;
  /** تاريخ انتهاء الصلاحية (YYYY-MM-DD) — أقرب دفعة في المخزون */
  expiryDate?: string;
  /** عند وجود عبوات/مقاسات: false = اسم الصنف عنوان فقط ويُباع بالخيارات، true = يُباع الأساسي (حبة) أيضاً */
  sellBaseUnit?: boolean;
  /** منتج تبغ (معسّل، سجائر...): تُضاف عليه رسوم تقديم منتجات التبغ عند تفعيلها — نسخة Pro */
  isTobacco?: boolean;
  /** التالف: إجمالي الكمية المشطوبة كتالف (تُخصم من المخزون عند التسجيل) وسجلها */
  damaged?: number;
  damageLog?: { date: string; qty: number; note?: string; cost?: number }[];
  isBundle?: boolean; // True if this item is a combo bundle of multiple items
  bundleItems?: BundleItem[]; // Sub-items included in this bundle
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  balance: number;
  vatNumber?: string;
  /** العنوان الوطني — مطلوب لإصدار فاتورة ضريبية (B2B) عبر منصة فاتورة */
  buildingNumber?: string;
  street?: string;
  district?: string;
  city?: string;
  postalCode?: string;
}

/** بيانات الربط مع منصة فاتورة (المرحلة الثانية) المحفوظة مع الفاتورة */
export interface InvoiceZatca {
  uuid: string;
  icv: number;
  hash: string;
  qr: string;
  kind: 'simplified' | 'standard';
  status: 'pending' | 'reported' | 'cleared' | 'warning' | 'rejected' | 'error';
  message?: string | null;
}

export interface CurrencyConfig {
  code: string;         // e.g. 'SAR', 'USD', 'EUR', 'AED', 'KWD', 'EGP', 'GBP'
  nameAr: string;       // e.g. 'ريال سعودي', 'دولار أمريكي', 'يورو'
  nameEn?: string;      // e.g. 'Saudi Riyal', 'US Dollar'
  symbol: string;       // e.g. '﷼', '$', '€', 'د.إ'
  exchangeRate: number; // 1 Unit of this currency = exchangeRate SAR (base currency). For SAR: 1.0. For USD: 3.75.
  isBase?: boolean;
  isEnabled: boolean;
  lastUpdated?: string;
}

export interface MultiCurrencySettings {
  enabled: boolean;
  baseCurrency: string; // Default 'SAR'
  /** فعّله/أوقفه المستخدم بنفسه (التفعيل الافتراضي القديم لا يُحتسب) */
  configured?: boolean;
  currencies: CurrencyConfig[];
}

export interface InvoiceItem {
  productId?: string; // الصنف المباع (للفواتير الجديدة — يُستخدم لمنع حذف صنف عليه حركة)
  factor?: number;    // عدد الحبات في التعبئة المباعة (كرتون = 12 مثلاً) — لحساب الخصم من المخزون
  sourceLine?: number; // في المرتجع: رقم السطر في الفاتورة الأصلية
  name: string;
  /** الاسم الإنجليزي وقت البيع (لطباعة الاسمين في الفاتورة) */
  nameEn?: string;
  description?: string;
  /** الرقم التسلسلي (S/N) للقطعة المباعة */
  serial?: string;
  /** اسم العرض المطبَّق (العروض والتخفيضات) — مقداره في lineDiscount */
  promo?: string;
  /** تكلفة الوحدة المباعة وقت البيع (قبل الضريبة) — لتقرير الأرباح */
  cost?: number;
  /** خصم الصنف (إجمالي السطر بنفس طريقة عرض الأسعار) — للطباعة فقط؛ السعر مخصوم مسبقاً */
  lineDiscount?: number;
  /** باقة/كومبو: مكوّناتها وقت البيع (الكمية لكل باقة واحدة) — تُطبع تحت اسم الباقة */
  bundle?: { name: string; qty: number }[];
  /** توفير العرض على السطر (مجموع أسعار المكوّنات منفردة − سعر الباقة) × الكمية — للعرض فقط */
  bundleSaving?: number;
  qty: number;
  price: number; // Pre-tax price
  tax: number;   // Tax amount for this item
  total: number; // Total inclusive of tax
  /** سطر رسوم تقديم منتجات التبغ (نسخة Pro) */
  isTobaccoFee?: boolean;
  isDeliveryFee?: boolean; // سطر رسوم التوصيل
}

export interface Invoice {
  id: string;
  /** نوع المستند: بيع (الافتراضي) أو مرتجع مبيعات — المرتجع قيمه سالبة فيُطرح تلقائياً من الإجماليات */
  docType?: 'sale' | 'return';
  originalInvoiceId?: string;     // المرتجع: الفاتورة الأصلية
  /** ربط الأجهزة: رمز واسم الجهاز الذي أصدر المستند */
  deviceTag?: string;
  deviceName?: string;
  originalInvoiceNumber?: string;
  /** المرتجع: الجزء الذي خُصم من مديونية العميل على الفاتورة الأصلية بدل ردّه نقداً */
  debtOffset?: number;
  restocked?: boolean;            // المرتجع: هل أُعيدت الكميات للمخزون
  zatca?: InvoiceZatca;           // المرحلة الثانية: الختم والإبلاغ
  number: string;
  invoiceNumber: string; // Keep both number and invoiceNumber to support all components
  date: string;
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  rawSubtotal?: number;       // Pre-discount subtotal
  tax: number;
  total: number;
  discount?: number;          // Discount amount in base currency
  discountType?: 'fixed' | 'percent'; // Type of discount
  discountValue?: number;     // Original discount value entered (e.g., 10 for 10% or 10 SAR)
  discountScope?: 'total' | 'subtotal'; // Applied on final total (inclusive of VAT) or pre-tax subtotal
  paymentMethod: 'cash' | 'card' | 'split' | 'bank';
  paidAmount?: number;        // Cash tendered (e.g. 50, 100, 200 SAR or exact)
  changeAmount?: number;      // Change returned to customer (paidAmount - total)
  isQuickPay?: boolean;       // Completed via Quick Pay
  orderType?: 'dine_in' | 'takeaway' | 'delivery';
  orderNumber?: number;
  currency?: string;          // Currency code when created or viewed (e.g. 'SAR', 'USD')
  exchangeRate?: number;      // Exchange rate applied
  convertedTotal?: number;    // Converted total if not in base currency
  // --- الدفع الجزئي / الآجل ---
  customerId?: string;                      // العميل المسجَّل (مطلوب عند الدفع الجزئي)
  cashierName?: string;                     // من أصدر الفاتورة (لتقرير أداء المستخدمين)
  remainingAmount?: number;                 // المتبقي على العميل (0 أو غير موجود = مسدّدة بالكامل)
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  note?: string;                            // ملاحظة على الفاتورة
  /** نشاط البنشر/الزيوت: بيانات المركبة */
  vehicle?: VehicleInfo;
  payments?: InvoicePayment[];              // سجل الدفعات (الأولى عند البيع + السدادات اللاحقة)
}

/** حركة صندوق يدوية: إدخال مبلغ للصندوق أو صرف منه */
export interface CashMovement {
  id: string;
  date: string;
  /** in = إدخال مبلغ، out = صرف مبلغ */
  type: 'in' | 'out';
  amount: number;
  /** سبب الحركة (رأس مال، صرف مشتريات، سلفة...) */
  reason: string;
  /** float = نقدية بداية الوردية (تُعرض كعهدة لا كإدخال)، diff = فرق جرد الإقفال */
  kind?: 'float' | 'diff' | 'handover';
  /** تعديل لاحق: من عدّلها ومتى والمبلغ قبل التعديل (لا تُمحى الحركة الأصلية) */
  editedBy?: string;
  editedAt?: string;
  origAmount?: number;
  note?: string;
  /** من سجّل الحركة */
  by?: string;
}

export interface VehicleInfo {
  plate?: string;     // رقم اللوحة
  model?: string;     // نوع/موديل السيارة
  km?: number;        // قراءة العداد
  nextKm?: number;    // تغيير الزيت القادم (كم)
  nextDate?: string;  // موعد الصيانة القادم
}

/** طرق استلام الدفعة: نقدي / شبكة / تحويل بنكي */
export type PayMethod = 'cash' | 'card' | 'bank';

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  method: PayMethod;
  note?: string;
  /** من استلم الدفعة (لإقفال وردية كل كاشير) — القديمة بلا قيمة تُنسب لكاشير الفاتورة */
  by?: string;
}

export interface CartItem {
  id: string;
  cartItemId: string;
  name: string;
  image?: string;
  unitName?: string;
  unitType?: string;
  factor?: number;
  price: number;
  qty: number;
  tax: number;
  total: number;
  description?: string; // وصف الصنف
  serial?: string; // الرقم التسلسلي (S/N)
  /** السعر الصافي قبل خصم الصنف (لإلغاء الخصم وعرضه) */
  originalPrice?: number;
  isBundle?: boolean;
  bundleDescription?: string;
  bundleItems?: BundleItem[];
  /** سطر رسوم تقديم التبغ (يُحسب تلقائياً، لا يُعدَّل يدوياً) */
  isTobaccoFee?: boolean;
  isDeliveryFee?: boolean; // سطر رسوم التوصيل
  /** العروض والتخفيضات: العرض المطبَّق تلقائياً وسعر الحبة قبله */
  promoId?: string;
  promoName?: string;
  promoBase?: number;
  /** السعر عُدِّل يدوياً (تعديل سعر / خصم صنف) — لا تُطبَّق العروض على السطر */
  manualPrice?: boolean;
}

export interface ParkedOrder {
  id: string;
  orderNumber: number;
  label: string; // e.g. "طلب معلق #1" or "طاولة 3"
  customerName?: string;
  customerId?: string; // العميل المسجَّل المختار وقت التعليق
  items: CartItem[];
  discountType: 'fixed' | 'percent';
  discountValue: number;
  discountScope?: 'total' | 'subtotal';
  rawSubtotal: number;
  discountAmount: number;
  discountedSubtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  note?: string;
  vehicle?: VehicleInfo;
  dueTime?: string; // Expected delivery / pickup / customer return time (e.g. "14:30" or "12:15 م")
  dueDate?: string; // Expected due date if specified
}

export interface AppPrinter {
  id: string;
  name: string;
  ip?: string;
  osPrinterName?: string;
  type: 'cashier' | 'kitchen' | 'section';
  template?: 'thermal80' | 'A4' | 'kitchenTicket';
  status: 'online' | 'offline';
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  vatNumber?: string;
}

export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  /** qty/price بوحدة الشراء؛ factor = عدد الحبات في الوحدة (كرتون = 12) — الفواتير القديمة بلا factor = حبة */
  items: { productId: string; productName: string; qty: number; price: number; total: number; unitName?: string; factor?: number; pieceCost?: number; expiryDate?: string }[];
  /** الإجمالي شامل الضريبة (الفواتير القديمة: مجموع الأسطر بلا بيانات ضريبة) */
  total: number;
  /** رقم فاتورة المورد */
  supplierInvoiceNo?: string;
  /** المبلغ قبل الضريبة وضريبة المدخلات — غير موجودة في الفواتير القديمة */
  subtotal?: number;
  vat?: number;
  vatRate?: number;
  /** أسعار الأسطر مُدخلة شاملة الضريبة */
  pricesInclusive?: boolean;
  /** خصم على الفاتورة (قبل الضريبة، بنفس أساس أسعار الأسطر): المبلغ المخصوم + طريقته — يوزَّع على تكلفة الأصناف */
  discount?: number;
  discountType?: 'amount' | 'percent';
  discountValue?: number;
}

/** مرتجع مشتريات: إرجاع أصناف للمورد (يُخصم من المخزون) */
export interface PurchaseReturn {
  id: string;
  /** رقم المستند PR-00001 */
  number: string;
  date: string;
  supplierId: string;
  supplierName: string;
  /** فاتورة الشراء الأصلية (اختياري) */
  purchaseId?: string;
  supplierInvoiceNo?: string;
  items: { productId: string; productName: string; qty: number; price: number; total: number; unitName?: string; factor?: number }[];
  subtotal: number;
  vat: number;
  vatRate?: number;
  total: number;
  pricesInclusive?: boolean;
  reason?: string;
  createdBy?: string;
}

export interface AppUser {
  id: string;
  username: string;
  /** مدير = كل الصلاحيات، مشرف/كاشير = صلاحيات جاهزة، مخصص = permissions */
  role: 'admin' | 'supervisor' | 'cashier' | 'custom';
  status: 'active' | 'suspended';
  fullName: string;
  /** للدور المخصص فقط */
  permissions?: string[];
  /** بصمة كلمة المرور (SHA-256 مكرر مع ملح) — لا تُحفظ كلمة المرور نفسها */
  passwordHash?: string;
  passwordSalt?: string;
  lastLoginAt?: string;
}

export interface CompanySettings {
  companyName: string;
  /** اسم المنشأة بالإنجليزي (اختياري) — يُطبع تحت الاسم العربي */
  companyNameEn?: string;
  /** أسماء الأصناف في الفواتير المطبوعة: عربي (الافتراضي) / إنجليزي / الاثنان */
  invoiceItemNames?: 'ar' | 'en' | 'both';
  address: string;
  /** العنوان المختصر (العنوان الوطني المختصر، مثل RRRD2929) — اختياري، يُطبع تحت العنوان */
  shortAddress?: string;
  phone: string;
  /** إظهار اسم المنشأة وهاتفها وعنوانها في تذييل فاتورة A4 (مغلق افتراضياً) */
  footerCompanyInfo?: boolean;
  /** الحساب البنكي للتحويل (يظهر في الفاتورة) */
  bankName?: string;
  bankAccountName?: string;
  bankIban?: string;
  bankAccountNo?: string;
  /** أماكن ظهور الحساب البنكي */
  bankOnA4?: boolean;
  bankOnReceipt?: boolean;
  /** الشروط والأحكام (منفصلة عن رسالة التذييل) وإظهارها في الفاتورة */
  invoiceTerms?: string;
  showTerms?: boolean;
  mobile?: string;
  /** البريد الإلكتروني للمنشأة (يظهر في الفاتورة) */
  email?: string;
  vatNumber: string;
  grNumber?: string;
  moNumber?: string;
  footer?: string;
  taxRate: number; // tax rate percentage, e.g. 15
  /** المنشأة غير مسجّلة في ضريبة القيمة المضافة: «فاتورة مبيعات» بلا ضريبة ولا رقم ضريبي ولا QR ولا ربط بالهيئة */
  vatUnregistered?: boolean;
  /** هل أسعار البيع المُدخلة للأصناف شاملة الضريبة؟ (افتراضياً: لا — تُضاف الضريبة فوق السعر) */
  pricesIncludeTax?: boolean;
  activityType: 'restaurant' | 'retail' | 'grocery' | 'auto' | 'furniture' | 'electrical' | 'perfumes' | 'pharmacy' | 'metals' | 'other';
  logoUrl?: string; // Company logo image URL or base64 data URI
  printerSettings: {
    cashierPrinter?: string;
    kitchenPrinter?: string;
    sectionPrinters?: { section: string; printerName: string }[];
  };
  multiCurrency?: MultiCurrencySettings;
  /** رسوم تقديم منتجات التبغ (نسخة Pro) */
  tobaccoFee?: { enabled: boolean; ratePercent: number; minPerUnit: number };
  /** نشاط البنشر/الزيوت: المسافة الافتراضية لتغيير الزيت القادم (كم) */
  oilChangeKm?: number;
  /** اسم الكاشير في الإيصال الحراري (الافتراضي: يظهر) */
  receiptCashier?: boolean;
  /** إظهار مبلغ الضريبة بجانب كل صنف في إيصال 80مم (افتراضياً نعم) */
  receiptLineTax?: boolean;
}


// ================= عروض الأسعار =================
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'invoiced';

export interface QuotationItem {
  id: string;            // معرّف السطر
  productId?: string;    // الصنف إن اختير من القائمة (البند الحر بدون معرّف)
  name: string;
  qty: number;
  price: number;         // سعر الوحدة قبل الضريبة
  /** المقاس/العبوة المختارة من الصنف (كبير، كرتون...) — factor = عدد الحبات للخصم من المخزون */
  unitId?: string;
  unitName?: string;
  factor?: number;
}

export interface Quotation {
  id: string;
  number: string;                 // QT-0001
  date: string;                   // تاريخ الإصدار YYYY-MM-DD HH:mm:ss
  validUntil: string;             // صالح حتى YYYY-MM-DD
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: QuotationItem[];
  discountType: 'fixed' | 'percent';
  discountValue: number;
  taxRate: number;                // نسبة الضريبة وقت الإصدار (مثلاً 15)
  pricesIncludeTax?: boolean;     // الأسعار تُعرض وتُدخل شاملة الضريبة (البنود تُخزَّن صافية دائماً)
  rawSubtotal: number;            // قبل الخصم
  discount: number;               // قيمة الخصم الفعلية
  subtotal: number;               // بعد الخصم وقبل الضريبة
  tax: number;
  total: number;
  notes?: string;
  terms?: string;
  status: QuotationStatus;
  invoiceId?: string;             // بعد التحويل لفاتورة
  invoiceNumber?: string;
}
