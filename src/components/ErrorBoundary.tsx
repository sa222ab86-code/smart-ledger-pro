import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flushNow } from '../storage/persistence';

/**
 * حاجز أخطاء الواجهة: خطأ غير متوقع في شاشة ما لا يترك نافذة بيضاء ولا يُفقد البيانات —
 * يحفظ ما في الذاكرة فوراً ويعرض زر «متابعة» (إعادة رسم) و«إعادة تحميل».
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] crash caught', error, info?.componentStack);
    try { flushNow(); } catch { /* */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-white" data-testid="error-boundary">
        <div className="max-w-lg w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 space-y-4 text-right">
          <h2 className="text-xl font-black text-rose-300">حدث خطأ غير متوقع في الشاشة</h2>
          <p className="text-sm font-bold text-slate-300">بياناتك محفوظة. اضغط «متابعة» للعودة، وإن تكرر الخطأ اضغط «إعادة تحميل».</p>
          <pre className="text-[11px] text-slate-400 bg-slate-950 rounded-lg p-2 overflow-auto max-h-32" dir="ltr">{String(this.state.error?.message || this.state.error)}</pre>
          <div className="flex gap-2">
            <button type="button" onClick={() => this.setState({ error: null })} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black cursor-pointer">متابعة</button>
            <button type="button" onClick={() => { try { flushNow(); } catch { /* */ } location.reload(); }} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-black cursor-pointer">إعادة تحميل</button>
          </div>
        </div>
      </div>
    );
  }
}
