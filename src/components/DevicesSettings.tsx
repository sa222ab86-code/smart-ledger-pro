import { useEffect, useState } from 'react';
import { Inbox, Monitor, Scale, RefreshCw } from 'lucide-react';
import type { ScaleSettings } from '../utils/scale';
import { DEFAULT_VFD_SETTINGS, type VfdSettings } from '../utils/vfd';
import { listOsPrinters } from '../utils/printing';

/** إعدادات درج النقود وشاشة العميل */
export interface DeviceSettings {
  drawerEnabled: boolean;
  /** فتح الدرج تلقائياً بعد البيع النقدي */
  drawerOnCash: boolean;
  /** المنفذ داخل الطابعة: 0 = الافتراضي، 1 = البديل */
  drawerPin: 0 | 1;
  /** طابعة الدرج (فارغ = طابعة الإيصالات) */
  drawerPrinter: string;
  customerDisplay: boolean;
  displayMessage: string;
  /** شاشة العميل التسلسلية (VFD سطران على منفذ COM) */
  vfd?: VfdSettings;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  drawerEnabled: false,
  drawerOnCash: true,
  drawerPin: 0,
  drawerPrinter: '',
  customerDisplay: false,
  displayMessage: 'أهلاً وسهلاً بكم',
  vfd: DEFAULT_VFD_SETTINGS,
};

interface Props {
  devices: DeviceSettings;
  setDevices: (u: (p: DeviceSettings) => DeviceSettings) => void;
  scale: ScaleSettings;
  setScale: (u: (p: ScaleSettings) => ScaleSettings) => void;
  scaleStatus: { connected: boolean; reason?: string };
  /** حالة شاشة العميل التسلسلية + اختبارها */
  vfdStatus?: { connected: boolean; reason?: string };
  onTestVfd?: () => void;
  liveWeight: number | null;
  onTestDrawer: () => void;
  onTestDisplay: () => void;
  /** عرض جزء فقط: درج النقود (مع الطابعات) أو شاشة العميل والميزان (تبويب مستقل) */
  only?: 'drawer' | 'displayScale';
}

const card = 'bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700';
const inp = 'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500';
const lbl = 'block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1';

function Toggle({ on, onClick, testId }: { on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={on} onClick={onClick} className={`w-12 h-6 rounded-full relative shrink-0 transition ${on ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${on ? 'left-1' : 'left-7'}`} />
    </button>
  );
}

