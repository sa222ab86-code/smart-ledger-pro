import React, { useState, useMemo } from 'react';
import { 
  Layers, Plus, Edit, Trash2, X, Check, Search, Package, Sparkles, 
  Coffee, Utensils, Flame, Boxes, AlertCircle, AlertTriangle, Tag, 
  Printer, ArrowRightLeft, FolderTree, Info, Eye, CheckCircle2
} from 'lucide-react';
import { Product, ProductGroup, AppPrinter } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

interface ProductGroupsManagerProps {
  groups: ProductGroup[];
  products: Product[];
  printers?: AppPrinter[];
  onAddGroup: (group: ProductGroup) => void;
  onUpdateGroup: (id: string, updated: Partial<ProductGroup>) => void;
  onDeleteGroup: (id: string, reassignGroupId?: string) => void;
  onSelectGroupFilter?: (groupName: string) => void;
}

// Available vibrant color themes for groups
export const GROUP_COLOR_OPTIONS = [
  { name: 'سماوي / Cyan', hex: '#06b6d4', bgClass: 'bg-cyan-500', textClass: 'text-cyan-600 dark:text-cyan-400', borderClass: 'border-cyan-500' },
  { name: 'ذهبي / Amber', hex: '#f59e0b', bgClass: 'bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400', borderClass: 'border-amber-500' },
  { name: 'أحمر / Rose', hex: '#ef4444', bgClass: 'bg-rose-500', textClass: 'text-rose-600 dark:text-rose-400', borderClass: 'border-rose-500' },
  { name: 'زمردي / Emerald', hex: '#10b981', bgClass: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400', borderClass: 'border-emerald-500' },
  { name: 'بنفسجي / Purple', hex: '#8b5cf6', bgClass: 'bg-purple-500', textClass: 'text-purple-600 dark:text-purple-400', borderClass: 'border-purple-500' },
  { name: 'أزرق / Blue', hex: '#3b82f6', bgClass: 'bg-blue-500', textClass: 'text-blue-600 dark:text-blue-400', borderClass: 'border-blue-500' },
  { name: 'وردي / Pink', hex: '#ec4899', bgClass: 'bg-pink-500', textClass: 'text-pink-600 dark:text-pink-400', borderClass: 'border-pink-500' },
  { name: 'برتقالي / Orange', hex: '#f97316', bgClass: 'bg-orange-500', textClass: 'text-orange-600 dark:text-orange-400', borderClass: 'border-orange-500' },
  { name: 'نيلي / Indigo', hex: '#6366f1', bgClass: 'bg-indigo-500', textClass: 'text-indigo-600 dark:text-indigo-400', borderClass: 'border-indigo-500' },
  { name: 'فحمي / Slate', hex: '#64748b', bgClass: 'bg-slate-500', textClass: 'text-slate-500 dark:text-slate-400', borderClass: 'border-slate-500' },
  { name: 'أخضر / Green', hex: '#16a34a', bgClass: '', textClass: '', borderClass: '' },
  { name: 'فيروزي / Teal', hex: '#0d9488', bgClass: '', textClass: '', borderClass: '' },
  { name: 'أزرق سماوي / Sky', hex: '#0ea5e9', bgClass: '', textClass: '', borderClass: '' },
  { name: 'كحلي / Navy', hex: '#1e3a8a', bgClass: '', textClass: '', borderClass: '' },
  { name: 'أصفر / Yellow', hex: '#eab308', bgClass: '', textClass: '', borderClass: '' },
  { name: 'ليموني / Lime', hex: '#84cc16', bgClass: '', textClass: '', borderClass: '' },
  { name: 'زيتي / Olive', hex: '#4d7c0f', bgClass: '', textClass: '', borderClass: '' },
  { name: 'أخضر غامق / Forest', hex: '#166534', bgClass: '', textClass: '', borderClass: '' },
  { name: 'أحمر قاني / Crimson', hex: '#b91c1c', bgClass: '', textClass: '', borderClass: '' },
  { name: 'عنابي / Burgundy', hex: '#881337', bgClass: '', textClass: '', borderClass: '' },
  { name: 'فوشي / Fuchsia', hex: '#d946ef', bgClass: '', textClass: '', borderClass: '' },
  { name: 'بنفسجي غامق / Violet', hex: '#6d28d9', bgClass: '', textClass: '', borderClass: '' },
  { name: 'بني / Brown', hex: '#92400e', bgClass: '', textClass: '', borderClass: '' },
  { name: 'خردلي / Mustard', hex: '#a16207', bgClass: '', textClass: '', borderClass: '' },
  { name: 'مرجاني / Coral', hex: '#fb7185', bgClass: '', textClass: '', borderClass: '' },
  { name: 'بيج / Tan', hex: '#c8a27a', bgClass: '', textClass: '', borderClass: '' },
  { name: 'رمادي / Gray', hex: '#9ca3af', bgClass: '', textClass: '', borderClass: '' },
  { name: 'أسود / Black', hex: '#1f2937', bgClass: '', textClass: '', borderClass: '' },
];

export const GROUP_ICON_OPTIONS = [
  { id: 'Coffee', label: 'مشروبات', icon: <Coffee className="w-4 h-4" /> },
  { id: 'Utensils', label: 'وجبات', icon: <Utensils className="w-4 h-4" /> },
  { id: 'Flame', label: 'مقبلات / ساخن', icon: <Flame className="w-4 h-4" /> },
  { id: 'Boxes', label: 'باقات وتوفير', icon: <Boxes className="w-4 h-4" /> },
  { id: 'Package', label: 'صندوق / عام', icon: <Package className="w-4 h-4" /> },
  { id: 'Tag', label: 'وسم / قسم', icon: <Tag className="w-4 h-4" /> },
  { id: 'Sparkles', label: 'مميز / عروض', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'Layers', label: 'مجموعة', icon: <Layers className="w-4 h-4" /> },
];

export default function ProductGroupsManager({
  groups,
  products,
  printers = [],
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onSelectGroupFilter
}: ProductGroupsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<ProductGroup | null>(null);
  const [reassignTargetGroupId, setReassignTargetGroupId] = useState<string>('');
  const [viewingGroupDetails, setViewingGroupDetails] = useState<ProductGroup | null>(null);

  // Form fields
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [color, setColor] = useState('#06b6d4');
  const [icon, setIcon] = useState('Layers');
  const [description, setDescription] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);

  // Calculate statistics per group — مرة واحدة لكل تغيير في الأصناف (لا مع كل حرف في النموذج)
  const { groupStats, totalCategorizedProducts, totalStockAll } = useMemo(() => {
    const stats = groups.map(g => ({
      group: g,
      totalItems: 0,
      totalStock: 0,
      totalInventoryCost: 0,
      totalInventoryValue: 0,
      outOfStockCount: 0,
      lowStockCount: 0,
    }));
    const byId = new Map<string, number[]>();
    const byName = new Map<string, number[]>();
    groups.forEach((g, i) => {
      if (!byId.has(g.id)) byId.set(g.id, []);
      byId.get(g.id)!.push(i);
      if (!byName.has(g.nameAr)) byName.set(g.nameAr, []);
      byName.get(g.nameAr)!.push(i);
    });
    let categorized = 0;
    let stockAll = 0;
    for (const p of products) {
      const stock = p.stock || 0;
      stockAll += stock;
      const hits = new Set<number>([...(p.groupId ? byId.get(p.groupId) || [] : []), ...(byName.get(p.categoryAr) || [])]);
      if (hits.size) categorized++;
      for (const i of hits) {
        const st = stats[i];
        st.totalItems++;
        st.totalStock += stock;
        st.totalInventoryCost += (p.cost || 0) * stock;
        st.totalInventoryValue += (p.price || 0) * stock;
        const min = p.minStock !== undefined ? p.minStock : 10;
        if (stock <= 0) st.outOfStockCount++;
        else if (stock <= min) st.lowStockCount++;
      }
    }
    return { groupStats: stats, totalCategorizedProducts: categorized, totalStockAll: stockAll };
  }, [groups, products]);

  const totalGroupsCount = groups.length;
  const uncategorizedProductsCount = products.length - totalCategorizedProducts;

  const filteredStats = groupStats.filter(stat => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return stat.group.nameAr.toLowerCase().includes(q) || 
           (stat.group.nameEn && stat.group.nameEn.toLowerCase().includes(q)) ||
           (stat.group.description && stat.group.description.toLowerCase().includes(q));
  });

  const handleOpenAdd = () => {
    setNameAr('');
    setNameEn('');
    setColor(GROUP_COLOR_OPTIONS[groups.length % GROUP_COLOR_OPTIONS.length].hex);
    setIcon('Layers');
    setDescription('');
    setPrinterId('');
    setDisplayOrder((groups.length + 1).toString());
    setIsActive(true);
    setShowAddModal(true);
  };

  const handleOpenEdit = (group: ProductGroup) => {
    setEditingGroup(group);
    setNameAr(group.nameAr);
    setNameEn(group.nameEn || '');
    setColor(group.color || '#06b6d4');
    setIcon(group.icon || 'Layers');
    setDescription(group.description || '');
    setPrinterId(group.printerId || '');
    setDisplayOrder((group.displayOrder ?? 1).toString());
    setIsActive(group.isActive ?? true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) return;

    const newGroup: ProductGroup = {
      id: `grp-${Date.now()}`,
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || undefined,
      color,
      icon,
      description: description.trim() || undefined,
      printerId: printerId || undefined,
      displayOrder: parseInt(displayOrder) || 1,
      isActive
    };

    onAddGroup(newGroup);
    setShowAddModal(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !nameAr.trim()) return;

    onUpdateGroup(editingGroup.id, {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || undefined,
      color,
      icon,
      description: description.trim() || undefined,
      printerId: printerId || undefined,
      displayOrder: parseInt(displayOrder) || 1,
      isActive
    });

    setEditingGroup(null);
  };

  const confirmDelete = () => {
    if (!deletingGroup) return;
    onDeleteGroup(deletingGroup.id, reassignTargetGroupId || undefined);
    setDeletingGroup(null);
    setReassignTargetGroupId('');
  };

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Coffee': return <Coffee className="w-5 h-5" />;
      case 'Utensils': return <Utensils className="w-5 h-5" />;
      case 'Flame': return <Flame className="w-5 h-5" />;
      case 'Boxes': return <Boxes className="w-5 h-5" />;
      case 'Package': return <Package className="w-5 h-5" />;
      case 'Tag': return <Tag className="w-5 h-5" />;
      case 'Sparkles': return <Sparkles className="w-5 h-5" />;
      default: return <Layers className="w-5 h-5" />;
    }
  };

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full space-y-6" dir="rtl">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>نظام مجموعات وتصنيفات الأصناف</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  {totalGroupsCount} مجموعات
                </span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
                تنظيم وتصنيف الأصناف في مجموعات، تعيين ألوان وأيقونات التمييز، وتوجيه طابعات الأقسام والمطابخ.
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={handleOpenAdd}
          className="px-5 py-2.5 bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 transition shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مجموعة جديدة</span>
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">إجمالي المجموعات</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white">{totalGroupsCount}</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">الأصناف المصنفة</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">{totalCategorizedProducts}</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">إجمالي كمية المخزون</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
              {totalStockAll}
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
          <span className="text-slate-500 dark:text-slate-400 text-xs font-bold block mb-1">أصناف غير مصنفة</span>
          <div className="flex items-center justify-between">
            <span className={`text-2xl sm:text-3xl font-black font-mono ${uncategorizedProductsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {uncategorizedProductsCount}
            </span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white/60 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 w-full sm:max-w-md">
          <input 
            type="text" 
            placeholder="بحث في المجموعات بالاسم أو الوصف..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          يتم ربط كل مجموعة بطابعة محددة (مثل طابعة المطبخ) لتوجيه تذاكر الطلبات آلياً عند البيع.
        </div>
      </div>

      {/* Groups Grid / Cards View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStats.map(({ group, totalItems, totalStock, totalInventoryCost, totalInventoryValue, outOfStockCount, lowStockCount }) => {
          const printer = printers.find(p => p.id === group.printerId);
          const groupColor = group.color || '#06b6d4';

          return (
            <div 
              key={group.id}
              className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all relative overflow-hidden flex flex-col justify-between group"
            >
              {/* Color Bar Accent on Top */}
              <div 
                className="absolute top-0 right-0 left-0 h-1.5 transition-all group-hover:h-2"
                style={{ backgroundColor: groupColor }}
              />

              <div>
                {/* Header: Icon, Names, Status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-900 dark:text-white font-bold shadow-md"
                      style={{ backgroundColor: groupColor }}
                    >
                      {renderIcon(group.icon)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight">{group.nameAr}</h3>
                        {group.isActive === false && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            معطلة
                          </span>
                        )}
                      </div>
                      {group.nameEn && (
                        <p className="text-xs text-slate-500 font-mono font-medium">{group.nameEn}</p>
                      )}
                    </div>
                  </div>

                  {/* Action Icons */}
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleOpenEdit(group)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-lg transition border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
                      title="تعديل بيانات المجموعة"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setDeletingGroup(group);
                        const otherGroups = groups.filter(g => g.id !== group.id);
                        setReassignTargetGroupId(otherGroups[0]?.id || '');
                      }}
                      className="p-1.5 hover:bg-rose-950/40 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition border border-transparent hover:border-rose-900/40 cursor-pointer"
                      title="حذف المجموعة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description if present */}
                {group.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed bg-slate-50/50 dark:bg-slate-950/50 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                    {group.description}
                  </p>
                )}

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-2 gap-2 my-3 p-3 bg-slate-50/80 dark:bg-slate-950/80 rounded-xl border border-slate-200/80 dark:border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">عدد الأصناف:</span>
                    <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                      {totalItems} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">صنف</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">رصيد المخزون:</span>
                    <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                      {totalStock} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">قطعة</span>
                    </span>
                  </div>

                  <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">قيمة المخزون (سعر البيع):</span>
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-xs inline-flex items-center gap-1">
                      {totalInventoryValue.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" />
                    </span>
                  </div>

                  <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">تكلفة البضاعة:</span>
                    <span className="font-mono font-bold text-slate-600 dark:text-slate-300 text-xs inline-flex items-center gap-1">
                      {totalInventoryCost.toFixed(2)} <SaudiRiyalSymbol className="w-2.5 h-2.5 text-slate-500 dark:text-slate-400" />
                    </span>
                  </div>
                </div>

                {/* Stock Warning Pills if low or out */}
                {(outOfStockCount > 0 || lowStockCount > 0) && (
                  <div className="flex items-center gap-2 mb-3 text-[11px]">
                    {lowStockCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{lowStockCount} منخفض</span>
                      </span>
                    )}
                    {outOfStockCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{outOfStockCount} نافد</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer: Printer & Filter Button */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium overflow-hidden">
                  <Printer className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span className="truncate text-[11px]">
                    {printer ? printer.name : 'طابعة الكاشير الافتراضية'}
                  </span>
                </div>

                {onSelectGroupFilter && (
                  <button
                    onClick={() => onSelectGroupFilter(group.nameAr)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-slate-300 dark:border-slate-700"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>عرض الأصناف</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredStats.length === 0 && (
        <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-white/40 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
          <Layers className="w-12 h-12 text-slate-500 mb-3" />
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">لا توجد مجموعات مطابقة للبحث</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm mb-4">
            لم يتم العثور على أية مجموعات أصناف مطابقة لكلمات البحث المدخلة. يمكنك إضافة مجموعة جديدة الآن.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مجموعة الآن</span>
          </button>
        </div>
      )}

      {/* Modal: Add New Group */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="font-black text-base text-slate-900 dark:text-white">إضافة مجموعة أصناف جديدة</span>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم المجموعة (بالعربية) *</label>
                  <input autoFocus
                    type="text" 
                    required
                    placeholder="اكتب اسم المجموعة"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الاسم (بالإنجليزي)</label>
                  <input 
                    type="text" 
                    placeholder="Example: Hot Drinks"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Color Theme Selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اللون التمييزي للمجموعة</label>
                <div className="flex flex-wrap gap-2 p-2 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  {GROUP_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center cursor-pointer ${
                        color === c.hex ? 'ring-2 ring-white scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {color === c.hex && <Check className="w-4 h-4 text-slate-900 dark:text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">أيقونة المجموعة</label>
                <div className="grid grid-cols-4 gap-2">
                  {GROUP_ICON_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIcon(item.id)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        icon === item.id 
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300' 
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Routing Printer */}
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>طابعة التجهيز المباشرة (مثل طابعة المطبخ / البار)</span>
                </label>
                <select 
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold cursor-pointer"
                >
                  <option value="">طابعة الكاشير الافتراضية</option>
                  {printers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.osPrinterName}) - {p.type === 'kitchen' ? 'طابعة مطبخ' : 'طابعة إيصالات'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الوصف وملاحظات المجموعة</label>
                <textarea 
                  rows={2}
                  placeholder="وصف مختصر للأصناف المندرجة تحت هذه المجموعة..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  حفظ المجموعة
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Existing Group */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <span className="font-black text-base text-slate-900 dark:text-white">تعديل مجموعة: {editingGroup.nameAr}</span>
              </div>
              <button 
                onClick={() => setEditingGroup(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اسم المجموعة (بالعربية) *</label>
                  <input autoFocus
                    type="text" 
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الاسم (بالإنجليزي)</label>
                  <input 
                    type="text" 
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Color Theme Selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">اللون التمييزي للمجموعة</label>
                <div className="flex flex-wrap gap-2 p-2 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                  {GROUP_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center cursor-pointer ${
                        color === c.hex ? 'ring-2 ring-white scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {color === c.hex && <Check className="w-4 h-4 text-slate-900 dark:text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">أيقونة المجموعة</label>
                <div className="grid grid-cols-4 gap-2">
                  {GROUP_ICON_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIcon(item.id)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        icon === item.id 
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' 
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Routing Printer */}
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>طابعة التجهيز المباشرة (مثل طابعة المطبخ / البار)</span>
                </label>
                <select 
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-bold cursor-pointer"
                >
                  <option value="">طابعة الكاشير الافتراضية</option>
                  {printers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.osPrinterName}) - {p.type === 'kitchen' ? 'طابعة مطبخ' : 'طابعة إيصالات'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">الوصف وملاحظات المجموعة</label>
                <textarea 
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-bold resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  حفظ التعديلات
                </button>
                <button 
                  type="button" 
                  onClick={() => setEditingGroup(null)}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Group with Reassignment Option */}
      {deletingGroup && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-rose-900/50 text-slate-700 dark:text-slate-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-right">
            <div className="bg-rose-950/40 p-4 border-b border-rose-900/40 flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="font-black text-sm">تأكيد حذف المجموعة ({deletingGroup.nameAr})</span>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {(() => {
                const affectedCount = products.filter(p => p.groupId === deletingGroup.id || p.categoryAr === deletingGroup.nameAr).length;
                const otherGroups = groups.filter(g => g.id !== deletingGroup.id);

                return (
                  <>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      أنت على وشك حذف مجموعة <strong className="text-slate-900 dark:text-white">"{deletingGroup.nameAr}"</strong> نهائياً من النظام.
                    </p>

                    {affectedCount > 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                        <p className="text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>يوجد حالياً ({affectedCount}) صنف مسجل ضمن هذه المجموعة!</span>
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                          يمكنك اختيار مجموعة بديلة لنقل هذه الأصناف إليها تلقائياً:
                        </p>
                        <select
                          value={reassignTargetGroupId}
                          onChange={(e) => setReassignTargetGroupId(e.target.value)}
                          className="w-full bg-white dark:bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 font-bold cursor-pointer"
                        >
                          <option value="">بدون مجموعة (عام / غير مصنف)</option>
                          {otherGroups.map(og => (
                            <option key={og.id} value={og.id}>
                              نقل إلى: {og.nameAr}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400">
                        لا توجد أصناف مرتبطة بهذه المجموعة حالياً، يمكن حذفها بأمان.
                      </p>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={confirmDelete}
                        className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition cursor-pointer shadow-md shadow-rose-600/20"
                      >
                        نعم، احذف المجموعة
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingGroup(null)}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold transition border border-slate-300 dark:border-slate-700 cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
