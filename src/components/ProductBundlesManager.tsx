import React, { useState, useMemo } from 'react';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { 
  Boxes, Plus, Edit, Trash2, X, Check, Search, Package, Sparkles, 
  Tag, AlertCircle, ShoppingBag, ArrowRight, Percent, CheckCircle2
} from 'lucide-react';
import { Product, ProductGroup, BundleItem } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import ProductPicker from './ProductPicker';

interface ProductBundlesManagerProps {
  products: Product[];
  groups: ProductGroup[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (id: string, updated: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  getDeleteBlockReason?: (id: string) => string | null;
}

export default function ProductBundlesManager({
  products,
  groups,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  getDeleteBlockReason
}: ProductBundlesManagerProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [price, setPrice] = useState('');
  const [groupId, setGroupId] = useState(groups.find(g => g.nameAr.includes('باقات') || g.nameAr.includes('مجموعات'))?.id || groups[0]?.id || '');
  const [stock, setStock] = useState('50');
  const [barcode, setBarcode] = useState('');
  const [selectedBundleItems, setSelectedBundleItems] = useState<BundleItem[]>([]);

  // Item selector in form
  const [selectedProdToAdd, setSelectedProdToAdd] = useState('');
  const [itemQtyToAdd, setItemQtyToAdd] = useState('1');

  const bundleProducts = useMemo(() => products.filter(p => p.isBundle), [products]);
  const individualProducts = useMemo(() => products.filter(p => !p.isBundle), [products]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  // Calculate sum of individual components
  const calculateOriginalSum = (items: BundleItem[]) => {
    return items.reduce((sum, bi) => {
      const p = productById.get(bi.productId);
      return sum + ((p?.price || 0) * bi.qty);
    }, 0);
  };

  const calculateTotalCost = (items: BundleItem[]) => {
    return items.reduce((sum, bi) => {
      const p = productById.get(bi.productId);
      return sum + ((p?.cost || 0) * bi.qty);
    }, 0);
  };

  const handleOpenAdd = () => {
    setNameAr('');
    setNameEn('');
    setPrice('');
    setGroupId(''); // المجموعة اختيارية
    setStock('50');
    setBarcode('');
    setSelectedBundleItems([]);
    setSelectedProdToAdd(''); // يُختار بالبحث (قد تكون آلاف الأصناف)
    setItemQtyToAdd('1');
    setShowAddModal(true);
  };

  const handleOpenEdit = (bundle: Product) => {
    setEditingBundle(bundle);
    setNameAr(bundle.nameAr);
    setNameEn(bundle.nameEn && bundle.nameEn.trim() !== bundle.nameAr.trim() ? bundle.nameEn : '');
    setPrice(bundle.price.toString());
    setGroupId(bundle.groupId && groups.some(g => g.id === bundle.groupId) ? bundle.groupId : '');
    setStock(bundle.stock.toString());
    setBarcode(bundle.barcode);
    setSelectedBundleItems(bundle.bundleItems || []);
    setSelectedProdToAdd(''); // يُختار بالبحث (قد تكون آلاف الأصناف)
    setItemQtyToAdd('1');
  };

  const handleAddItemToBundle = () => {
    if (!selectedProdToAdd) return;
    const prod = products.find(p => p.id === selectedProdToAdd);
    if (!prod) return;
    const qty = parseInt(itemQtyToAdd) || 1;

    setSelectedBundleItems(prev => {
      const existing = prev.find(item => item.productId === prod.id);
      if (existing) {
        return prev.map(item => item.productId === prod.id ? { ...item, qty: item.qty + qty } : item);
      }
      return [...prev, { productId: prod.id, productName: prod.nameAr, qty }];
    });

    setItemQtyToAdd('1');
    setSelectedProdToAdd(''); // الحقل يتصفّر لإضافة مكوّن جديد
  };

  const handleRemoveItemFromBundle = (prodId: string) => {
    setSelectedBundleItems(prev => prev.filter(item => item.productId !== prodId));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim() || !price || selectedBundleItems.length === 0) return;

    const group = groups.find(g => g.id === groupId);
    const calculatedCost = calculateTotalCost(selectedBundleItems);

    const newBundle: Product = {
      id: `bundle-${Date.now()}`,
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      price: parseFloat(price),
      cost: calculatedCost,
      categoryAr: group ? group.nameAr : 'باقات ومجموعات التوفير',
      categoryEn: group?.nameEn || 'Value Bundles',
      groupId: group?.id,
      stock: parseInt(stock) || 0,
      minStock: 10,
      barcode: barcode || Math.floor(Math.random() * 900000 + 100000).toString(),
      isBundle: true,
      bundleItems: selectedBundleItems
    };

    onAddProduct(newBundle);
    setShowAddModal(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBundle || !nameAr.trim() || !price || selectedBundleItems.length === 0) return;

    const group = groups.find(g => g.id === groupId);
    const calculatedCost = calculateTotalCost(selectedBundleItems);

    onUpdateProduct(editingBundle.id, {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      price: parseFloat(price),
      cost: calculatedCost,
      categoryAr: group ? group.nameAr : 'باقات ومجموعات التوفير',
      categoryEn: group?.nameEn || 'Value Bundles',
      groupId: group?.id,
      stock: parseInt(stock) || 0,
      barcode: barcode,
      isBundle: true,
      bundleItems: selectedBundleItems
    });

    setEditingBundle(null);
  };

  const filteredBundles = bundleProducts.filter(b => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return b.nameAr.toLowerCase().includes(q) || 
           (b.nameEn && b.nameEn.toLowerCase().includes(q)) || 
           b.barcode.includes(q);
  });

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full space-y-6" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>الباقات والعروض التجميعية (Combo Sets & Bundles)</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                {bundleProducts.length} باقة
              </span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
              تجميع أصناف متعددة معاً كوجبة كومبو أو بكج توفيري بسعر خاص وموحد.
            </p>
          </div>
        </div>

        <button 
          onClick={handleOpenAdd}
          className="px-5 py-2.5 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 transition shadow-lg shadow-purple-600/20 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء باقة تجميعية جديدة</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 bg-white/60 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <input 
            type="text" 
            placeholder="بحث في الباقات التجميعية بالاسم أو الباركود..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-bold"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
        </div>
      </div>

      {/* Bundles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBundles.map(bundle => {
          const originalSum = calculateOriginalSum(bundle.bundleItems || []);
          const savings = Math.max(0, originalSum - bundle.price);
          const savingsPercent = originalSum > 0 ? Math.round((savings / originalSum) * 100) : 0;

          return (
            <div 
              key={bundle.id}
              className={`${bundle.disabled ? 'opacity-60 ' : ''}bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-purple-500/40 rounded-2xl p-5 shadow-xl transition-all relative overflow-hidden flex flex-col justify-between group`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight">{bundle.nameAr}{bundle.disabled && <span className="mr-2 align-middle text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400" data-testid="bundle-stopped">موقوفة</span>}</h3>
                      <p className="text-xs text-slate-500 font-mono">{bundle.nameEn}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onUpdateProduct(bundle.id, { disabled: !bundle.disabled })}
                      className={`px-2 py-1 rounded-lg text-[11px] font-black border transition cursor-pointer ${bundle.disabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20'}`}
                      title={bundle.disabled ? 'إعادة الباقة للبيع' : 'إيقاف الباقة عن البيع (تختفي من شاشة البيع وتبقى في الفواتير السابقة)'}
                      data-testid="bundle-toggle"
                    >
                      {bundle.disabled ? 'تفعيل' : 'إيقاف'}
                    </button>
                    <button 
                      onClick={() => handleOpenEdit(bundle)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition cursor-pointer"
                      title="تعديل الباقة"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        const blocked = getDeleteBlockReason?.(bundle.id);
                        if (blocked) { alert(`${blocked}\n\nلا يمكن حذفها حفاظاً على سجل الفواتير — استخدم زر «إيقاف» لإخفائها من شاشة البيع.`); return; }
                        if (confirm(`هل أنت متأكد من حذف باقة "${bundle.nameAr}"؟`)) {
                          onDeleteProduct(bundle.id);
                        }
                      }}
                      className="p-1.5 hover:bg-rose-950/40 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer"
                      title="حذف الباقة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Price and Savings Tag */}
                <div className="flex items-center justify-between my-3 p-3 bg-slate-50/80 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">سعر الباقة المجمعة:</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-lg inline-flex items-center gap-1">
                      {bundle.price.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  </div>

                  {savings > 0 && (
                    <div className="text-left bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 rounded-xl">
                      <span className="text-[10px] text-purple-700 dark:text-purple-300 font-bold block">توفير للعميل</span>
                      <span className="font-mono font-black text-purple-600 dark:text-purple-400 text-xs">
                        {savings.toFixed(2)} ﷼ ({savingsPercent}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Bundle Items Breakdown */}
                <div className="space-y-1.5 mb-3">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold block">مكونات المجموعة:</span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {bundle.bundleItems?.map((bi, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800/70"
                      >
                        <span className="text-slate-600 dark:text-slate-300 font-medium truncate">{bi.productName}</span>
                        <span className="font-mono font-black text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">
                          × {bi.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono">الباركود: {bundle.barcode}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  المخزون: {bundle.stock}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredBundles.length === 0 && (
        <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-white/40 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
          <Boxes className="w-12 h-12 text-slate-500 mb-3" />
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">لا توجد باقات تجميعية مسجلة</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm mb-4">
            يمكنك إنشاء باقة تتكون من مجموعة أصناف (مثل: برجر + بطاطس + عصير) وتقديمها بسعر كومبو مميز.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء أول باقة تجميعية</span>
          </button>
        </div>
      )}

      {/* Modal: Add/Edit Bundle */}
      {(showAddModal || editingBundle) && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Boxes className="w-4 h-4" />
                </div>
                <span className="font-black text-base text-slate-900 dark:text-white">
                  {editingBundle ? `تعديل الباقة: ${editingBundle.nameAr}` : 'إنشاء باقة تجميعية جديدة'}
                </span>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setEditingBundle(null); }}
                className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingBundle ? handleEditSubmit : handleAddSubmit} className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Bundle Names */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم الباقة (بالعربية) *</label>
                  <input autoFocus
                    type="text" 
                    required
                    placeholder="اكتب اسم الباقة"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-bold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الاسم (بالإنجليزي)</label>
                  <input 
                    type="text" 
                    placeholder="Example: Family Combo Bundle"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-bold text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Group selection */}
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">مجموعة الصنف <span className="font-normal text-slate-400">(اختياري)</span></label>
                <select 
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-bold cursor-pointer"
                >
                  <option value="">— بدون مجموعة —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.nameAr}</option>
                  ))}
                </select>
              </div>

              {/* Adding Items to the bundle */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-black text-purple-600 dark:text-purple-400 block">اختيار وتحديد مكونات الباقة:</span>
                
                <div className="flex gap-2">
                  <ProductPicker
                    className="flex-1"
                    products={individualProducts}
                    value={selectedProdToAdd}
                    onChange={setSelectedProdToAdd}
                    label={(p) => `${p.nameAr} (${(p.price || 0).toFixed(2)} ﷼)`}
                  />

                  <input 
                    type="number"
                    min="1"
                    value={itemQtyToAdd}
                    onChange={(e) => setItemQtyToAdd(e.target.value)}
                    className="w-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-mono font-bold text-center"
                    placeholder="الكمية"
                  />

                  <button 
                    type="button"
                    onClick={handleAddItemToBundle}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    + إضافة
                  </button>
                </div>

                {/* List of currently selected items */}
                {selectedBundleItems.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {selectedBundleItems.map((bi) => {
                      const prod = productById.get(bi.productId);
                      const itemTotal = (prod?.price || 0) * bi.qty;

                      return (
                        <div key={bi.productId} className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">{bi.productName}</span>
                            <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] mr-2">
                              ({prod?.price.toFixed(2)} ﷼ × {bi.qty} = {itemTotal.toFixed(2)} ﷼)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-purple-600 dark:text-purple-400">×{bi.qty}</span>
                            <button 
                              type="button"
                              onClick={() => handleRemoveItemFromBundle(bi.productId)}
                              className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Calculated original sum and cost */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        مجموع الأسعار الفردية: <strong className="text-slate-900 dark:text-white font-mono">{calculateOriginalSum(selectedBundleItems).toFixed(2)} ﷼</strong>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        إجمالي تكلفة المكونات: <strong className="text-slate-600 dark:text-slate-300 font-mono">{calculateTotalCost(selectedBundleItems).toFixed(2)} ﷼</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">⚠️ يرجى إضافة صنف واحد على الأقل لمكونات الباقة.</p>
                )}
              </div>

              {/* Price, Stock, Barcode */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">سعر الباقة النهائي *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-purple-500/50 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-400 font-mono font-black"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">المخزون الأولي</label>
                  <input 
                    type="number" 
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الباركود</label>
                  <input 
                    type="text" 
                    placeholder="تلقائي إذا تُرك فارغاً"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={latinBarcodeKeyDown}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <button 
                  type="submit"
                  disabled={selectedBundleItems.length === 0}
                  className="flex-1 py-2.5 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-md shadow-purple-600/20 disabled:opacity-40"
                >
                  {editingBundle ? 'حفظ تعديلات الباقة' : 'إنشاء وحفظ الباقة'}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowAddModal(false); setEditingBundle(null); }}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs transition border border-slate-300 dark:border-slate-700 cursor-pointer"
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
