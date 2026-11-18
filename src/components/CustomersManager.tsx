import React, { useMemo, useState } from 'react';
import { useVirtualRows, useGridCols, chunkRows } from '../utils/useVirtualRows';
import CustomerForm, { type CustomerDraft } from './CustomerForm';
import { Users, Plus, Search, Phone, Mail, Award, Trash2, Edit, MapPin } from 'lucide-react';
import { Customer, PayMethod } from '../types';
import SaudiRiyalSymbol from './SaudiRiyalSymbol';
import { CustomerPaymentModal } from './PaymentModals';

interface CustomersManagerProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (id: string, updated: Partial<Customer>) => void;
  /** سبب منع الحذف (عميل عليه حركة) أو null إن كان الحذف مسموحاً */
  deleteBlockReason?: (c: Customer) => string | null;
  onDeleteCustomer: (id: string) => void;
  onRecordPayment?: (customerId: string, amount: number, method: PayMethod) => void;
}

export default function CustomersManager({ 
  customers, 
  onAddCustomer, 
  onUpdateCustomer, 
  onDeleteCustomer,
  onRecordPayment,
  deleteBlockReason
}: CustomersManagerProps) {
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const handleAddSubmit = (d: CustomerDraft) => {
    onAddCustomer({ id: `c${Date.now()}`, balance: 0, ...d });
    setShowAddModal(false);
  };

  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowEditModal(true);
  };

  const handleEditSubmit = (d: CustomerDraft) => {
    if (!editingCustomer) return;
    onUpdateCustomer(editingCustomer.id, d);
    setEditingCustomer(null);
    setShowEditModal(false);
  };

  const handleDeleteClick = (id: string) => {
    const cust = customers.find(c => c.id === id);
    const blocked = cust && deleteBlockReason ? deleteBlockReason(cust) : null;
    if (blocked) { alert(blocked); return; }
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا العميل نهائياً؟')) {
      onDeleteCustomer(id);
    }
  };

  const filteredCustomers = useMemo(() => customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  ), [customers, searchQuery]);
  // البطاقات تُقسَّم صفوفاً بعدد أعمدة الشاشة ويُرسم الظاهر منها فقط داخل إطار بشريط تمرير
  const gridCols = useGridCols({ base: 1, md: 2, lg: 3 });
  const customerRows = useMemo(() => chunkRows<Customer>(filteredCustomers, gridCols), [filteredCustomers, gridCols]);
  const customersTable = useVirtualRows<Customer[]>(customerRows, (r) => `${gridCols}:${r[0].id}`, { estimate: 260, overscan: 3, resetKey: searchQuery });

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <span>إدارة شؤون العملاء</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">عرض جميع عملائك، تتبع الأرصدة وإضافة عملاء جدد لحسابات نقاط البيع.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-500/10 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>عميل جديد</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <input 
            type="text" 
            placeholder="البحث عن طريق اسم العميل أو رقم الجوال..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-12 pl-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-amber-400"
          />
          <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3" />
        </div>
      </div>

      {/* Customers List Grid */}
      <div ref={customersTable.scrollRef} className="flex-1 min-h-[22rem] overflow-auto vlist-scroll px-1" data-testid="customers-scroll">
        {filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-bold">
            لا يوجد عملاء مطابقين لعملية البحث
          </div>
        ) : (<>
          <div style={{ height: customersTable.padTop }} aria-hidden />
          {customersTable.visible.map((row) => (
          <div key={`${gridCols}:${row[0].id}`} data-vkey={`${gridCols}:${row[0].id}`} className="grid gap-6 pb-6" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
          {row.map(customer => (
            <div key={customer.id} className="bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between">
              {/* Design accents */}
              <div className="absolute top-0 left-0 w-2 h-full bg-amber-500/40"></div>
              
              <div>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{customer.name}</h3>
                    <span className="inline-block text-[10px] bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md font-bold">
                      مُعرّف: {customer.id}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleEditClick(customer)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition"
                      title="تعديل"
                    >
                      <Edit className="w-4.5 h-4.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteClick(customer.id)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition"
                      title="حذف"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    <span>{customer.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span className="font-mono">{customer.email}</span>
                  </div>
                  {customer.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <span>{customer.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Balances */}
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm">
                <span className="font-bold text-slate-500 text-xs">{(customer.balance || 0) < 0 ? 'مديونية على العميل:' : 'الرصيد المالي:'}</span>
                <span className={`font-mono font-black inline-flex items-center gap-1 ${(customer.balance || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {(customer.balance || 0).toFixed(2)} <SaudiRiyalSymbol className="w-3.5 h-3.5" />
                </span>
              </div>
              {onRecordPayment && (customer.balance || 0) < -0.004 && (
                <button
                  onClick={() => setPayingCustomer(customer)}
                  className="mt-3 w-full py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-black text-xs"
                >
                  تسجيل دفعة سداد
                </button>
              )}
            </div>
          ))}
          </div>
          ))}
          <div style={{ height: customersTable.padBottom }} aria-hidden />
        </>)}
      </div>

      {/* Add Customer Modal Overlay */}
      {showAddModal && (
        <CustomerForm title="إضافة عميل جديد" submitLabel="تأكيد الحفظ" onSubmit={handleAddSubmit} onCancel={() => setShowAddModal(false)} />
      )}

      {showEditModal && editingCustomer && (
        <CustomerForm title={`تعديل بيانات: ${editingCustomer.name}`} initial={editingCustomer} submitLabel="حفظ التغييرات" onSubmit={handleEditSubmit} onCancel={() => { setShowEditModal(false); setEditingCustomer(null); }} />
      )}

      {payingCustomer && onRecordPayment && (
        <CustomerPaymentModal
          customer={payingCustomer}
          onClose={() => setPayingCustomer(null)}
          onConfirm={(amount, method) => { onRecordPayment(payingCustomer.id, amount, method); setPayingCustomer(null); }}
        />
      )}
    </div>
  );
}
