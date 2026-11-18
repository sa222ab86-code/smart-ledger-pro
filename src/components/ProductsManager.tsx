import React, { useState, useMemo, useDeferredValue, useRef } from 'react';
import { undoubleScan } from '../utils/beep';
import DateField from './DateField';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { generateInternalEan13, barcodeIssue } from '../utils/barcode';
import { usePagedList, Pagination } from '../utils/usePagedList';
import { useFitHeight } from '../utils/useFitHeight';
import { 
  Package, Plus, Search, Tag, DollarSign, Barcode, Trash2, Edit, X, 
  AlertTriangle, AlertCircle, Layers, Boxes, Sparkles, FolderTree, ArrowRight, FileDown, Power, Split
} from 'lucide-react';
import { Product, ProductGroup, AppPrinter, ProductUnit } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import ProductGroupsManager, { GROUP_COLOR_OPTIONS } from './ProductGroupsManager';
import ProductBundlesManager from './ProductBundlesManager';
import PackagingEditor, { PACKAGING_PRESETS } from './PackagingEditor';
import ProductImagePicker from './ProductImagePicker';
import ProductsImportExport, { type ProductsImportResult } from './ProductsImportExport';
import BarcodeLabelsDialog from './BarcodeLabelsDialog';
import { exportHtmlAsPdf, type PrintSettings } from '../utils/printing';
import { productsSheetHtml } from '../utils/productsSheet';
import { expiryState, expiryLabel } from '../utils/expiry';
import ExtraBarcodes from './ExtraBarcodes';
import ProfitHint from './ProfitHint';
import { belowCostProducts } from '../utils/belowCost';

