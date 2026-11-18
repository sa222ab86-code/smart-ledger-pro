import React, { useMemo, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { AppUser } from '../types';
import { can, permissionLabel, verifyPassword, ROLE_LABELS, type Permission } from '../utils/auth';

/**
 * موافقة المشرف: الكاشير لا يملك الصلاحية → مشرف أو مدير يُدخل كلمة مروره
 * فتُنفَّذ العملية دون تغيير المستخدم الداخل.
 */
export default function ApprovalModal({
  users, permission, onApproved, onClose,
}: {
  users: AppUser[];
  permission: Permission;
  onApproved: (approver: AppUser) => void;
  onClose: () => void;
}) {
  const approvers = useMemo(() => users.filter((u) => u.status === 'active' && can(u, permission) && u.passwordHash), [users, permission]);
  const [approverId, setApproverId] = useState(approvers[0]?.id || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = approvers.find((u) => u.id === approverId);
    if (!a) return;
    if (!verifyPassword(a, password)) { setPassword(''); return setError('كلمة المرور غير صحيحة'); }
    onApproved(a);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl text-right">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brass-500" /> موافقة المشرف</span>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            «{permissionLabel(permission)}» غير مسموح لحسابك. يلزم موافقة مستخدم يملك هذه الصلاحية.
          </p>
          {approvers.length === 0 ? (
            <p className="text-sm font-bold text-rose-600">لا يوجد مستخدم يملك هذه الصلاحية وله كلمة مرور.</p>
          ) : (
            <>
              <select value={approverId} onChange={(e) => { setApproverId(e.target.value); setError(''); }} className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold">
                {approvers.map((u) => <option key={u.id} value={u.id}>{u.fullName} — {ROLE_LABELS[u.role]}</option>)}
              </select>
              <input type="password" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="كلمة مرور المشرف" className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-center font-mono text-lg tracking-widest" autoComplete="off" />
              {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            </>
          )}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
          <button type="submit" disabled={!approvers.length || !password} className="flex-1 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-black disabled:opacity-40">موافقة</button>
        </div>
      </form>
    </div>
  );
}
