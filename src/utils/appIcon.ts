/**
 * أيقونة البرنامج القابلة للتغيير من الإعدادات.
 *  - default: أيقونة «الدفتر الذكي»
 *  - logo: شعار المنشأة من إعدادات المنشأة
 *  - custom: صورة يرفعها المستخدم (تُحفظ PNG مربعة 256×256)
 */
export interface AppIconSetting {
  mode: 'default' | 'logo' | 'custom';
  custom?: string;
}
export const defaultAppIconSetting: AppIconSetting = { mode: 'default' };

/** يحوّل أي صورة (PNG/JPG/SVG/WebP) إلى PNG مربعة: تُوضع كاملة في المنتصف بلا قص */
export function toSquarePng(src: string, size = 256): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d')!;
        const w = img.naturalWidth || size, h = img.naturalHeight || size;
        const scale = Math.min(size / w, size / h);
        const dw = w * scale, dh = h * scale;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null); // صورة من موقع خارجي تمنع القراءة
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * تصغير صورة الصنف قبل حفظها: أطول ضلع 480 بكسل، JPEG بجودة 0.82 على خلفية بيضاء.
 * صورة جوال بحجم 4 ميجا تصبح ~40 كيلوبايت — مهم مع آلاف الأصناف (الحفظ والتحميل والذاكرة).
 * إن فشل التصغير نرجع الصورة الأصلية كما هي.
 */
export function compressProductImage(src: string, maxSide = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return resolve(src);
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', quality);
        resolve(out.length < src.length ? out : src);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
