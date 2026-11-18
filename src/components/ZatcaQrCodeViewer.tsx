import React, { useState, useEffect } from 'react';
import { 
  generateQrDataUrl, 
  decodeZatcaTlvBase64, 
  DecodedZatcaTag 
} from '../utils/zatca';
import { 
  QrCode, ShieldCheck, CheckCircle2, Copy, Download, 
  ExternalLink, Eye, EyeOff, AlertCircle 
} from 'lucide-react';

interface ZatcaQrCodeViewerProps {
  base64Payload: string;
  title?: string;
  subtitle?: string;
  size?: number;
  showInspector?: boolean;
  className?: string;
}

export default function ZatcaQrCodeViewer({
  base64Payload,
  title = 'رمز الاستجابة السريعة (ZATCA QR)',
  subtitle = 'مطابق لمتطلبات الفوترة الإلكترونية - المرحلة الأولى',
  size = 180,
  showInspector = true,
  className = ''
}: ZatcaQrCodeViewerProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [decodedTags, setDecodedTags] = useState<DecodedZatcaTag[]>([]);

  useEffect(() => {
    let isMounted = true;
    if (base64Payload) {
      generateQrDataUrl(base64Payload, { width: size * 2 }).then(url => {
        if (isMounted) setQrDataUrl(url);
      });
      setDecodedTags(decodeZatcaTlvBase64(base64Payload));
    }
    return () => {
      isMounted = false;
    };
  }, [base64Payload, size]);

  const handleCopy = () => {
    navigator.clipboard.writeText(base64Payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `ZATCA-QR-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className={`bg-white/60 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 text-right ${className}`} dir="rtl">
      
      {/* Header with ZATCA Badge */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white">{title}</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 text-[10px] font-bold">
          <CheckCircle2 className="w-3 h-3" />
          <span>معتمد هيئة الزكاة</span>
        </div>
      </div>

      {/* QR Display Area */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-5 my-2">
        <div className="relative group p-2 bg-white rounded-xl shadow-lg border border-slate-200 shrink-0">
          {qrDataUrl ? (
            <img 
              src={qrDataUrl} 
              alt="ZATCA Fatoora QR Code" 
              style={{ width: size, height: size }}
              className="rounded-lg object-contain"
            />
          ) : (
            <div 
              style={{ width: size, height: size }} 
              className="flex items-center justify-center bg-slate-100 text-slate-500 dark:text-slate-400 animate-pulse rounded-lg"
            >
              <QrCode className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Action Controls & Fast Summary */}
        <div className="flex-1 w-full space-y-2 text-xs">
          <div className="bg-slate-50/80 dark:bg-slate-950/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span className="font-sans font-bold">الترميز المعتمد:</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">TLV (Base64)</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span className="font-sans font-bold">عدد الوسوم:</span>
              <span className="text-slate-700 dark:text-slate-200">{decodedTags.length} حقول إلزامية</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span className="font-sans font-bold">حالة الفاتورة:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">مبسطة (B2C)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {showInspector && (
              <button
                type="button"
                onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-[11px] cursor-pointer"
              >
                {isInspectorOpen ? <EyeOff className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /> : <Eye className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                <span>{isInspectorOpen ? 'إخفاء الفحص' : 'فحص بيانات TLV'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl transition cursor-pointer"
              title="تحميل صورة الرمز (PNG)"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl transition cursor-pointer"
              title="نسخ نص الـ Base64"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {copied && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold text-center animate-in fade-in">
              تم نسخ كود Base64 المشفر إلى الحافظة!
            </p>
          )}
        </div>
      </div>

      {/* Expanded TLV Inspector */}
      {isInspectorOpen && (
        <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              محتويات وسوم هيئة الزكاة (ZATCA TLV Tags Decoder):
            </span>
          </div>

          <div className="space-y-1.5 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
            {decodedTags.map((item) => (
              <div 
                key={item.tag} 
                className="flex items-start justify-between gap-3 p-1.5 border-b border-slate-200 dark:border-slate-900 last:border-0 hover:bg-white/50 dark:hover:bg-slate-900/50 rounded"
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-mono text-[9px] flex items-center justify-center font-bold">
                    {item.tag}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-bold">{item.tagNameAr}:</span>
                </div>
                <span className="text-slate-800 dark:text-slate-100 font-mono text-left break-all font-bold" dir="ltr">
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* Raw Base64 string viewer */}
          <div className="mt-2 bg-slate-50/60 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-500 break-all" dir="ltr">
            <span className="text-slate-500 dark:text-slate-400 font-sans block mb-0.5">Raw Encoded Base64:</span>
            {base64Payload}
          </div>
        </div>
      )}

    </div>
  );
}