interface ProductsManagerProps {
  /** أيام التنبيه قبل انتهاء الصلاحية */
  expiryWarnDays?: number;
  products: Product[];
  groups?: ProductGroup[];
  printers?: AppPrinter[];
  initialTab?: 'products' | 'groups' | 'bundles';
  /** فتح الشاشة على فلتر معيّن (مثل «تحت التكلفة» من الإعدادات) */
  initialCodeFilter?: 'belowcost';
  /** رسوم التبغ مفعّلة: يظهر خيار «منتج تبغ» في بطاقة الصنف */
  tobaccoEnabled?: boolean;
  /** فتح شاشة طباعة الباركود مباشرة (تبويب «طباعة الباركود» في القائمة) وعند إغلاقها يُستدعى onBarcodeClose */
  openBarcode?: boolean;
  onBarcodeClose?: () => void;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (id: string, updated: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  /** حذف عدة أصناف دفعة واحدة (التحديد) */
  onDeleteProducts?: (ids: string[]) => void;
  /** سبب منع الحذف (صنف عليه حركة) أو null */
  getDeleteBlockReason?: (id: string) => string | null;
  /** أسعار البيع شاملة الضريبة؟ (لعنوان حقل السعر فقط) */
  pricesIncludeTax?: boolean;
  onAddGroup?: (group: ProductGroup) => void;
  onUpdateGroup?: (id: string, updated: Partial<ProductGroup>) => void;
  onDeleteGroup?: (id: string, reassignGroupId?: string) => void;
  onImportProducts?: (result: ProductsImportResult) => void;
  notify?: (msg: string) => void;
  barcodePrint?: {
    printSettings: PrintSettings;
    onChangePrintSettings: (updater: (prev: PrintSettings) => PrintSettings) => void;
    companyName: string;
    taxRatePercent?: number;
    pricesIncludeTax?: boolean;
  };
}

export default function ProductsManager({ 
  products, 
  expiryWarnDays = 30,
  groups = [],
  printers = [],
  initialTab = 'products',
  initialCodeFilter,
  tobaccoEnabled = false,
  openBarcode = false,
  onBarcodeClose,
  onAddProduct, 
  onUpdateProduct, 
  onDeleteProduct,
  onDeleteProducts,
  getDeleteBlockReason,
  pricesIncludeTax,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onImportProducts,
  notify,
  barcodePrint
}: ProductsManagerProps) {
  const [barcodeIds, setBarcodeIds] = useState<string[] | null>(openBarcode ? [] : null);
  const [activeTab, setActiveTab] = useState<'products' | 'groups' | 'bundles'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  // فلتر الباركود + تحديد أصناف لحذفها دفعة واحدة
  const [codeFilter, setCodeFilter] = useState<'all' | 'none' | 'invalid' | 'noprice' | 'belowcost' | 'tobacco'>(initialCodeFilter || 'all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const badCode = (p: Product) => barcodeIssue(p.barcode) === 'invalid' || (p.units || []).some((u) => barcodeIssue(u.barcode) === 'invalid');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Quick Add Group Modal within Product Form
  const [showQuickAddGroupModal, setShowQuickAddGroupModal] = useState(false);
  const [quickGroupNameAr, setQuickGroupNameAr] = useState('');
  const [quickGroupColor, setQuickGroupColor] = useState('#06b6d4');
  
  // Product form fields
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  // خانة التكلفة تُعرض وتُدخل شاملة الضريبة حين تكون أسعار البيع شاملة — وتُخزَّن صافية كما كانت
  const costK = pricesIncludeTax && (barcodePrint?.taxRatePercent ?? 15) > 0 ? 1 + (barcodePrint?.taxRatePercent ?? 15) / 100 : 1;
  // أصناف سعرها أقل من تكلفتها (فلتر «تحت التكلفة»)
  const belowIds = useMemo(() => new Set(belowCostProducts(products, costK).map((h) => h.product.id)), [products, costK]);
  const costLoaded = useRef<{ shown: string; net: number } | null>(null);
  /** صافي التكلفة من الخانة؛ إن لم تُلمس القيمة المحمَّلة تبقى التكلفة الأصلية بكسورها */
  const netCost = () => {
    if (costLoaded.current && costLoaded.current.shown === cost) return costLoaded.current.net;
    const n = parseFloat(cost) || 0;
    return costK === 1 ? n : Math.round((n / costK) * 10000) / 10000;
  };
  const [groupId, setGroupId] = useState(groups[0]?.id || '');
  const [categoryAr, setCategoryAr] = useState(groups[0]?.nameAr || 'وجبات');
  const [stock, setStock] = useState('100');
  const [minStock, setMinStock] = useState('10');
  const [barcode, setBarcode] = useState('');
  const [extraBarcodes, setExtraBarcodes] = useState<string[]>([]);
  const [image, setImage] = useState('');

  // Packaging & Size Units state
  const [hasPackaging, setHasPackaging] = useState(false);
  // صنف خدمي: بلا مخزون — واسم الصنف عنوان فقط عند العبوات/المقاسات
  const [isService, setIsService] = useState(false);
  /** منتج تبغ: تُضاف عليه رسوم تقديم التبغ (نسخة Pro) */
  const [isTobacco, setIsTobacco] = useState(false);
  // بيع بالوزن (الميزان الإلكتروني) + كود الصنف في الميزان (PLU)
  const [soldByWeight, setSoldByWeight] = useState(false);
  const [scaleCode, setScaleCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [sellBaseUnit, setSellBaseUnit] = useState(false);
  const [packagingList, setPackagingList] = useState<ProductUnit[]>([]);
  const titleOnly = hasPackaging && !sellBaseUnit && packagingList.some(u => u.name && u.name.trim());
  /** سعر الصنف الأساسي: عند «العنوان فقط» = أقل سعر بين الخيارات (للعرض «من ...») */
  const resolveBasePrice = (units?: ProductUnit[]) =>
    titleOnly && units && units.length ? Math.min(...units.map(u => Number(u.price) || 0)) : parseFloat(price) || 0;

  /** n باركودات داخلية جديدة لا تتكرر مع كل الأصناف ومع عبوات النموذج الحالي */
  const pkgBarcodes = (current: ProductUnit[], n: number): string[] => {
    const used = [...products.flatMap((p) => [p.barcode || '', ...(p.barcodes || []), ...(p.units || []).map((u) => u.barcode || '')]), barcode, ...current.map((u) => u.barcode || '')];
    const out: string[] = [];
    for (let i = 0; i < n; i++) { const c = generateInternalEan13([...used, ...out]); out.push(c); }
    return out;
  };

  const handleAddPackagingRow = (type: 'size' | 'volume' | 'pack' | 'weight' | 'unit' | 'flavor' = 'size') => {
    const currentBasePrice = parseFloat(price) || 0;
    const newRow: ProductUnit = {
      id: `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      factor: 1,
      price: currentBasePrice,
      barcode: '',
      unitType: type
    };
    // باركود داخلي صالح (EAN-13) لكل عبوة جديدة — لا يتكرر مع الأصناف ولا مع عبوات هذا الصنف
    setPackagingList(prev => [...prev, { ...newRow, barcode: pkgBarcodes(prev, 1)[0] }]);
    setHasPackaging(true);
  };

  const handleUpdatePackagingRow = (id: string, updates: Partial<ProductUnit>) => {
    setPackagingList(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleRemovePackagingRow = (id: string) => {
    setPackagingList(prev => prev.filter(item => item.id !== id));
  };

  // ===== تحويل تعبئة إلى صنف مستقل =====
  // ينشئ صنفاً جديداً بسعر التعبئة وباركودها وتكلفتها، ويحذفها من الصنف الأصلي، وينقل الكمية الموجودة
  // من رصيد الأصلي (بالحبات) إلى رصيد الجديد. الفواتير القديمة لا تتأثر (كل فاتورة نسخة محفوظة).
  const [detach, setDetach] = useState<null | { unit: ProductUnit; name: string; nameEn: string; price: string; cost: string; barcode: string; qty: string }>(null);
  const openDetach = (u: ProductUnit) => {
    const f = u.factor > 0 ? u.factor : 1;
    setDetach({
      unit: u,
      name: `${nameAr.trim()} - ${u.name.trim()}`,
      nameEn: nameEn.trim() ? `${nameEn.trim()} - ${u.name.trim()}` : '',
      price: String(u.price ?? 0),
      cost: String(+(u.cost ?? netCost() * f).toFixed(4)),
      barcode: u.barcode || '',
      qty: '',
    });
  };
  const confirmDetach = () => {
    if (!detach || !editingProduct) return;
    const u = detach.unit;
    const f = u.factor > 0 ? u.factor : 1;
    const name = detach.name.trim();
    if (!name) { alert('اكتب اسم الصنف الجديد'); return; }
    if (products.some((p) => p.nameAr.trim() === name)) { alert(`يوجد صنف بنفس الاسم «${name}»`); return; }
    const code = detach.barcode.trim();
    if (code) {
      const owner = barcodeOwner(code, editingProduct.id);
      if (owner) { alert(`الباركود ${code} مستخدم للصنف «${owner}»`); return; }
      if (code === barcode.trim() || extraBarcodes.includes(code) || packagingList.some((x) => x.id !== u.id && (x.barcode || '').trim() === code)) { alert(`الباركود ${code} مستخدم في نفس الصنف الأصلي`); return; }
    }
    const qty = Math.max(0, parseFloat(detach.qty) || 0);
    const pieces = qty * f;
    const formStock = parseFloat(stock) || 0;
    if (!editingProduct.isService && pieces > formStock + 1e-9 && !confirm(`الكمية المنقولة (${pieces} حبة) أكبر من رصيد الصنف (${formStock}) — سيصبح رصيده سالباً. متابعة؟`)) return;
    const np: Product = {
      ...editingProduct,
      id: `p${Date.now()}`,
      nameAr: name,
      nameEn: detach.nameEn.trim(),
      price: parseFloat(detach.price) || 0,
      cost: parseFloat(detach.cost) || 0,
      stock: editingProduct.isService ? 0 : qty,
      minStock: editingProduct.minStock ? Math.max(1, Math.ceil(editingProduct.minStock / f)) : editingProduct.minStock,
      barcode: code || newBarcode(),
      barcodes: undefined, units: undefined, variants: undefined, sellBaseUnit: undefined,
      damaged: undefined, damageLog: undefined, soldByWeight: undefined, scaleCode: undefined,
      isBundle: undefined, bundleItems: undefined, disabled: undefined,
    };
    onAddProduct(np);
    // الصنف الأصلي: يُحفظ فوراً حذف التعبئة ونقل الرصيد (بقية تعديلات النموذج تُحفظ بزر الحفظ كالمعتاد)
    const savedUnits = (editingProduct.units || []).filter((x) => x.id !== u.id);
    const newStock = editingProduct.isService ? 0 : (editingProduct.stock || 0) - pieces;
    const parentPatch: Partial<Product> = {
      units: savedUnits.length ? savedUnits : undefined,
      variants: savedUnits.length ? savedUnits.map((x) => ({ id: x.id, name: x.name, price: x.price })) : undefined,
      sellBaseUnit: savedUnits.length ? editingProduct.sellBaseUnit : undefined,
      stock: newStock,
    };
    onUpdateProduct(editingProduct.id, parentPatch);
    setEditingProduct({ ...editingProduct, ...parentPatch });
    const rest = packagingList.filter((x) => x.id !== u.id);
    setPackagingList(rest);
    if (!rest.length) setHasPackaging(false);
    if (!editingProduct.isService) setStock(String(+(formStock - pieces).toFixed(4)));
    setDetach(null);
    notify?.(`تم إنشاء الصنف «${name}»${pieces ? ` ونُقل إليه ${qty} من رصيد «${nameAr.trim()}» (${pieces} حبة)` : ''}`);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = PACKAGING_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const currentBasePrice = parseFloat(price) || 0;
    const generated = preset.generate(currentBasePrice, barcode);
    // باركود صالح لكل عبوة (بدل «-S/-M/-L» التي لا تُقرأ بالماسح): العبوة المطابقة لباركود الصنف تبقى عليه
    const codes = pkgBarcodes([], generated.length);
    setPackagingList(generated.map((u, i) => ({ ...u, barcode: barcode && u.barcode === barcode ? barcode : codes[i] })));
    setHasPackaging(true);
  };

  // Fallback categories list if groups are empty or mixed
  const allCategoryNames = useMemo(() => Array.from(new Set([
    ...groups.map(g => g.nameAr),
    ...products.map(p => p.categoryAr).filter(Boolean)
  ])), [groups, products]);

  // عدّ الأصناف لكل تصنيف وعدد الباقات — مرة واحدة بدل المرور على كل الأصناف لكل زر
  const { categoryCounts, bundleCount } = useMemo(() => {
    const m = new Map<string, number>();
    let bundles = 0;
    for (const p of products) {
      if (p.categoryAr) m.set(p.categoryAr, (m.get(p.categoryAr) || 0) + 1);
      if (p.isBundle) bundles++;
    }
    return { categoryCounts: m, bundleCount: bundles };
  }, [products]);

  const filterCategories = ['الكل', ...allCategoryNames];

  const handleOpenAddProduct = () => {
    setExtraBarcodes([]);
    setNameAr('');
    setNameEn('');
    setDescription('');
    setPrice('');
    setCost(''); costLoaded.current = null;
    setIsService(false);
    setIsTobacco(false);
    setSoldByWeight(false);
    setScaleCode('');
    setExpiryDate('');
    setSellBaseUnit(false);
    // المجموعة اختيارية — إن كانت قائمة الأصناف مفلترة على مجموعة يُضاف الصنف إليها
    const openGroup = selectedCategory !== 'الكل' ? groups.find((g) => g.nameAr === selectedCategory) : undefined;
    setGroupId(openGroup?.id || '');
    setCategoryAr(openGroup?.nameAr || '');
    setStock('100');
    setMinStock('10');
    setBarcode('');
    setImage('');
    setHasPackaging(false);
    setPackagingList([]);
    setShowAddModal(true);
  };

  const handleGroupSelectChange = (newGroupId: string) => {
    setGroupId(newGroupId);
    const grp = groups.find(g => g.id === newGroupId);
    if (grp) {
      setCategoryAr(grp.nameAr);
    }
  };

  const handleQuickAddGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickGroupNameAr.trim() || !onAddGroup) return;

    const newGrp: ProductGroup = {
      id: `grp-${Date.now()}`,
      nameAr: quickGroupNameAr.trim(),
      nameEn: quickGroupNameAr.trim(),
      color: quickGroupColor,
      icon: 'Layers',
      displayOrder: (groups.length + 1),
      isActive: true
    };

    onAddGroup(newGrp);
    setGroupId(newGrp.id);
    setCategoryAr(newGrp.nameAr);
    setQuickGroupNameAr('');
    setShowQuickAddGroupModal(false);
  };

  /** الصنف الذي يستخدم الباركود (لمنع تكرار الباركود بين الأصناف) */
  /** باركود داخلي جديد (EAN-13 يبدأ بـ 2) لا يتكرر مع أي صنف أو عبوة أو باركود إضافي */
  const newBarcode = () => generateInternalEan13(products.flatMap((p) => [p.barcode || '', ...(p.barcodes || []), ...(p.units || []).map((u) => u.barcode || '')]));
  const barcodeOwner = (code: string, exceptId?: string): string | null => {
    const c = code.trim();
    if (!c) return null;
    for (const p of products) {
      if (p.id === exceptId) continue;
      if ((p.barcode || '').trim() === c || (p.barcodes || []).includes(c) || (p.units || []).some((u) => (u.barcode || '').trim() === c)) return p.nameAr;
    }
    return null;
  };
  const dupBarcodeError = (exceptId?: string): string | null => {
    for (const c of [barcode, ...extraBarcodes]) {
      const owner = barcodeOwner(c, exceptId);
      if (owner) return `الباركود ${c} مستخدم للصنف «${owner}»`;
    }
    return null;
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) return;
    { const dup = dupBarcodeError(); if (dup) { alert(dup); return; } }

    const currentGroup = groups.find(g => g.id === groupId);
    const resolvedCatAr = currentGroup ? currentGroup.nameAr : categoryAr;
    const resolvedCatEn = currentGroup?.nameEn || resolvedCatAr;

    const validUnits = hasPackaging 
      ? packagingList.filter(u => u.name && u.name.trim() !== '')
      : undefined;
    const validVariants = validUnits && validUnits.length > 0
      ? validUnits.map(u => ({ id: u.id, name: u.name, price: u.price }))
      : undefined;

    const newProduct: Product = {
      id: `p${Date.now()}`,
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      description: description.trim() || undefined,
      price: resolveBasePrice(validUnits),
      cost: netCost(),
      categoryAr: resolvedCatAr,
      categoryEn: resolvedCatEn,
      groupId: currentGroup?.id,
      stock: isService ? 0 : parseFloat(stock) || 0,
      minStock: parseInt(minStock) || 10,
      isService: isService || undefined,
      isTobacco: isTobacco || undefined,
      soldByWeight: soldByWeight || undefined,
      scaleCode: scaleCode.trim() || undefined,
      expiryDate: isService ? undefined : expiryDate || undefined,
      sellBaseUnit: validUnits && validUnits.length > 0 ? sellBaseUnit : undefined,
      barcode: barcode.trim() || newBarcode(),
      barcodes: extraBarcodes.length ? extraBarcodes : undefined,
      image: image || undefined,
      units: validUnits && validUnits.length > 0 ? validUnits : undefined,
      variants: validVariants && validVariants.length > 0 ? validVariants : undefined
    };

    onAddProduct(newProduct);

    // reset forms
    setNameAr('');
    setNameEn('');
    setDescription('');
    setPrice('');
    setCost(''); costLoaded.current = null;
    setStock('100');
    setMinStock('10');
    setBarcode('');
    setImage('');
    setHasPackaging(false);
    setPackagingList([]);
    setShowAddModal(false);
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setNameAr(product.nameAr);
    setNameEn(product.nameEn && product.nameEn.trim() !== product.nameAr.trim() ? product.nameEn : '');
    setDescription(product.description || '');
    setPrice(product.price.toString());
    { const shown = costK === 1 ? product.cost.toString() : String(+((product.cost || 0) * costK).toFixed(2)); costLoaded.current = { shown, net: product.cost || 0 }; setCost(shown); }
    
    const matchedGroup = groups.find(g => g.id === product.groupId || g.nameAr === product.categoryAr);
    setGroupId(matchedGroup ? matchedGroup.id : '');
    setCategoryAr(product.categoryAr);
    setStock(product.stock.toString());
    setMinStock((product.minStock ?? 10).toString());
    setBarcode(product.barcode);
    setExtraBarcodes(product.barcodes || []);
    setImage(product.image || '');

    setIsService(!!product.isService);
    setIsTobacco(!!product.isTobacco);
    setSoldByWeight(!!product.soldByWeight);
    setScaleCode(product.scaleCode || '');
    setExpiryDate(product.expiryDate || '');
    // الأصناف القديمة بلا إعداد: كان الأساسي يظهر إن لم يطابقه أحد الخيارات
    setSellBaseUnit(product.sellBaseUnit ?? !!(product.units?.length && !product.units.some(u => u.price === product.price && (u.factor === 1 || !u.factor))));
    // Load packaging & units
    if (product.units && product.units.length > 0) {
      setHasPackaging(true);
      setPackagingList([...product.units]);
    } else if (product.variants && product.variants.length > 0) {
      setHasPackaging(true);
      setPackagingList(product.variants.map((v, idx) => ({
        id: v.id,
        name: v.name,
        factor: 1,
        price: v.price,
        barcode: `${product.barcode}-${idx + 1}`,
        unitType: 'size'
      })));
    } else {
      setHasPackaging(false);
      setPackagingList([]);
    }

    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !nameAr.trim()) return;
    { const dup = dupBarcodeError(editingProduct.id); if (dup) { alert(dup); return; } }

    const currentGroup = groups.find(g => g.id === groupId);
    const resolvedCatAr = currentGroup ? currentGroup.nameAr : categoryAr;
    const resolvedCatEn = currentGroup?.nameEn || resolvedCatAr;

    const validUnits = hasPackaging 
      ? packagingList.filter(u => u.name && u.name.trim() !== '')
      : undefined;
    const validVariants = validUnits && validUnits.length > 0
      ? validUnits.map(u => ({ id: u.id, name: u.name, price: u.price }))
      : undefined;

    onUpdateProduct(editingProduct.id, {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      description: description.trim() || undefined,
      price: resolveBasePrice(validUnits),
      cost: netCost(),
      categoryAr: resolvedCatAr,
      categoryEn: resolvedCatEn,
      groupId: currentGroup?.id,
      stock: isService ? 0 : parseFloat(stock) || 0,
      minStock: parseInt(minStock) || 10,
      isService: isService || undefined,
      isTobacco: isTobacco || undefined,
      soldByWeight: soldByWeight || undefined,
      scaleCode: scaleCode.trim() || undefined,
      expiryDate: isService ? undefined : expiryDate || undefined,
      sellBaseUnit: validUnits && validUnits.length > 0 ? sellBaseUnit : undefined,
      barcode: barcode.trim() || newBarcode(),
      barcodes: extraBarcodes.length ? extraBarcodes : undefined,
      image: image || undefined,
      units: validUnits && validUnits.length > 0 ? validUnits : undefined,
      variants: validVariants && validVariants.length > 0 ? validVariants : undefined
    });

    setEditingProduct(null);
    setShowEditModal(false);
  };

  const handleDeleteClick = (id: string) => {
    const blocked = getDeleteBlockReason?.(id);
    if (blocked) { alert(blocked); return; }
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا الصنف نهائياً؟')) {
      onDeleteProduct(id);
    }
  };

  const deferredSearch = useDeferredValue(searchQuery);
  const filteredProducts = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'الكل' || p.categoryAr === selectedCategory;
      if (!matchesCategory) return false;
      if (codeFilter === 'none' && barcodeIssue(p.barcode) !== 'none') return false;
      if (codeFilter === 'invalid' && !badCode(p)) return false;
      if (codeFilter === 'noprice' && (Number(p.price) || 0) > 0) return false;
      if (codeFilter === 'belowcost' && !belowIds.has(p.id)) return false;
      if (codeFilter === 'tobacco' && !p.isTobacco) return false;
      return !q ||
        (p.nameAr || '').toLowerCase().includes(q) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
        (p.barcode || '').includes(q) ||
        (p.barcodes || []).some((b) => b.includes(q));
    });
  }, [products, deferredSearch, selectedCategory, codeFilter, belowIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const codeCounts = useMemo(() => {
    let none = 0, invalid = 0, noprice = 0, tobacco = 0;
    for (const p of products) { if (barcodeIssue(p.barcode) === 'none') none++; if (badCode(p)) invalid++; if (!((Number(p.price) || 0) > 0)) noprice++; if (p.isTobacco) tobacco++; }
    return { none, invalid, noprice, tobacco, belowcost: belowIds.size };
  }, [products, belowIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // التحديد يشمل الأصناف الظاهرة فقط (بعد البحث والفلترة)
  const visibleIds = useMemo(() => new Set(filteredProducts.map(p => p.id)), [filteredProducts]);
  const selectedVisible = useMemo(() => [...selectedIds].filter(id => visibleIds.has(id)), [selectedIds, visibleIds]);
  const tableFit = useFitHeight<HTMLDivElement>(70, 260, [activeTab, selectedVisible.length > 0]);
  const allSelected = filteredProducts.length > 0 && selectedVisible.length === filteredProducts.length;
  const toggleSel = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const deleteSelected = () => {
    const ids = selectedVisible;
    if (!ids.length) return;
    const blocked = ids.filter(id => getDeleteBlockReason?.(id));
    const ok = ids.filter(id => !blocked.includes(id));
    if (!ok.length) { alert(`لا يمكن حذف الأصناف المحددة (${blocked.length}) لأن عليها حركة (مبيعات أو مشتريات). يمكنك إيقافها عن البيع بدلاً من حذفها.`); return; }
    if (!confirm(`حذف ${ok.length} صنف نهائياً؟${blocked.length ? `\n(${blocked.length} صنف عليه حركة لن يُحذف)` : ''}`)) return;
    if (onDeleteProducts) onDeleteProducts(ok); else ok.forEach(id => onDeleteProduct(id));
    setSelectedIds(new Set());
  };
  // الجدول يرسم ١٠٠ صف فقط ويحمّل المزيد عند التمرير (كانت نافذة التعديل تهنج لأن الجدول كله يُعاد رسمه مع كل حرف)
  const productsTable = usePagedList(filteredProducts, 50, `${deferredSearch}|${selectedCategory}`);

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full flex flex-col" dir="rtl">
      
      {/* Top Navigation Tabs Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 pt-5 pb-0 shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Package className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
              <span>الأصناف</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
              قائمة الأصناف وبياناتها وأسعارها، ومجموعات الأصناف، والباقات (عدة أصناف تُباع معاً بسعر واحد).
            </p>
          </div>

          {activeTab === 'products' && (
            <div className="flex flex-wrap items-center gap-2">
              {onImportProducts && (
                <ProductsImportExport products={products} groups={groups} onImport={onImportProducts} notify={notify} />
              )}
              <button
                onClick={async () => {
                  const label = [selectedCategory && selectedCategory !== 'الكل' ? `المجموعة: ${selectedCategory}` : 'كل المجموعات', deferredSearch.trim() ? `بحث: ${deferredSearch.trim()}` : ''].filter(Boolean).join(' — ');
                  const ok = await exportHtmlAsPdf(productsSheetHtml(filteredProducts, groups, barcodePrint?.companyName || '', label), `products-${new Date().toISOString().slice(0, 10)}.pdf`);
                  if (ok) notify?.(`تم تصدير ${filteredProducts.length} صنف إلى PDF`);
                }}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border text-rose-600 dark:text-rose-400 border-rose-500/20 cursor-pointer"
                title="تصدير الأصناف المعروضة (حسب البحث والمجموعة) إلى PDF"
                data-testid="products-pdf"
              >
                <FileDown className="w-4 h-4" /><span>تصدير PDF</span>
              </button>
              {barcodePrint && (
                <button onClick={() => setBarcodeIds([])} className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border text-cyan-600 dark:text-cyan-400 border-cyan-500/20 cursor-pointer">
                  <Barcode className="w-4 h-4" /><span>طباعة باركود</span>
                </button>
              )}
              <button 
                onClick={() => setActiveTab('groups')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-cyan-600 dark:text-cyan-400 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border border-cyan-500/20 cursor-pointer"
              >
                <FolderTree className="w-4 h-4" />
                <span>إدارة المجموعات ({groups.length})</span>
              </button>

              <button 
                onClick={handleOpenAddProduct}
                className="px-5 py-2.5 bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-black rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('products')}
            className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'products'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>قائمة الأصناف</span>
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px] px-2 py-0.5 rounded-full">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'groups'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>مجموعات الأصناف</span>
            <span className="bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-mono text-[11px] px-2 py-0.5 rounded-full border border-cyan-500/30">
              {groups.length} مجموعات
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bundles')}
            className={`pb-3 px-4 font-black text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'bundles'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>الباقات</span>
            <span className="bg-purple-500/20 text-purple-600 dark:text-purple-400 font-mono text-[11px] px-2 py-0.5 rounded-full border border-purple-500/30">
              {bundleCount} باقة
            </span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'groups' && onAddGroup && onUpdateGroup && onDeleteGroup && (
          <ProductGroupsManager 
            groups={groups}
            products={products}
            printers={printers}
            onAddGroup={onAddGroup}
            onUpdateGroup={onUpdateGroup}
            onDeleteGroup={onDeleteGroup}
            onSelectGroupFilter={(groupName) => {
              setSelectedCategory(groupName);
              setActiveTab('products');
            }}
          />
        )}

        {activeTab === 'bundles' && (
          <ProductBundlesManager 
            products={products}
            groups={groups}
            onAddProduct={onAddProduct}
            onUpdateProduct={onUpdateProduct}
            onDeleteProduct={onDeleteProduct}
            getDeleteBlockReason={getDeleteBlockReason}
          />
        )}

        {activeTab === 'products' && (
          <div className="p-6 space-y-6">
            
            {/* Filter and Search Bar */}
            <div className="flex flex-col lg:flex-row gap-4 min-w-0">
              {/* البحث بعرض ثابت لا ينضغط مهما زاد عدد المجموعات */}
              <div className="relative w-full lg:w-96 shrink-0" data-testid="products-search">
                <input 
                  type="text" 
                  placeholder="البحث عن صنف بالاسم أو الباركود..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-12 pl-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
                />
                <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3.5" />
              </div>
              
              {/* Category / Group selector Chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 min-w-0 flex-1 no-scrollbar">
                {filterCategories.map((cat, idx) => {
                  const grp = groups.find(g => g.nameAr === cat);
                  const isSelected = selectedCategory === cat;
                  const groupColor = grp?.color || '#06b6d4';

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-md' 
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {cat !== 'الكل' && (
                        <span 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: isSelected ? '#000' : groupColor }}
                        />
                      )}
                      <span>{cat}</span>
                      {cat !== 'الكل' && (
                        <span className={`text-[10px] font-mono px-1 rounded-full ${isSelected ? 'bg-black/20 text-slate-950 font-black' : 'text-slate-500'}`}>
                          {categoryCounts.get(cat) || 0}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* فلاتر الباركود + التحديد والحذف */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold -mt-2">
              {([['all', 'كل الأصناف', products.length], ['none', 'بلا باركود', codeCounts.none], ['invalid', 'باركود غير صالح', codeCounts.invalid], ['noprice', 'بلا سعر', codeCounts.noprice], ['belowcost', 'تحت التكلفة', codeCounts.belowcost], ['tobacco', '🚬 منتجات التبغ', codeCounts.tobacco]] as const).filter(([k]) => (k !== 'tobacco' || tobaccoEnabled) && (k !== 'belowcost' || codeCounts.belowcost > 0 || codeFilter === 'belowcost')).map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setCodeFilter(k)} data-testid={`prod-code-${k}`}
                  className={`px-3 py-1.5 rounded-lg border cursor-pointer ${codeFilter === k ? (k === 'invalid' ? 'bg-violet-600 text-white border-violet-600' : k === 'noprice' || k === 'belowcost' ? 'bg-rose-600 text-white border-rose-600' : k === 'tobacco' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-700 text-white border-slate-700') : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
                  {l} ({n})
                </button>
              ))}
              {selectedVisible.length > 0 && (
                <div className="flex items-center gap-2 mr-auto bg-rose-50 dark:bg-rose-950/30 border border-rose-300/70 rounded-xl px-3 py-1.5" data-testid="prod-bulk-bar">
                  <span className="font-black text-rose-700 dark:text-rose-300">محدد: {selectedVisible.length}</span>
                  <button type="button" onClick={deleteSelected} data-testid="prod-bulk-delete" className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> حذف المحدد</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/60 cursor-pointer">إلغاء التحديد</button>
                </div>
              )}
            </div>

            {/* Products Table */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
              {/* الجدول داخل إطار بارتفاع الشاشة: شريط التمرير الأفقي يبقى ظاهراً أسفل الإطار */}
              <div ref={tableFit.ref} className="overflow-auto" style={tableFit.style} data-testid="prod-table-scroll">
                <table className="w-full border-collapse text-right text-xs md:text-sm font-bold">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="p-4 w-10 text-center">
                        <input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(filteredProducts.map(p => p.id)))}
                          title={`تحديد كل الأصناف الظاهرة (${filteredProducts.length})`} data-testid="prod-select-all" className="w-4 h-4 accent-rose-600 cursor-pointer" />
                      </th>
                      <th className="p-4">الصنف</th>
                      <th className="p-4">المجموعة والتصنيف</th>
                      <th className="p-4 text-center">الباركود</th>
                      <th className="p-4 text-center">سعر البيع</th>
                      <th className="p-4 text-center" title={costK === 1 ? undefined : 'شاملة الضريبة'}>التكلفة</th>
                      <th className="p-4 text-center">المخزون</th>
                      <th className="p-4 text-center">التالف</th>
                      <th className="p-4 text-center">التحكم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/40 dark:divide-slate-800/40 text-slate-600 dark:text-slate-300">
                    {productsTable.visible.map(product => {
                      const matchedGroup = groups.find(g => g.id === product.groupId || g.nameAr === product.categoryAr);
                      const groupColor = matchedGroup?.color || '#06b6d4';

                      return (
                        <tr key={product.id} className={`hover:bg-white/30 dark:hover:bg-slate-900/30 transition-colors ${selectedIds.has(product.id) ? 'bg-rose-50/70 dark:bg-rose-950/20' : product.disabled ? 'opacity-60 bg-slate-100/60 dark:bg-slate-900/60' : ''}`}>
                          <td className="p-4 text-center">
                            <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleSel(product.id)} data-testid="prod-select" className="w-4 h-4 accent-rose-600 cursor-pointer" />
                          </td>
                          <td className="p-4 flex items-center gap-3">
                            <div 
                              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden bg-white dark:bg-slate-900 shadow-xs relative"
                              style={{ 
                                backgroundColor: `${groupColor}15`,
                                borderColor: `${groupColor}40`,
                                color: groupColor 
                              }}
                            >
                              {product.image ? (
                                <img 
                                  src={product.image} 
                                  alt={product.nameAr}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : product.isBundle ? (
                                <Boxes className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                              ) : (
                                <Package className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900 dark:text-white text-sm leading-snug">{product.nameAr}</p>
                                {product.disabled && <span className="bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300/60 px-2 rounded-md text-[10px] font-black" data-testid="badge-disabled">⏸ موقوف</span>}
                                {product.isBundle && (
                                  <span className="bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 px-2 py-0.2 rounded-md text-[10px] font-black flex items-center gap-1">
                                    <Boxes className="w-3 h-3" />
                                    <span>باقة كومبو</span>
                                  </span>
                                )}
                              </div>
                              {product.nameEn && product.nameEn.trim() !== product.nameAr.trim() && <p className="text-[10px] text-slate-500 font-medium font-mono">{product.nameEn}</p>}
                              {product.isBundle && product.bundleItems && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                                  يشمل: {product.bundleItems.map(bi => `${bi.qty}× ${bi.productName}`).join(' + ')}
                                </p>
                              )}
                              {((product.units && product.units.length > 0) || (product.variants && product.variants.length > 0)) && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className="text-[9.5px] font-black bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Layers className="w-2.5 h-2.5" />
                                    <span>{product.units?.length || product.variants?.length} تعبئات / مقاسات</span>
                                  </span>
                                  {(product.units || product.variants?.map(v => ({ id: v.id, name: v.name, price: v.price })) || []).slice(0, 3).map((u: any) => (
                                    <span key={u.id} className="text-[9.5px] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-0.5">
                                      <span>{u.name}</span>
                                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">({u.price.toFixed(2)} ﷼)</span>
                                    </span>
                                  ))}
                                  {((product.units?.length || product.variants?.length || 0) > 3) && (
                                    <span className="text-[9.5px] text-slate-500 font-mono">
                                      +{(product.units?.length || product.variants?.length || 0) - 3} أخرى
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <span 
                              className="px-2.5 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1.5 border"
                              style={{ 
                                backgroundColor: `${groupColor}15`,
                                borderColor: `${groupColor}40`,
                                color: groupColor 
                              }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColor }} />
                              <span>{product.categoryAr || 'عام'}</span>
                            </span>
                          </td>
                          <td className="p-4 text-center font-mono text-slate-500">
                            <span className="flex items-center justify-center gap-1">
                              <Barcode className="w-4 h-4 text-slate-400 dark:text-slate-600" />
                              <span>{product.barcode}</span>
                            </span>
                          </td>
                          <td className="p-4 text-center font-mono font-black text-slate-900 dark:text-white text-sm">
                            <span className="inline-flex items-center gap-1">{product.price.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" /></span>
                          </td>
                          <td className="p-4 text-center font-mono text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">{((product.cost || 0) * costK).toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-slate-500" /></span>
                          </td>
                          <td className="p-4 text-center font-mono">
                            {product.isService ? (
                              <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-300/60">🛠️ صنف خدمي</span>
                            ) : (() => {
                              const threshold = product.minStock !== undefined ? product.minStock : 10;
                              const isOut = product.stock <= 0;
                              const isLow = !isOut && product.stock <= threshold;
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black inline-flex items-center gap-1.5 ${
                                    isOut 
                                      ? 'text-rose-600 dark:text-rose-400 bg-rose-950/40 border border-rose-500/40 shadow-sm' 
                                      : isLow 
                                      ? 'text-amber-600 dark:text-amber-400 bg-amber-950/40 border border-amber-500/40 ring-1 ring-amber-400/40 shadow-sm' 
                                      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-950/20'
                                  }`}>
                                    {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-current animate-pulse" />}
                                    {isOut && <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
                                    <span>{product.stock} قِطعة</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    الحد الأدنى: {threshold}
                                  </span>
                                  {product.expiryDate && (() => {
                                    const st = expiryState(product.expiryDate, expiryWarnDays);
                                    return (
                                      <span data-testid="product-expiry-badge" title={`تاريخ الصلاحية ${product.expiryDate}`}
                                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${st === 'expired' ? 'bg-rose-600 text-white' : st === 'soon' ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                        📅 {st === 'ok' ? product.expiryDate : expiryLabel(product.expiryDate)}
                                      </span>
                                    );
                                  })()}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-4 text-center font-mono" data-testid="prod-damaged">
                            {product.isService ? <span className="text-slate-300">—</span> : (
                              <span className={(product.damaged || 0) > 0 ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-slate-400'}
                                title={(product.damageLog || []).slice(-5).map(d => `${d.date}: ${d.qty}${d.note ? ` — ${d.note}` : ''}`).join('\n') || 'يُسجَّل التالف من شاشة المخزون والجرد'}>
                                {product.damaged || 0}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex gap-2 justify-center">
                              {barcodePrint && (
                                <button
                                  onClick={() => setBarcodeIds([product.id])}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-600 dark:text-slate-300 rounded transition border border-slate-300 dark:border-slate-700"
                                  title="طباعة ملصق باركود"
                                >
                                  <Barcode className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => onUpdateProduct(product.id, { disabled: !product.disabled })}
                                className={`p-1.5 rounded transition border cursor-pointer ${product.disabled ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-rose-500/10 hover:text-rose-600'}`}
                                title={product.disabled ? 'تفعيل الصنف للبيع' : 'إيقاف الصنف عن البيع'}
                                data-testid="toggle-product-disabled"
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleEditClick(product)}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded transition border border-slate-300 dark:border-slate-700 hover:border-cyan-500/30 cursor-pointer"
                                title="تعديل"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteClick(product.id)}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded transition border border-slate-300 dark:border-slate-700 hover:border-rose-500/30 cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredProducts.length > 0 && <Pagination pager={productsTable} unit="صنف" />}

              {filteredProducts.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>لا توجد أصناف مطابقة لخيارات البحث أو التصفية الحالية</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Add Product Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className="font-black text-lg text-cyan-600 dark:text-cyan-400">إضافة صنف جديد</span>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="px-6 pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[85vh] overflow-y-auto">
              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم الصنف باللغة العربية *</label>
                <input autoFocus
                  type="text" 
                  required
                  placeholder="اكتب اسم الصنف كما سيظهر في الفاتورة"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold"
                />
              </div>

              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الاسم باللغة الإنجليزية</label>
                <input 
                  type="text" 
                  placeholder="Item name in English (optional)"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold text-left"
                  dir="ltr"
                />
              </div>

              <div className="col-span-2 md:col-span-4 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">وصف الصنف (اختياري — يظهر في الفاتورة تحت الاسم)</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="تفاصيل تظهر تحت اسم الصنف في الفاتورة (اختياري)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              {/* نوع الصنف: مخزني أو خدمي */}
              <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2" data-testid="product-kind">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">نوع الصنف:</span>
                <button type="button" onClick={() => setIsService(false)} className={`px-4 py-2 rounded-xl text-xs font-black border transition ${!isService ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}>📦 صنف مخزني</button>
                <button type="button" onClick={() => setIsService(true)} data-kind="service" className={`px-4 py-2 rounded-xl text-xs font-black border transition ${isService ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}>🛠️ صنف خدمي</button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{isService ? 'خدمة (تركيب، توصيل، صيانة...): تُباع وتُفوتر بالضريبة دون مخزون أو جرد أو تنبيهات نفاد' : 'يُخصم من المخزون عند البيع ويظهر في الجرد'}</span>
              </div>

              {/* منتج تبغ — يظهر فقط عند تفعيل «رسوم التبغ» في إعدادات المنشأة */}
              {tobaccoEnabled && <label className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 cursor-pointer" data-testid="product-tobacco">
                <input type="checkbox" checked={isTobacco} onChange={(e) => setIsTobacco(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">🚬 منتج تبغ (معسّل، شيشة، سجائر...)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">تُضاف عند البيع «رسوم تقديم منتجات التبغ» (إعدادات المنشأة ← رسوم التبغ)</span>
              </label>}

              {/* البيع بالوزن — الميزان الإلكتروني */}
              {!isService && (
                <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2" data-testid="product-weight">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={soldByWeight} onChange={(e) => setSoldByWeight(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                    ⚖️ يباع بالوزن (كجم)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">كود الميزان (PLU)</span>
                    <input value={scaleCode} onChange={(e) => setScaleCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" placeholder="مثال 00123"
                      data-testid="scale-code" className="w-28 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">📅 تاريخ الصلاحية</span>
                    <DateField value={expiryDate} onChange={(v) => setExpiryDate(v)} data-testid="product-expiry"
                      className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500" />
                    {expiryDate && <button type="button" onClick={() => setExpiryDate('')} className="text-xs text-rose-600 font-bold">مسح</button>}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">السعر = سعر الكيلو. الكمية تُقرأ من الميزان المتصل أو من ملصق الميزان الذي يبدأ بـ 2</span>
                </div>
              )}

              {/* Group / Category Selector with Quick Add */}
              <div className="col-span-2 md:col-span-2 space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">مجموعة الصنف <span className="font-semibold text-slate-400">(اختياري)</span></label>
                  {onAddGroup && (
                    <button
                      type="button"
                      onClick={() => setShowQuickAddGroupModal(true)}
                      className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مجموعة جديدة</span>
                    </button>
                  )}
                </div>

                <select 
                  value={groupId || (groups.length ? '' : categoryAr)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) { setGroupId(''); setCategoryAr(''); return; }
                    const matched = groups.find(g => g.id === val || g.nameAr === val);
                    if (matched) {
                      setGroupId(matched.id);
                      setCategoryAr(matched.nameAr);
                    } else {
                      setGroupId('');
                      setCategoryAr(val);
                    }
                  }}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                >
                  <option value="">— بدون مجموعة —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nameAr} {g.nameEn ? `(${g.nameEn})` : ''}
                    </option>
                  ))}
                  {groups.length === 0 && (
                    allCategoryNames.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">سعر البيع ({pricesIncludeTax ? 'شامل الضريبة' : 'قبل الضريبة'}) {titleOnly ? <span className="text-cyan-700 dark:text-cyan-400">— يُحدد لكل خيار أدناه</span> : <span className="font-semibold text-slate-400">(اختياري — يمكن تحديده عند البيع)</span>}</label>
                <input 
                  type="number" 
                  step="0.01"
                  
                  disabled={titleOnly}
                  placeholder={titleOnly ? 'من الخيارات' : '0.00'}
                  value={titleOnly ? '' : price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">تكلفة الصنف <span className="font-semibold text-slate-400">{costK === 1 ? '(بدون ضريبة)' : '(شاملة الضريبة)'}</span></label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  data-testid="product-cost"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                />
                {!titleOnly && <ProfitHint price={price} cost={cost} pricesIncludeTax={pricesIncludeTax} taxRatePercent={barcodePrint?.taxRatePercent ?? 15} unitLabel={soldByWeight ? 'للكيلو' : isService ? 'للخدمة' : 'للحبة'} costIncludesTax={costK !== 1} />}
              </div>

              {!isService && (<>
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">كمية المخزون الافتتاحية</label>
                <input 
                  type="number" 
                  placeholder="100"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>الحد الأدنى للتنبيه</span>
                </label>
                <input 
                  type="number" 
                  placeholder="10"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-amber-500/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400 text-amber-700 dark:text-amber-300 font-bold font-mono"
                />
              </div>
              </>)}

              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">رمز الباركود (Barcode)</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="اختياري — يُولَّد باركود تلقائياً إذا تُرك فارغاً"
                    value={barcode}
                    onChange={(e) => setBarcode(undoubleScan(e.target.value))}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={latinBarcodeKeyDown}
                    data-testid="product-barcode"
                    className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                  />
                  <button type="button" onClick={() => setBarcode(newBarcode())} title="توليد باركود داخلي جديد (EAN-13) غير مستخدم" data-testid="product-barcode-gen" className="shrink-0 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 cursor-pointer">توليد</button>
                </div>
              </div>

              <div className="col-span-2 md:col-span-2">
                <ExtraBarcodes value={extraBarcodes} onChange={setExtraBarcodes} isTaken={(c) => (c === barcode.trim() ? 'هذا الصنف (الباركود الأساسي)' : barcodeOwner(c, editingProduct?.id))} />
              </div>

              {/* قسم صورة المنتج والذكاء الاصطناعي */}
              <ProductImagePicker
                currentImageUrl={image}
                productNameAr={nameAr}
                productNameEn={nameEn}
                categoryNameAr={categoryAr}
                onSelectImage={(url) => setImage(url)}
                onRemoveImage={() => setImage('')}
              />

              {/* نظام التعبئة والمقاسات والأحجام */}
              <PackagingEditor 
                hasPackaging={hasPackaging}
                onToggleHasPackaging={setHasPackaging}
                packagingList={packagingList}
                basePrice={parseFloat(price) || 0}
                baseBarcode={barcode}
                onAddRow={handleAddPackagingRow}
                onUpdateRow={handleUpdatePackagingRow}
                onRemoveRow={handleRemovePackagingRow}
                onApplyPreset={handleApplyPreset}
              />
              {hasPackaging && (
                <div className="col-span-2 md:col-span-4 rounded-2xl border-2 border-cyan-500/40 bg-cyan-50/60 dark:bg-cyan-950/20 p-4 space-y-2" data-testid="sell-mode">
                  <p className="text-sm font-black text-slate-900 dark:text-white">طريقة البيع في شاشة الكاشير</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="sellmode" checked={!sellBaseUnit} onChange={() => setSellBaseUnit(false)} className="mt-1 accent-cyan-600" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">اسم الصنف «{nameAr.trim() || 'شاي عدني'}» عنوان فقط — عند الضغط عليه تظهر الخيارات ({packagingList.filter(u => u.name.trim()).map(u => u.name.trim()).join(' / ') || 'صغير / وسط / كبير'}) ويُختار منها <span className="text-cyan-700 dark:text-cyan-400">(مناسب للمقاسات والأحجام)</span></span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="sellmode" checked={sellBaseUnit} onChange={() => setSellBaseUnit(true)} className="mt-1 accent-cyan-600" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">الصنف نفسه يُباع كوحدة أساسية (حبة) بسعر البيع أعلاه + الخيارات <span className="text-cyan-700 dark:text-cyan-400">(مناسب للتعبئة: حبة / شدة / كرتون)</span></span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">المخزون يُحسب دائماً بالوحدة الأساسية (الحبة): «عدد القطع» في كل خيار هو كم حبة يخصم من المخزون عند بيعه.</p>
                </div>
              )}

              <div className="col-span-2 md:col-span-4 sticky bottom-0 -mx-6 px-6 py-4 mt-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 flex gap-3">
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  حفظ الصنف
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal Overlay */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className="font-black text-lg text-cyan-600 dark:text-cyan-400">تعديل بيانات الصنف</span>
              <button onClick={() => setShowEditModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="px-6 pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[85vh] overflow-y-auto">
              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم الصنف باللغة العربية *</label>
                <input autoFocus
                  type="text" 
                  required
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold"
                />
              </div>

              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الاسم باللغة الإنجليزية</label>
                <input 
                  type="text" 
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold text-left"
                  dir="ltr"
                />
              </div>

              <div className="col-span-2 md:col-span-4 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">وصف الصنف (اختياري — يظهر في الفاتورة تحت الاسم)</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="تفاصيل تظهر تحت اسم الصنف في الفاتورة (اختياري)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              {/* نوع الصنف: مخزني أو خدمي */}
              <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2" data-testid="product-kind">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">نوع الصنف:</span>
                <button type="button" onClick={() => setIsService(false)} className={`px-4 py-2 rounded-xl text-xs font-black border transition ${!isService ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}>📦 صنف مخزني</button>
                <button type="button" onClick={() => setIsService(true)} data-kind="service" className={`px-4 py-2 rounded-xl text-xs font-black border transition ${isService ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}>🛠️ صنف خدمي</button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{isService ? 'خدمة (تركيب، توصيل، صيانة...): تُباع وتُفوتر بالضريبة دون مخزون أو جرد أو تنبيهات نفاد' : 'يُخصم من المخزون عند البيع ويظهر في الجرد'}</span>
              </div>

              {/* منتج تبغ — يظهر فقط عند تفعيل «رسوم التبغ» في إعدادات المنشأة */}
              {tobaccoEnabled && <label className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 cursor-pointer" data-testid="product-tobacco">
                <input type="checkbox" checked={isTobacco} onChange={(e) => setIsTobacco(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">🚬 منتج تبغ (معسّل، شيشة، سجائر...)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">تُضاف عند البيع «رسوم تقديم منتجات التبغ» (إعدادات المنشأة ← رسوم التبغ)</span>
              </label>}

              {/* البيع بالوزن — الميزان الإلكتروني */}
              {!isService && (
                <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2" data-testid="product-weight">
                  <label className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={soldByWeight} onChange={(e) => setSoldByWeight(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                    ⚖️ يباع بالوزن (كجم)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">كود الميزان (PLU)</span>
                    <input value={scaleCode} onChange={(e) => setScaleCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" placeholder="مثال 00123"
                      data-testid="scale-code" className="w-28 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500" />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">السعر = سعر الكيلو. الكمية تُقرأ من الميزان المتصل أو من ملصق الميزان الذي يبدأ بـ 2</span>
                </div>
              )}

              {/* Group / Category Selector with Quick Add */}
              <div className="col-span-2 md:col-span-2 space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">مجموعة الصنف <span className="font-semibold text-slate-400">(اختياري)</span></label>
                  {onAddGroup && (
                    <button
                      type="button"
                      onClick={() => setShowQuickAddGroupModal(true)}
                      className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مجموعة جديدة</span>
                    </button>
                  )}
                </div>

                <select 
                  value={groupId || (groups.length ? '' : categoryAr)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) { setGroupId(''); setCategoryAr(''); return; }
                    const matched = groups.find(g => g.id === val || g.nameAr === val);
                    if (matched) {
                      setGroupId(matched.id);
                      setCategoryAr(matched.nameAr);
                    } else {
                      setGroupId('');
                      setCategoryAr(val);
                    }
                  }}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                >
                  <option value="">— بدون مجموعة —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nameAr} {g.nameEn ? `(${g.nameEn})` : ''}
                    </option>
                  ))}
                  {groups.length === 0 && (
                    allCategoryNames.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">سعر البيع ({pricesIncludeTax ? 'شامل الضريبة' : 'قبل الضريبة'}) {titleOnly ? <span className="text-cyan-700 dark:text-cyan-400">— يُحدد لكل خيار أدناه</span> : <span className="font-semibold text-slate-400">(اختياري — يمكن تحديده عند البيع)</span>}</label>
                <input 
                  type="number" 
                  step="0.01"
                  
                  disabled={titleOnly}
                  placeholder={titleOnly ? 'من الخيارات' : undefined}
                  value={titleOnly ? '' : price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">تكلفة الصنف <span className="font-semibold text-slate-400">{costK === 1 ? '(بدون ضريبة)' : '(شاملة الضريبة)'}</span></label>
                <input 
                  type="number" 
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  data-testid="product-cost"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                />
                {!titleOnly && <ProfitHint price={price} cost={cost} pricesIncludeTax={pricesIncludeTax} taxRatePercent={barcodePrint?.taxRatePercent ?? 15} unitLabel={soldByWeight ? 'للكيلو' : isService ? 'للخدمة' : 'للحبة'} costIncludesTax={costK !== 1} />}
              </div>

              {!isService && (<>
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">كمية المخزون</label>
                <input 
                  type="number" 
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>الحد الأدنى للتنبيه</span>
                </label>
                <input 
                  type="number" 
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-amber-500/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-amber-700 dark:text-amber-300 font-bold font-mono"
                />
              </div>
              </>)}

              <div className="col-span-2 md:col-span-2 space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">رمز الباركود (Barcode)</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="اختياري — يُولَّد باركود تلقائياً إذا تُرك فارغاً"
                    value={barcode}
                    onChange={(e) => setBarcode(undoubleScan(e.target.value))}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={latinBarcodeKeyDown}
                    data-testid="product-barcode"
                    className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono"
                  />
                  <button type="button" onClick={() => setBarcode(newBarcode())} title="توليد باركود داخلي جديد (EAN-13) غير مستخدم" data-testid="product-barcode-gen" className="shrink-0 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 cursor-pointer">توليد</button>
                </div>
              </div>

              <div className="col-span-2 md:col-span-2">
                <ExtraBarcodes value={extraBarcodes} onChange={setExtraBarcodes} isTaken={(c) => (c === barcode.trim() ? 'هذا الصنف (الباركود الأساسي)' : barcodeOwner(c, editingProduct?.id))} />
              </div>

              {/* قسم صورة المنتج والذكاء الاصطناعي */}
              <ProductImagePicker
                currentImageUrl={image}
                productNameAr={nameAr}
                productNameEn={nameEn}
                categoryNameAr={categoryAr}
                onSelectImage={(url) => setImage(url)}
                onRemoveImage={() => setImage('')}
              />

              {/* نظام التعبئة والمقاسات والأحجام */}
              <PackagingEditor 
                hasPackaging={hasPackaging}
                onToggleHasPackaging={setHasPackaging}
                packagingList={packagingList}
                basePrice={parseFloat(price) || 0}
                baseBarcode={barcode}
                onAddRow={handleAddPackagingRow}
                onUpdateRow={handleUpdatePackagingRow}
                onRemoveRow={handleRemovePackagingRow}
                onApplyPreset={handleApplyPreset}
                onDetachRow={editingProduct && !editingProduct.isBundle ? openDetach : undefined}
              />
              {hasPackaging && (
                <div className="col-span-2 md:col-span-4 rounded-2xl border-2 border-cyan-500/40 bg-cyan-50/60 dark:bg-cyan-950/20 p-4 space-y-2" data-testid="sell-mode">
                  <p className="text-sm font-black text-slate-900 dark:text-white">طريقة البيع في شاشة الكاشير</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="sellmode" checked={!sellBaseUnit} onChange={() => setSellBaseUnit(false)} className="mt-1 accent-cyan-600" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">اسم الصنف «{nameAr.trim() || 'شاي عدني'}» عنوان فقط — عند الضغط عليه تظهر الخيارات ({packagingList.filter(u => u.name.trim()).map(u => u.name.trim()).join(' / ') || 'صغير / وسط / كبير'}) ويُختار منها <span className="text-cyan-700 dark:text-cyan-400">(مناسب للمقاسات والأحجام)</span></span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="sellmode" checked={sellBaseUnit} onChange={() => setSellBaseUnit(true)} className="mt-1 accent-cyan-600" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">الصنف نفسه يُباع كوحدة أساسية (حبة) بسعر البيع أعلاه + الخيارات <span className="text-cyan-700 dark:text-cyan-400">(مناسب للتعبئة: حبة / شدة / كرتون)</span></span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">المخزون يُحسب دائماً بالوحدة الأساسية (الحبة): «عدد القطع» في كل خيار هو كم حبة يخصم من المخزون عند بيعه.</p>
                </div>
              )}

              <div className="col-span-2 md:col-span-4 sticky bottom-0 -mx-6 px-6 py-4 mt-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 flex gap-3">
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  تطبيق التعديلات
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تحويل تعبئة إلى صنف مستقل */}
      {detach && (() => {
        const f = detach.unit.factor > 0 ? detach.unit.factor : 1;
        const avail = Math.max(0, Math.floor(((parseFloat(stock) || 0) + 1e-9) / f));
        const q = Math.max(0, parseFloat(detach.qty) || 0);
        const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500';
        const set = (k: keyof typeof detach) => (e: React.ChangeEvent<HTMLInputElement>) => setDetach({ ...detach, [k]: e.target.value });
        return (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" data-testid="detach-modal">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-lg rounded-2xl shadow-2xl p-5 text-right space-y-3 max-h-[92vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
                <span className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5"><Split className="w-4 h-4" />تحويل «{detach.unit.name}» إلى صنف مستقل</span>
                <button type="button" onClick={() => setDetach(null)} className="text-slate-500 hover:text-rose-600 cursor-pointer">✕</button>
              </div>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-500">اسم الصنف الجديد *</span><input value={detach.name} onChange={set('name')} className={inp} data-testid="detach-name" /></label>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-500">الاسم بالإنجليزي (اختياري)</span><input value={detach.nameEn} onChange={set('nameEn')} dir="ltr" className={inp} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1"><span className="text-xs font-bold text-slate-500">سعر البيع</span><input type="number" step="0.01" value={detach.price} onChange={set('price')} className={`${inp} font-mono text-center`} data-testid="detach-price" /></label>
                <label className="block space-y-1"><span className="text-xs font-bold text-slate-500">{costK === 1 ? 'التكلفة' : 'التكلفة (بدون ضريبة)'}</span><input type="number" step="any" value={detach.cost} onChange={set('cost')} className={`${inp} font-mono text-center`} /></label>
              </div>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-500">الباركود</span><input value={detach.barcode} onChange={(e) => setDetach({ ...detach, barcode: undoubleScan(e.target.value) })} dir="ltr" placeholder="فارغ = يُولَّد باركود جديد" className={`${inp} font-mono text-center`} data-testid="detach-barcode" /></label>
              {!editingProduct?.isService && (
                <div className="rounded-xl border-2 border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-950/20 p-3 space-y-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">كم «{detach.unit.name}» موجود فعلاً لديك؟ <span className="font-semibold text-slate-500">(يُنقل من رصيد الصنف الأصلي)</span></span>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="any" value={detach.qty} placeholder="0" onChange={set('qty')} className={`${inp.replace('w-full ', '')} font-mono text-center w-32`} data-testid="detach-qty" />
                      <button type="button" onClick={() => setDetach({ ...detach, qty: String(avail) })} className="text-xs font-bold text-indigo-700 dark:text-indigo-300 underline cursor-pointer whitespace-nowrap">الحد الأقصى المتاح: {avail}</button>
                    </div>
                  </label>
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    كل «{detach.unit.name}» = {f} حبة → يُخصم من «{nameAr.trim()}» <b className="font-mono">{+(q * f).toFixed(3)}</b> حبة (رصيده بعد التحويل: <b className="font-mono">{+((parseFloat(stock) || 0) - q * f).toFixed(3)}</b>) ويصبح رصيد الصنف الجديد <b className="font-mono">{q}</b>.
                  </p>
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">تُحذف هذه التعبئة من الصنف الأصلي ويُنشأ الصنف الجديد بنفس المجموعة. الفواتير والتقارير السابقة لا تتأثر.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={confirmDetach} data-testid="detach-confirm" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-sm cursor-pointer">تحويل</button>
                <button type="button" onClick={() => setDetach(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-sm cursor-pointer">إلغاء</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Add Group Modal (Nested inside Product Form) */}
      {showQuickAddGroupModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-sm rounded-2xl shadow-2xl p-5 text-right space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="font-black text-sm text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                <span>إضافة مجموعة أصناف سريعة</span>
              </span>
              <button 
                type="button"
                onClick={() => setShowQuickAddGroupModal(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddGroupSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم المجموعة (بالعربية) *</label>
                <input 
                  type="text" 
                  required
                  placeholder="اكتب اسم المجموعة"
                  value={quickGroupNameAr}
                  onChange={(e) => setQuickGroupNameAr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-400 font-bold"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">لون المجموعة</label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  {GROUP_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setQuickGroupColor(c.hex)}
                      className={`w-6 h-6 rounded-md cursor-pointer transition ${
                        quickGroupColor === c.hex ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إضافة واختيار
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAddGroupModal(false)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {barcodePrint && barcodeIds !== null && (
        <BarcodeLabelsDialog
          products={products}
          initialIds={barcodeIds}
          companyName={barcodePrint.companyName}
          taxRatePercent={barcodePrint.taxRatePercent}
          pricesIncludeTax={barcodePrint.pricesIncludeTax}
          printSettings={barcodePrint.printSettings}
          onChangePrintSettings={barcodePrint.onChangePrintSettings}
          onUpdateProduct={onUpdateProduct}
          onAddProduct={onAddProduct}
          groups={groups}
          notify={notify ?? (() => {})}
          onClose={() => { setBarcodeIds(null); (document.activeElement as HTMLElement | null)?.blur(); if (openBarcode) onBarcodeClose?.(); }}
        />
      )}
    </div>
  );
}
