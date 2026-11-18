import React from 'react';
import type { AppUser } from '../types';
import { ROLE_LABELS } from '../utils/auth';
import {
  ShoppingBag, Receipt, Building2, Package, Users, LogOut, LayoutDashboard,
  BarChart3, LockKeyhole, Truck, FileBox, Printer, Palette, UserCog,
  Settings, Globe, Boxes, Layers, FileText, ShieldCheck, DatabaseBackup, Info, ChevronsRight, ChevronsLeft, Undo2, KeyRound, MonitorSmartphone,
  TrendingUp, ScanBarcode, Network, BadgePercent, Wallet, Coins, Calculator,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onLogout: () => void;
  /** إخفاء الشاشات التي لا يملك المستخدم صلاحيتها */
  isAllowed?: (view: string) => boolean;
  user?: AppUser | null;
  /** طي القائمة: أيقونات فقط */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** القائمة المنبثقة من شاشة البيع: زر في نفس المكان يغلقها (حتى يبقى الزر ثابتاً في كل الشاشات) */
  onClose?: () => void;
  /** اتجاه الواجهة (الإنجليزية: من اليسار) */
  dir?: 'rtl' | 'ltr';
}

export default function Sidebar({ dir = 'rtl', currentView, onViewChange, onLogout, isAllowed, user, collapsed = false, onToggleCollapsed, onClose }: SidebarProps) {
  // تجميع عناصر القائمة مع تصنيفات (مجموعات) لتسهيل التنقل
  // القائمة مرتّبة حسب دورة العمل: البيع ← المشتريات ← الأصناف والمخزون ← التقارير ← الإدارة والإعدادات
  const menuGroups = [
    {
      label: 'المبيعات',
      items: [
        { id: 'pos', label: 'شاشة البيع', icon: <ShoppingBag className="w-5 h-5" /> },
        { id: 'stats', label: 'الملخص', icon: <TrendingUp className="w-5 h-5" /> },
        { id: 'invoices', label: 'سجل المبيعات والمرتجعات', icon: <Receipt className="w-5 h-5" /> },
        { id: 'creditInvoices', label: 'الفواتير الآجلة', icon: <Wallet className="w-5 h-5" /> },
        { id: 'quotations', label: 'عروض الأسعار', icon: <FileText className="w-5 h-5" /> },
        { id: 'customers', label: 'العملاء', icon: <Users className="w-5 h-5" /> },
      ],
    },
    {
      label: 'المشتريات',
      items: [
        { id: 'purchases', label: 'فواتير المشتريات', icon: <FileBox className="w-5 h-5" /> },
        { id: 'purchaseReturns', label: 'مرتجع المشتريات', icon: <Undo2 className="w-5 h-5" /> },
        { id: 'suppliers', label: 'الموردين', icon: <Truck className="w-5 h-5" /> },
      ],
    },
    {
      label: 'الأصناف والمخزون',
      items: [
        { id: 'products', label: 'الأصناف', icon: <Package className="w-5 h-5" /> },
        { id: 'productGroups', label: 'مجموعات الأصناف', icon: <Layers className="w-5 h-5" /> },
        { id: 'promotions', label: 'العروض والتخفيضات', icon: <BadgePercent className="w-5 h-5" /> },
        { id: 'barcodeLabels', label: 'طباعة الباركود', icon: <ScanBarcode className="w-5 h-5" /> },
        { id: 'inventory', label: 'المخزون والجرد', icon: <Boxes className="w-5 h-5" /> },
      ],
    },
    {
      label: 'التقارير والمحاسبة',
      items: [
        { id: 'cashBox', label: 'الصندوق', icon: <Coins className="w-5 h-5" /> },
        { id: 'dailyReports', label: 'التقارير', icon: <BarChart3 className="w-5 h-5" /> },
        { id: 'dailyClosing', label: 'الإقفال اليومي', icon: <LockKeyhole className="w-5 h-5" /> },
        { id: 'accounting', label: 'المحاسبة والقوائم المالية', icon: <Calculator className="w-5 h-5" /> },
      ],
    },
    {
      label: 'الإدارة والإعدادات',
      items: [
        { id: 'settings', label: 'إعدادات المنشأة', icon: <Building2 className="w-5 h-5" /> },
        { id: 'einvoice', label: 'الفاتورة الإلكترونية', icon: <ShieldCheck className="w-5 h-5" /> },
        { id: 'users', label: 'المستخدمين والصلاحيات', icon: <UserCog className="w-5 h-5" /> },
        { id: 'printers', label: 'الطابعات ودرج النقود', icon: <Printer className="w-5 h-5" /> },
        { id: 'devices', label: 'شاشة العميل والميزان', icon: <MonitorSmartphone className="w-5 h-5" /> },
        { id: 'network', label: 'ربط الأجهزة', icon: <Network className="w-5 h-5" /> },
        { id: 'branches', label: 'ربط الفروع عن بعد', icon: <Globe className="w-5 h-5" /> },
        { id: 'appSettings', label: 'إعدادات التطبيق', icon: <Palette className="w-5 h-5" /> },
        { id: 'backup', label: 'النسخ الاحتياطي والأرشيف', icon: <DatabaseBackup className="w-5 h-5" /> },
        { id: 'license', label: 'الترخيص والتفعيل', icon: <KeyRound className="w-5 h-5" /> },
        { id: 'about', label: 'حول البرنامج', icon: <Info className="w-5 h-5" /> },
      ],
    },
  ];

  const groups = menuGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !isAllowed || isAllowed(it.id)) }))
    .filter((g) => g.items.length > 0);

  return (
    // h-full + overflow-hidden + min-h-0 على منطقة التمرير: القائمة لا تتجاوز ارتفاع الشاشة أبداً
    // (كانت تتجاوزه في وضع اللمس بسبب الخط الأكبر، فيُزاح المحتوى للأعلى ويختفي زر الطي)
    <aside className={`side-rail ${collapsed ? 'w-[4.5rem]' : 'w-56 2xl:w-64'} transition-[width] duration-200 flex flex-col h-full min-h-0 overflow-hidden select-none shrink-0`} dir={dir} data-testid="sidebar" data-collapsed={collapsed || undefined}>
      {!onToggleCollapsed && onClose && (
        <button type="button" onClick={onClose} title="إغلاق القائمة" data-testid="sidebar-toggle"
          className="side-toggle shrink-0 mx-2 mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black justify-start">
          <ChevronsRight className="w-4 h-4" /><span>إغلاق القائمة</span>
        </button>
      )}
      {onToggleCollapsed && (
        <button type="button" onClick={onToggleCollapsed} title={collapsed ? 'توسيع القائمة' : 'طي القائمة (أيقونات فقط)'} data-testid="sidebar-toggle"
          className={`side-toggle shrink-0 mx-2 mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${collapsed ? 'justify-center' : 'justify-start'}`}>
          {collapsed ? <ChevronsLeft className="w-4 h-4" /> : <><ChevronsRight className="w-4 h-4" /><span>طي القائمة</span></>}
        </button>
      )}
      <nav className={`${collapsed ? 'px-2' : 'px-3'} py-3 flex-1 min-h-0 overflow-y-auto space-y-3`}>
        {groups.map((group, idx) => (
          <div key={idx}>
            {!collapsed ? <div className="side-group-label text-[11px] font-bold mb-1.5 pr-3">{group.label}</div> : idx > 0 ? <div className="side-sep mx-2 my-2" /> : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onViewChange(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`side-item relative w-full text-right ${collapsed ? 'justify-center px-0' : 'px-3'} py-2.5 rounded-xl font-bold text-[13.5px] leading-snug flex items-center gap-3 transition-colors cursor-pointer ${isActive ? 'is-active' : ''}`}
                  >
                    {isActive && <span aria-hidden className="side-active-bar absolute right-0 top-2 bottom-2 w-1 rounded-l" />}
                    <span className="side-icon shrink-0">{item.icon}</span>
                    {/* الأسماء الطويلة تنطوي على سطرين بدل قصّها */}
                    {!collapsed && <span className="side-label flex-1 min-w-0 whitespace-normal break-words text-right">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={`side-foot shrink-0 ${collapsed ? 'p-2' : 'p-3'} space-y-2`}>
        {user && !collapsed && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="side-avatar w-9 h-9 rounded-xl font-black flex items-center justify-center shrink-0">{(user.fullName || '?').trim().charAt(0)}</div>
            <div className="min-w-0">
              <div className="side-user text-sm font-black leading-snug break-words">{user.fullName}</div>
              <div className="side-role text-[11px] font-bold">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          title="تسجيل خروج / تبديل المستخدم"
          className="side-logout w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>خروج / تبديل المستخدم</span>}
        </button>
      </div>
    </aside>
  );
}