export default function DevicesSettings({ devices, setDevices, scale, setScale, scaleStatus, liveWeight, onTestDrawer, onTestDisplay, only, vfdStatus, onTestVfd }: Props) {
  const vfd: VfdSettings = { ...DEFAULT_VFD_SETTINGS, ...(devices.vfd || {}) };
  const vf = (u: Partial<VfdSettings>) => setDevices((p) => ({ ...p, vfd: { ...DEFAULT_VFD_SETTINGS, ...(p.vfd || {}), ...u } }));
  const api = window.ledger?.devices;
  const [ports, setPorts] = useState<{ port: string; label?: string }[]>([]);
  const loadPorts = async () => setPorts(api ? await api.scalePorts() : []);
  /** اسم المنفذ مع جهازه: COM3 — USB-SERIAL CH340 */
  const portText = (p: { port: string; label?: string }) => (p.label ? `${p.port} — ${p.label}` : p.port);
  const [osPrinters, setOsPrinters] = useState<string[]>([]);
  useEffect(() => { void loadPorts(); void listOsPrinters().then((l) => setOsPrinters(l.map((p) => p.name))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const d = (patch: Partial<DeviceSettings>) => setDevices((p) => ({ ...p, ...patch }));
  const sc = (patch: Partial<ScaleSettings>) => setScale((p) => ({ ...p, ...patch }));
  const valueDigits = 12 - (scale.prefixes.split(/[,\s،]+/).filter(Boolean)[0]?.length || 1) - scale.itemDigits;

  return (
    <div className={`grid grid-cols-1 ${only ? 'xl:grid-cols-2' : 'xl:grid-cols-3'} gap-5`} data-testid="devices-settings">
      {/* درج النقود */}
      {only !== 'displayScale' && <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 dark:text-white"><Inbox className="w-5 h-5 text-amber-600" /> درج النقود</h3>
          <Toggle testId="drawer-enabled" on={devices.drawerEnabled} onClick={() => d({ drawerEnabled: !devices.drawerEnabled })} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">الدرج موصول بطابعة الإيصالات (منفذ RJ11). يظهر زر «فتح الدرج» في شاشة البيع.</p>
        <div className="space-y-3">
          <div>
            <label className={lbl}>طابعة الدرج</label>
            <select value={devices.drawerPrinter} onChange={(e) => d({ drawerPrinter: e.target.value })} className={inp}>
              <option value="">طابعة الإيصالات المحددة</option>
              {osPrinters.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>منفذ الدرج في الطابعة</label>
            <select value={devices.drawerPin} onChange={(e) => d({ drawerPin: Number(e.target.value) as 0 | 1 })} className={inp}>
              <option value={0}>الافتراضي (Pin 2)</option>
              <option value={1}>البديل (Pin 5) — إذا لم يفتح بالافتراضي</option>
            </select>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm font-bold">
            <span>فتح تلقائي بعد البيع النقدي</span>
            <Toggle on={devices.drawerOnCash} onClick={() => d({ drawerOnCash: !devices.drawerOnCash })} />
          </label>
          <button type="button" onClick={onTestDrawer} disabled={!devices.drawerEnabled} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-black">اختبار فتح الدرج</button>
        </div>
      </div>}

      {only !== 'drawer' && <>
      {/* شاشة العميل */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 dark:text-white"><Monitor className="w-5 h-5 text-cyan-600" /> شاشة العميل (الخلفية)</h3>
          <Toggle testId="display-enabled" on={devices.customerDisplay} onClick={() => d({ customerDisplay: !devices.customerDisplay })} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">تُفتح على الشاشة الثانية بملء الشاشة وتعرض الأصناف والإجمالي والباقي للعميل. بدون شاشة ثانية تُفتح نافذة صغيرة للتجربة.</p>
        <div className="space-y-3">
          <div>
            <label className={lbl}>رسالة الترحيب</label>
            <input value={devices.displayMessage} onChange={(e) => d({ displayMessage: e.target.value })} className={inp} />
          </div>
          <button type="button" onClick={onTestDisplay} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black">فتح / إعادة فتح شاشة العميل</button>
        </div>
      </div>

      {/* شاشة العميل التسلسلية (VFD) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/40" data-testid="vfd-box">
        <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 dark:text-white mb-1"><Monitor className="w-5 h-5 text-indigo-600" /> شاشة العميل الصغيرة (VFD على منفذ COM)</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">الشاشة الرقمية ذات السطرين خلف الجهاز. أما الشاشة الخلفية الكبيرة (LCD) فتُفعَّل من «شاشة العميل» أعلاه لأن ويندوز يراها شاشة ثانية.</p>
        <div className="flex items-center justify-between mb-3">
          <span className="font-black text-sm">تفعيل شاشة VFD</span>
          <Toggle testId="vfd-on" on={vfd.enabled} onClick={() => vf({ enabled: !vfd.enabled })} />
        </div>
        {vfd.enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>المنفذ</label>
                <div className="flex gap-1">
                  <select value={vfd.port} onChange={(e) => vf({ port: e.target.value })} data-testid="vfd-port" className={`${inp} text-xs`}>
                    {!ports.some((p) => p.port === vfd.port) && <option value={vfd.port}>{vfd.port}</option>}
                    {ports.map((p) => <option key={p.port} value={p.port}>{portText(p)}</option>)}
                  </select>
                  <button type="button" onClick={() => void loadPorts()} title="تحديث المنافذ" className="px-2 rounded-xl bg-slate-100 dark:bg-slate-700"><RefreshCw className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <label className={lbl}>السرعة (Baud)</label>
                <select value={vfd.baud} onChange={(e) => vf({ baud: Number(e.target.value) })} className={`${inp} font-mono`}>
                  {[2400, 4800, 9600, 19200, 38400, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>البروتوكول</label>
                <select value={vfd.protocol} onChange={(e) => vf({ protocol: e.target.value as VfdSettings['protocol'] })} className={inp}>
                  <option value="cd5220">CD5220 (الأشيع)</option>
                  <option value="escpos">ESC/POS (Epson DM-D)</option>
                  <option value="raw">نص خام</option>
                </select>
              </div>
              <div>
                <label className={lbl}>عدد الأعمدة</label>
                <select value={vfd.columns} onChange={(e) => vf({ columns: Number(e.target.value) })} className={`${inp} font-mono`}>
                  {[16, 20, 24].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={lbl}>رسالة السكون (لاتينية)</label>
                <input value={vfd.idleText} onChange={(e) => vf({ idleText: e.target.value.replace(/[^\x20-\x7E]/g, '') })} data-testid="vfd-idle" className={inp} placeholder="WELCOME" dir="ltr" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
              <span className={`text-xs font-black ${vfdStatus?.connected ? 'text-emerald-600' : 'text-slate-400'}`}>
                {vfdStatus?.connected ? '● متصلة' : vfdStatus?.reason ? `تعذّر: ${vfdStatus.reason}` : '○ غير متصلة'}
              </span>
              {onTestVfd && <button type="button" onClick={onTestVfd} data-testid="vfd-test" className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black">اختبار الشاشة</button>}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">هذه الشاشات لا تعرض العربية غالباً، فتظهر الأسعار والإجماليات بالأرقام مع كلمات إنجليزية قصيرة (TOTAL / CHANGE). ويُستخدم الاسم الإنجليزي للصنف إن وُجد.</p>
          </>
        )}
      </div>

      {/* الميزان */}
      <div className={card}>
        <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 dark:text-white mb-4"><Scale className="w-5 h-5 text-emerald-600" /> الميزان الإلكتروني</h3>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-sm">ملصقات الميزان (باركود يبدأ بـ 2)</span>
            <Toggle testId="scale-barcode" on={scale.barcodeEnabled} onClick={() => sc({ barcodeEnabled: !scale.barcodeEnabled })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>البادئة</label><input value={scale.prefixes} onChange={(e) => sc({ prefixes: e.target.value.replace(/[^0-9,، ]/g, '') })} className={`${inp} font-mono`} placeholder="2 أو 20,21" /></div>
            <div><label className={lbl}>أرقام كود الصنف</label><input type="number" min={3} max={7} value={scale.itemDigits} onChange={(e) => sc({ itemDigits: Math.max(3, Math.min(7, Number(e.target.value) || 5)) })} className={`${inp} font-mono`} /></div>
            <div>
              <label className={lbl}>الملصق يحمل</label>
              <select value={scale.mode} onChange={(e) => { const m = e.target.value as ScaleSettings['mode']; sc({ mode: m, decimals: m === 'weight' ? 3 : 2 }); }} className={inp}>
                <option value="weight">الوزن</option>
                <option value="price">السعر</option>
              </select>
            </div>
            <div><label className={lbl}>الخانات العشرية</label><input type="number" min={0} max={4} value={scale.decimals} onChange={(e) => sc({ decimals: Math.max(0, Math.min(4, Number(e.target.value) || 0)) })} className={`${inp} font-mono`} /></div>
          </div>
          {/* شكل باركود الميزان: يُعرض من اليسار لليمين كما يُطبع */}
          <div className="mt-2 flex justify-end gap-1 font-mono text-[11px] font-black" dir="ltr" style={{ direction: 'ltr' }} data-testid="scale-pattern">
            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700">{scale.prefixes.split(/[,\s،]+/).filter(Boolean)[0] || '2'}</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200">{'P'.repeat(scale.itemDigits)}</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">{'V'.repeat(Math.max(0, valueDigits))}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700">C</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">P = كود الصنف (يُدخل في «كود الميزان» للصنف) · V = {scale.mode === 'weight' ? 'الوزن' : 'السعر'}</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-sm">ميزان متصل بالجهاز (COM / USB)</span>
            <Toggle testId="scale-serial" on={scale.serialEnabled} onClick={() => sc({ serialEnabled: !scale.serialEnabled })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>المنفذ</label>
              <div className="flex gap-1">
                <select value={scale.port} onChange={(e) => sc({ port: e.target.value })} data-testid="scale-port" className={`${inp} text-xs`}>
                  {!ports.some((p) => p.port === scale.port) && <option value={scale.port}>{scale.port}</option>}
                  {ports.map((p) => <option key={p.port} value={p.port}>{portText(p)}</option>)}
                </select>
                <button type="button" onClick={() => void loadPorts()} title="تحديث المنافذ" className="px-2 rounded-xl bg-slate-100 dark:bg-slate-700"><RefreshCw className="w-4 h-4" /></button>
              </div>
              {!ports.length && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">لا توجد منافذ — وصّل الميزان وشغّله، وإن كان USB فثبّت تعريف المحوّل (CH340 أو Prolific) ثم اضغط التحديث.</p>}
            </div>
            <div>
              <label className={lbl}>السرعة (Baud)</label>
              <select value={scale.baud} onChange={(e) => sc({ baud: Number(e.target.value) })} className={`${inp} font-mono`}>
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>البيانات / التماثل</label>
              <select value={`${scale.dataBits}${scale.parity}`} onChange={(e) => { const v = e.target.value; sc({ dataBits: Number(v[0]) as 7 | 8, parity: v.slice(1) as ScaleSettings['parity'] }); }} className={`${inp} font-mono`}>
                <option value="8None">8-N-1</option>
                <option value="7Even">7-E-1</option>
                <option value="7Odd">7-O-1</option>
                <option value="8Even">8-E-1</option>
              </select>
            </div>
            <div>
              <label className={lbl}>أمر طلب الوزن</label>
              <select value={scale.command} onChange={(e) => sc({ command: e.target.value as ScaleSettings['command'] })} className={inp}>
                <option value="none">لا شيء (إرسال مستمر)</option>
                <option value="W">W</option>
                <option value="P">P</option>
                <option value="S">S</option>
                <option value="ENQ">ENQ (0x05)</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2" data-testid="scale-live">
            <span className={`text-xs font-black ${scaleStatus.connected ? 'text-emerald-600' : 'text-slate-500'}`}>
              {scale.serialEnabled ? (scaleStatus.connected ? `● متصل ${scale.port}` : `○ غير متصل${scaleStatus.reason ? ' — ' + scaleStatus.reason : ''}`) : 'مغلق'}
            </span>
            <span className="font-mono font-black text-lg" dir="ltr">{liveWeight != null ? `${liveWeight.toFixed(3)} kg` : '—'}</span>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}
