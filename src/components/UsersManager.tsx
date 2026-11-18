import React, { useMemo, useState } from 'react';
import { UserCircle, Plus, Search, Shield, Key, Trash2, X, Pencil, Ban, CheckCircle2 } from 'lucide-react';
import type { AppUser } from '../types';
import {
  PERMISSION_GROUPS, ROLE_LABELS, ROLE_PRESETS, permissionsOf, hasPassword, isActiveAdmin, withPassword,
  type Permission, type UserRole,
} from '../utils/auth';

interface UsersManagerProps {
  users: AppUser[];
  currentUserId?: string;
  onSaveUser: (user: AppUser, isNew: boolean) => void;
  onDeleteUser: (id: string) => void;
  /** هل للمستخدم مبيعات مسجلة؟ (يُمنع حذفه ويُكتفى بالإيقاف) */
  hasSales?: (u: AppUser) => boolean;
  notify?: (msg: string) => void;
}

const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-bold';

interface Draft {
  id?: string;
  fullName: string;
  username: string;
  role: UserRole;
  permissions: Set<Permission>;
  password: string;
  status: AppUser['status'];
}

export default function UsersManager({ users, currentUserId, onSaveUser, onDeleteUser, hasSales, notify }: UsersManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const activeAdmins = users.filter((u) => isActiveAdmin(u) && hasPassword(u)).length;
  /** لا نسمح بأي تغيير يترك البرنامج بلا مدير فعّال، ولا بإيقاف/حذف المستخدم الحالي */
  const guardReason = (u: AppUser, change: 'delete' | 'suspend' | 'demote'): string | null => {
    if (u.id === currentUserId && change !== 'demote') return 'لا يمكنك إيقاف أو حذف حسابك وأنت داخل به';
    if (isActiveAdmin(u) && activeAdmins <= 1) return 'يجب أن يبقى مدير فعّال واحد على الأقل';
    return null;
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [users, searchQuery]);

  const openNew = () => {
    setError('');
    setDraft({ fullName: '', username: '', role: 'cashier', permissions: new Set(ROLE_PRESETS.cashier), password: '', status: 'active' });
  };
  const openEdit = (u: AppUser) => {
    setError('');
    setDraft({ id: u.id, fullName: u.fullName, username: u.username, role: u.role, permissions: permissionsOf(u), password: '', status: u.status });
  };

  const setRole = (role: UserRole) =>
    setDraft((d) => d && ({ ...d, role, permissions: role === 'custom' ? d.permissions : new Set(ROLE_PRESETS[role]) }));
  const togglePerm = (p: Permission) =>
    setDraft((d) => {
      if (!d || d.role === 'admin') return d;
      const next = new Set(d.permissions);
      if (next.has(p)) next.delete(p); else next.add(p);
      return { ...d, role: 'custom', permissions: next };
    });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const fullName = draft.fullName.trim();
    const username = draft.username.trim().toLowerCase();
    if (!fullName || !username) return setError('الاسم واسم الدخول مطلوبان');
    if (users.some((u) => u.username.toLowerCase() === username && u.id !== draft.id)) return setError('اسم الدخول مستخدم لحساب آخر');
    const existing = draft.id ? users.find((u) => u.id === draft.id) : undefined;
    if (!existing && draft.password.length < 4) return setError('كلمة المرور 4 أحرف أو أرقام على الأقل');
    if (draft.password && draft.password.length < 4) return setError('كلمة المرور 4 أحرف أو أرقام على الأقل');
    if (existing && isActiveAdmin(existing) && (draft.role !== 'admin' || draft.status !== 'active')) {
      const r = guardReason(existing, draft.status !== 'active' ? 'suspend' : 'demote');
      if (r) return setError(r);
    }
    let u: AppUser = {
      ...(existing || { id: `u-${Date.now()}` }),
      fullName,
      username,
      role: draft.role,
      status: draft.status,
      permissions: draft.role === 'custom' ? Array.from(draft.permissions) : undefined,
    };
    if (draft.password) u = withPassword(u, draft.password);
    onSaveUser(u, !existing);
    notify?.(existing ? `تم حفظ بيانات ${fullName}` : `تمت إضافة ${fullName}`);
    setDraft(null);
  };

  const toggleStatus = (u: AppUser) => {
    if (u.status === 'active') {
      const r = guardReason(u, 'suspend');
      if (r) return notify?.(r);
    }
    onSaveUser({ ...u, status: u.status === 'active' ? 'suspended' : 'active' }, false);
  };
  const remove = (u: AppUser) => {
    const r = guardReason(u, 'delete');
    if (r) return notify?.(r);
    if (hasSales?.(u)) return notify?.(`لا يمكن حذف «${u.fullName}» لأن له مبيعات مسجلة — استخدم زر الإيقاف بدلاً من الحذف`);
    if (confirm(`حذف المستخدم «${u.fullName}» نهائياً؟ فواتيره السابقة تبقى باسمه.`)) onDeleteUser(u.id);
  };

  return (
    <div className="p-4 2xl:p-6 bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100 min-h-full space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-cyan-700 dark:text-cyan-400" />
            <span>المستخدمون والصلاحيات</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            كل مستخدم يدخل بكلمة مروره، وتُسجَّل الفواتير باسمه. العمليات غير المسموحة له تحتاج موافقة مشرف.
          </p>
        </div>
        <button onClick={openNew} className="bg-cyan-700 hover:bg-cyan-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition cursor-pointer">
          <Plus className="w-5 h-5" /> <span>إضافة مستخدم</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <input type="text" placeholder="البحث بالاسم أو اسم الدخول..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`${inp} pr-11 py-3`} />
        <Search className="w-5 h-5 text-slate-500 absolute right-4 top-3" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((u) => {
          const perms = permissionsOf(u);
          return (
            <div key={u.id} className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 flex flex-col gap-4 ${u.status === 'suspended' ? 'border-rose-300 dark:border-rose-900 opacity-75' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-cyan-50 dark:bg-cyan-900/40 flex items-center justify-center text-cyan-700 dark:text-cyan-300 shrink-0">
                    {u.role === 'admin' ? <Shield className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black truncate">{u.fullName}{u.id === currentUserId && <span className="text-[11px] text-cyan-700 dark:text-cyan-300 mr-1.5">(أنت)</span>}</div>
                    <div className="text-xs text-slate-500 font-mono" dir="ltr">{u.username}</div>
                  </div>
                </div>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${u.role === 'admin' ? 'bg-brass-500/15 text-brass-600 dark:text-brass-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                  {ROLE_LABELS[u.role]}
                </span>
              </div>

              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 space-y-1">
                <div>{perms.size} صلاحية من {PERMISSION_GROUPS.reduce((n, g) => n + g.items.length, 0)}</div>
                <div className={hasPassword(u) ? '' : 'text-amber-600 dark:text-amber-400'}>{hasPassword(u) ? 'كلمة المرور معيّنة' : 'لا توجد كلمة مرور — لن يستطيع الدخول'}</div>
                {u.lastLoginAt && <div>آخر دخول: <span className="font-mono">{u.lastLoginAt}</span></div>}
                {u.status === 'suspended' && <div className="text-rose-600 dark:text-rose-400">الحساب موقوف</div>}
              </div>

              <div className="flex gap-2 mt-auto">
                <button onClick={() => openEdit(u)} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Pencil className="w-4 h-4" /> تعديل
                </button>
                <button onClick={() => toggleStatus(u)} title={u.status === 'active' ? 'إيقاف الحساب' : 'تنشيط الحساب'} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                  {u.status === 'active' ? <Ban className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </button>
                {hasSales?.(u) ? (
                  <span title="له مبيعات مسجلة — لا يُحذف، يمكن إيقافه فقط" className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" data-testid="user-delete-locked"><Trash2 className="w-4 h-4 opacity-40" /></span>
                ) : (
                <button onClick={() => remove(u)} title="حذف" className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredUsers.length === 0 && <div className="col-span-full p-8 text-center text-slate-500 font-bold">لا يوجد مستخدمون مطابقون للبحث.</div>}
      </div>

      {draft && (
        <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4" dir="rtl">
          <form onSubmit={save} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-black text-lg">{draft.id ? `تعديل ${draft.fullName}` : 'مستخدم جديد'}</h3>
              <button type="button" onClick={() => setDraft(null)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-slate-500">الاسم الكامل</label><input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} className={inp} autoFocus /></div>
                <div><label className="text-xs font-bold text-slate-500">اسم الدخول</label><input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className={`${inp} font-mono`} dir="ltr" /></div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><Key className="w-3.5 h-3.5" /> {draft.id ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور (4 أحرف أو أرقام على الأقل)'}</label>
                  <input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={`${inp} font-mono`} autoComplete="new-password" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500">الدور</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                  {(['admin', 'supervisor', 'cashier', 'custom'] as UserRole[]).map((r) => (
                    <button key={r} type="button" onClick={() => setRole(r)} className={`py-2 rounded-xl border-2 text-sm font-black cursor-pointer ${draft.role === r ? 'border-cyan-600 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700'}`}>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                {draft.role === 'admin' && <p className="text-[11px] text-slate-500 font-bold mt-1.5">المدير يملك كل الصلاحيات دائماً.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-xs font-black text-slate-500 mb-2">{g.label}</div>
                    <div className="space-y-1.5">
                      {g.items.map((it) => (
                        <label key={it.id} className={`flex items-center gap-2 text-sm font-bold ${draft.role === 'admin' ? 'opacity-60' : 'cursor-pointer'}`}>
                          <input type="checkbox" checked={draft.role === 'admin' || draft.permissions.has(it.id as Permission)} disabled={draft.role === 'admin'} onChange={() => togglePerm(it.id as Permission)} />
                          {it.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 font-bold">تعديل أي صلاحية يحوّل الدور إلى «صلاحيات مخصصة».</p>
              {error && <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-black">حفظ</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
