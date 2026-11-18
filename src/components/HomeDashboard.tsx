import React from 'react';
import { paymentLabel } from '../utils/invoiceMath';
import { 
  ShoppingBag, Users, Package, Receipt, TrendingUp, DollarSign, ArrowLeft 
} from 'lucide-react';
import { Product, Customer, Invoice } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';

interface HomeDashboardProps {
  invoices: Invoice[];
  products: Product[];
  customers: Customer[];
  onNavigate: (view: string) => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export default function HomeDashboard({ 
  invoices, 
  products, 
  customers, 
  onNavigate,
  onViewInvoice 
}: HomeDashboardProps) {
  
  // Calculate statistics
  const totalSales = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalInvoices = invoices.length;
  const totalProducts = products.length;
  const totalCustomers = customers.length;

  return (
    <div className="p-6 space-y-8 text-right bg-slate-50 dark:bg-slate-950 min-h-full text-slate-800 dark:text-slate-100" dir="rtl">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-l from-white via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 p-6 md:p-8 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">أهلاً بك في الدفتر الذكي 👋</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">تتبع المبيعات والمنتجات والفواتير الضريبية المعتمدة من هيئة الزكاة والضريبة والجمارك.</p>
        </div>
        <button 
          onClick={() => onNavigate('pos')}
          className="px-6 py-3 bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold rounded-xl transition shadow-lg shadow-cyan-500/10 flex items-center gap-2 cursor-pointer"
        >
          <span>فتح شاشة البيع POS</span>
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Revenue */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">إجمالي المبيعات</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono inline-flex items-center gap-1.5">{totalSales.toFixed(2)} <SaudiRiyalSymbol className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Invoices count */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">عدد الفواتير</p>
            <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">{totalInvoices} <span className="text-xs text-slate-500 dark:text-slate-400">فاتورة</span></p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        {/* Products count */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">عدد الأصناف</p>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">{totalProducts} <span className="text-xs text-slate-500 dark:text-slate-400">صنف</span></p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Customers count */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">العملاء المسجلين</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">{totalCustomers} <span className="text-xs text-slate-500 dark:text-slate-400">عميل</span></p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Users className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Two Columns Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent Invoices list */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">آخر الفواتير الصادرة</h2>
            <button 
              onClick={() => onNavigate('invoices')}
              className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              عرض الكل
            </button>
          </div>
          
          <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
            {invoices.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">لا توجد فواتير بعد.</p>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="py-3.5 flex justify-between items-center hover:bg-white/30 dark:hover:bg-slate-900/30 px-2 rounded-lg transition-colors">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{inv.customerName} - {new Date(inv.date).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}</p>
                  </div>
                  <div className="text-left space-y-1">
                    <p className="text-sm font-black text-cyan-600 dark:text-cyan-400 font-mono inline-flex items-center gap-1">{inv.total.toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /></p>
                    <span className="inline-block text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded uppercase font-bold">
                      {paymentLabel(inv)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Fast Quick Actions */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-6 rounded-2xl space-y-4">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">إجراءات سريعة</h2>
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={() => onNavigate('products')}
              className="w-full p-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-right font-bold text-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-between transition-all cursor-pointer"
            >
              <span>إضافة صنف جديد</span>
              <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </button>
            <button 
              onClick={() => onNavigate('customers')}
              className="w-full p-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-right font-bold text-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-between transition-all cursor-pointer"
            >
              <span>إضافة عميل جديد</span>
              <Users className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </button>
            <button 
              onClick={() => onNavigate('settings')}
              className="w-full p-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-right font-bold text-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-between transition-all cursor-pointer"
            >
              <span>تعديل إعدادات المنشأة</span>
              <Receipt className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
