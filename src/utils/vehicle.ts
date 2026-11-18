import type { Invoice, VehicleInfo } from '../types';

/** نشاط البنشر وتغيير الزيوت والكفرات */
export const isAutoActivity = (activityType?: string) => activityType === 'auto';

export const hasVehicle = (v?: VehicleInfo | null): v is VehicleInfo =>
  !!v && !!((v.plate || '').trim() || (v.model || '').trim() || v.km || v.nextKm || (v.nextDate || '').trim());

export const cleanVehicle = (v: VehicleInfo): VehicleInfo | undefined => {
  const out: VehicleInfo = {};
  if ((v.plate || '').trim()) out.plate = v.plate!.trim();
  if ((v.model || '').trim()) out.model = v.model!.trim();
  if (v.km && v.km > 0) out.km = Math.round(v.km);
  if (v.nextKm && v.nextKm > 0) out.nextKm = Math.round(v.nextKm);
  if ((v.nextDate || '').trim()) out.nextDate = v.nextDate!.trim();
  return hasVehicle(out) ? out : undefined;
};

const normPlate = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** آخر زيارة لنفس اللوحة (لتعبئة الموديل وعرض آخر قراءة عداد) */
export function lastVisit(invoices: Invoice[], plate: string): Invoice | undefined {
  const k = normPlate(plate || '');
  if (k.length < 2) return undefined;
  return invoices.find((i) => i.docType !== 'return' && i.vehicle?.plate && normPlate(i.vehicle.plate) === k);
}

/** أسطر بيانات المركبة للطباعة */
export function vehicleRows(v: VehicleInfo, bilingual = false): [string, string][] {
  const L = (ar: string, en: string) => (bilingual ? `${ar} / ${en}` : ar);
  const rows: [string, string][] = [];
  if (v.plate) rows.push([L('رقم اللوحة', 'Plate'), v.plate]);
  if (v.model) rows.push([L('السيارة', 'Vehicle'), v.model]);
  if (v.km) rows.push([L('العداد', 'Odometer'), `${v.km.toLocaleString('en-US')} km`]);
  if (v.nextKm) rows.push([L('تغيير الزيت القادم', 'Next oil change'), `${v.nextKm.toLocaleString('en-US')} km`]);
  if (v.nextDate) rows.push([L('موعد الصيانة القادم', 'Next service'), v.nextDate]);
  return rows;
}
