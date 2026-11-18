/** تاريخ ووقت الطباعة (يُكتب بخط صغير أسفل صفحات A4) */
export function printStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** مربّع هامش الصفحة (CSS ‎@page) بتاريخ الطباعة */
export const printStampCss = (d = new Date()) =>
  `@bottom-right { content: "تاريخ الطباعة: ${printStamp(d)}"; font: 8px Tahoma, Arial, sans-serif; color: #555; }`;
