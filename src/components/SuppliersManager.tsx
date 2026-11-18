import React, { useState } from 'react';
import { useVirtualRows, VSpacer } from '../utils/useVirtualRows';
import { Truck, Plus, Search, Phone, Mail, Trash2, Edit, MapPin, X } from 'lucide-react';
import { Supplier } from '../types';

interface SuppliersManagerProps {
  suppliers: Supplier[];
  onAddSupplier: (supplier: Supplier) => void;
  onUpdateSupplier: (id: string, updated: Partial<Supplier>) => void;
  onDeleteSupplier: (id: string) => void;
}

export default function SuppliersManager({
  suppliers,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
}: SuppliersManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newSupplier: Supplier = {
      id: `s${Date.now()}`,
      name,
      phone: phone || '05XXXXXXXX',
      email: email || 'supplier@example.com',
      address: address || 'المملكة العربية السعودية',
      vatNumber: vatNumber || undefined
    };

    onAddSupplier(newSupplier);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setVatNumber('');
    setShowAddModal(false);
  };

  const handleEditClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setPhone(supplier.phone);
    setEmail(supplier.email);
    setAddress(supplier.address || '');
    setVatNumber(supplier.vatNumber || '');
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !name.trim()) return;

    onUpdateSupplier(editingSupplier.id, {
      name,
      phone,
      email,
      address,
      vatNumber: vatNumber || undefined
    });

    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setVatNumber('');
    setEditingSupplier(null);
    setShowEditModal(false);
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
  );

  const suppliersTable = useVirtualRows(filteredSuppliers, (s) => s.id, { resetKey: searchQuery });

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 h-full flex flex-col gap-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>إدارة الموردين</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            إضافة وإدارة جهات اتصال الشركات والموردين للمخزون والمشتريات.
          </p>
        </div>
        <button
          onClick={() => {
            setName('');
            setPhone('');
            setEmail('');
            setAddress('');
            setShowAddModal(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة مورد جديد</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="البحث باسم المورد أو رقم الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-12 pl-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
        />
        <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3" />
      </div>

      {/* Suppliers Table/Grid */}
      <div className="flex-1 min-h-[22rem] flex flex-col bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div ref={suppliersTable.scrollRef} className="flex-1 min-h-0 overflow-auto vlist-scroll" data-testid="suppliers-scroll">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-[3] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-[0_1px_0_rgba(100,116,139,0.25)]">
              <tr>
                <th className="p-4 font-bold">اسم المورد</th>
                <th className="p-4 font-bold">رقم الهاتف</th>
                <th className="p-4 font-bold">البريد الإلكتروني</th>
                <th className="p-4 font-bold">العنوان</th>
                <th className="p-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    لا يوجد موردين متاحين حالياً.
                  </td>
                </tr>
              ) : (<>
                <VSpacer h={suppliersTable.padTop} />
                {suppliersTable.visible.map((s) => (
                  <tr key={s.id} data-vkey={s.id} className="hover:bg-white/50 dark:hover:bg-slate-900/50 transition">
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{s.name}</td>
                    <td className="p-4 font-mono text-slate-600 dark:text-slate-300">{s.phone}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400">{s.email}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                        <span>{s.address}</span>
                      </div>
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                      <button
                        onClick={() => handleEditClick(s)}
                        className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-950 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-slate-500 dark:text-slate-400 transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteSupplier(s.id)}
                        className="p-2 bg-white dark:bg-slate-900 hover:bg-rose-950 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-slate-500 dark:text-slate-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <VSpacer h={suppliersTable.padBottom} />
              </>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100">
            <div className="bg-white dark:bg-slate-900 p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Truck className="w-5 h-5" /> إضافة مورد جديد
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4 font-bold">
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">اسم المورد / الشركة</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اكتب اسم المورد أو الشركة"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">رقم الهاتف</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="supplier@company.com"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">العنوان</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="الرياض - المنطقة الصناعية"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">الرقم الضريبي (VAT)</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="مثال: 310123456780003"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition"
              >
                حفظ المورد
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100">
            <div className="bg-white dark:bg-slate-900 p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Edit className="w-5 h-5" /> تعديل بيانات المورد
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 font-bold">
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">اسم المورد / الشركة</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">رقم الهاتف</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">العنوان</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-500 dark:text-slate-400">الرقم الضريبي (VAT)</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="مثال: 310123456780003"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none font-mono text-left"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition"
              >
                تحديث البيانات
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
