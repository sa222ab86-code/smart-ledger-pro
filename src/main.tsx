import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installLatinDigits } from './utils/latinDigits';
import { installBarcodeSnap } from './utils/barcodeSnap';
// خط البرنامج: Tajawal (عربي + لاتيني) — مضمّن مع البرنامج ويعمل دون إنترنت
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/800.css';
import '@fontsource/tajawal/900.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-900.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-800.css';
import App from './App.tsx';
import UpdateBanner from './components/UpdateBanner.tsx';
import NetworkBanner from './components/NetworkBanner.tsx';
import { hydrate } from './storage/persistence';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { trMsg } from './i18n';
import './index.css';

// بعد كل alert/confirm/prompt: إعادة تركيز النافذة حتى لا تتجمد حقول الإدخال (مشكلة Electron على ويندوز)
if (window.ledger?.app.refocus) {
  const refocus = () => {
    window.ledger?.app.refocus?.();
    // إعادة التركيز على الحقل الذي كان نشطاً إن وُجد
    const el = document.activeElement as HTMLElement | null;
    setTimeout(() => { if (el && el !== document.body && typeof el.focus === 'function') el.focus(); }, 0);
  };
  const origAlert = window.alert.bind(window);
  const origConfirm = window.confirm.bind(window);
  const origPrompt = window.prompt.bind(window);
  window.alert = (msg?: unknown) => { origAlert(trMsg(msg) as string); refocus(); };
  window.confirm = (msg?: string) => { const r = origConfirm(trMsg(msg) as string); refocus(); return r; };
  window.prompt = (msg?: string, def?: string) => { const r = origPrompt(trMsg(msg) as string, def); refocus(); return r; };
}

// صور المنتجات القادمة من الإنترنت: إن لم يوجد اتصال نعرض بديلاً بدل صورة مكسورة
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e2e8f0"/>' +
      '<path d="M60 130l30-36 22 26 16-18 22 28z" fill="#94a3b8"/><circle cx="76" cy="76" r="12" fill="#94a3b8"/></svg>'
  );
window.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.dataset.fallback !== '1') {
      t.dataset.fallback = '1';
      t.src = PLACEHOLDER;
    }
  },
  true
);

// أخطاء غير ملتقطة في الأحداث/الوعود: تُسجَّل ولا تُسقط البرنامج
window.addEventListener('unhandledrejection', (e) => { console.error('[ui] unhandled rejection', e.reason); });

installLatinDigits();
installBarcodeSnap();
const root = createRoot(document.getElementById('root')!);

async function boot() {
  try {
    await hydrate(); // نحمّل البيانات من SQLite قبل رسم الواجهة
  } catch (err) {
    console.error(err);
    // نسخة Pro: الجهاز الفرعي لم يصل للجهاز الرئيسي → إعادة محاولة أو العمل مستقلاً
    const net = await window.ledger?.network?.info().catch(() => null);
    if (net && net.role === 'client') {
      // إعادة محاولة تلقائية: الجهاز الرئيسي قد يكون ما زال يفتح (بعد إعادة تشغيله)
      const retry = setTimeout(() => window.location.reload(), 5000);
      void retry;
      const btn = { padding: '10px 18px', borderRadius: 10, border: 0, fontWeight: 800, cursor: 'pointer', marginLeft: 8 } as const;
      root.render(
        <div dir="rtl" style={{ padding: 40, fontFamily: 'Tajawal, sans-serif', maxWidth: 640, margin: '60px auto' }}>
          <h2 style={{ color: '#b91c1c' }}>تعذّر الاتصال بالجهاز الرئيسي</h2>
          <p>هذا الجهاز مربوط كجهاز فرعي بالعنوان <b dir="ltr">{net.host}:{net.port}</b>. تأكد أن الجهاز الرئيسي مفتوح وأن البرنامج يعمل عليه وأنهما على نفس الشبكة.</p>
          <pre style={{ direction: 'rtl', whiteSpace: 'pre-wrap', color: '#64748b' }}>{String((err as Error)?.message ?? err)}</pre>
          <p style={{ color: '#4f46e5', fontWeight: 700 }}>يُعاد المحاولة تلقائياً كل 5 ثوانٍ — سيفتح البرنامج فور تشغيل الجهاز الرئيسي.</p>
          <div style={{ marginTop: 20 }}>
            <button style={{ ...btn, background: '#4f46e5', color: '#fff' }} onClick={() => window.location.reload()}>إعادة المحاولة</button>
            <button style={{ ...btn, background: '#e2e8f0' }} onClick={async () => {
              if (!window.confirm('فك ربط هذا الجهاز والعمل مستقلاً ببياناته المحلية؟ (يمكن ربطه مجدداً من «ربط الأجهزة»)')) return;
              await window.ledger!.network!.configure({ role: 'standalone' });
              await window.ledger!.network!.relaunch();
            }}>العمل كجهاز مستقل</button>
          </div>
        </div>
      );
      return;
    }
    root.render(
      <div dir="rtl" style={{ padding: 40, fontFamily: 'sans-serif', color: '#b91c1c' }}>
        <h2>تعذر تحميل البيانات</h2>
        <p>لم يتم تشغيل البرنامج حمايةً لبياناتك من الكتابة فوقها. أغلق البرنامج وأعد فتحه، وإن استمرت المشكلة استعد آخر نسخة احتياطية من مجلد backups.</p>
        <pre style={{ direction: 'ltr', whiteSpace: 'pre-wrap' }}>{String((err as Error)?.message ?? err)}</pre>
      </div>
    );
    return;
  }
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <UpdateBanner />
      <NetworkBanner />
    </StrictMode>
  );
}

void boot();
