import React from 'react';
import { LogOut, Globe, Menu } from 'lucide-react';
import appIcon from '../assets/app-icon.svg';

interface TopBarProps {
  onLogout: () => void;
  /** أيقونة البرنامج المختارة من الإعدادات */
  iconSrc?: string;
  activeLanguage: string;
  onToggleLanguage?: () => void;
  /** طي/توسيع القائمة الجانبية */
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

export default function TopBar({ onLogout, activeLanguage, onToggleLanguage, iconSrc, onToggleSidebar, sidebarCollapsed }: TopBarProps) {
  return (
    <header className="app-topbar h-16 px-6 flex items-center justify-between text-slate-900 dark:text-white select-none">
      <div className="flex items-center gap-4">
        {onToggleSidebar && (
          <button type="button" onClick={onToggleSidebar} title={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'} data-testid="topbar-sidebar-toggle"
            className="w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-800 border border-[#cfe7df] dark:border-slate-700 hover:bg-white">
            <Menu className="w-5 h-5" />
          </button>
        )}
        <img src={iconSrc || appIcon} alt="" className="w-9 h-9 rounded-lg object-contain" />
        <div className="leading-tight">
          <div className="text-lg font-black text-cyan-800 dark:text-cyan-300">الدفتر الذكي <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5">PRO</span></div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onToggleLanguage} translate="no" data-testid="topbar-lang" title={activeLanguage === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer">
          <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>{activeLanguage === 'en' ? 'English · العربية' : 'العربية · English'}</span>
        </button>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition border border-rose-500/20 cursor-pointer">
          <LogOut className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </div>
    </header>
  );
}
