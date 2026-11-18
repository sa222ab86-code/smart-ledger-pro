/** بيانات تواصل المنشأة في المستندات: الجوال، الهاتف الثابت، البريد */
export interface ContactInfo { phone?: string; mobile?: string; email?: string }

export function contactParts(c: ContactInfo, bilingual = false): { label: string; value: string }[] {
  const L = (ar: string, en: string) => (bilingual ? `${ar} ${en}` : ar);
  const out: { label: string; value: string }[] = [];
  if ((c.mobile || '').trim()) out.push({ label: L('الجوال', 'Mobile'), value: c.mobile!.trim() });
  if ((c.phone || '').trim()) out.push({ label: L('الهاتف', 'Tel'), value: c.phone!.trim() });
  if ((c.email || '').trim()) out.push({ label: L('البريد', 'Email'), value: c.email!.trim() });
  return out;
}

/** سطر نصي واحد: «الجوال: … — الهاتف: … — البريد: …» */
export const contactLine = (c: ContactInfo, sep = ' — ') => contactParts(c).map((p) => `${p.label}: ${p.value}`).join(sep);
