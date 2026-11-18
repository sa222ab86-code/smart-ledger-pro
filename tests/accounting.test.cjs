'use strict';
const assert = require('node:assert');
module.exports = async function () {
const A = require(require('node:path').join(process.env.SL_ROOT, 'src/utils/accounting.ts'));
const st = { ...A.DEFAULT_ACCT_SETTINGS, cashMap: { m2: 'acc-5220' } };
const inv = [
  { id: 'i1', number: 'INV-1', date: '2026-11-01 10:00:00', customerName: 'عميل عام', items: [{ productId: 'p1', name: 'شاي', qty: 2, price: 50, tax: 15, total: 115, cost: 30 }], subtotal: 100, tax: 15, total: 115, paymentMethod: 'cash' },
  { id: 'i2', number: 'INV-2', date: '2026-11-02 11:00:00', customerId: 'c1', customerName: 'أحمد', items: [{ productId: 'p1', name: 'شاي', qty: 4, price: 50, tax: 30, total: 230 }], subtotal: 200, tax: 30, total: 230, paymentMethod: 'cash', remainingAmount: 80, paymentStatus: 'partial',
    payments: [{ id: 'a', date: '2026-11-02 11:00:00', amount: 100, method: 'card' }, { id: 'b', date: '2026-11-05 09:00:00', amount: 50, method: 'cash' }] },
  { id: 'i3', number: 'INV-3', date: '2026-11-03 12:00:00', customerName: 'عميل عام', items: [{ name: 'خدمة', qty: 1, price: 100, tax: 15, total: 115 }], subtotal: 100, tax: 15, total: 115, paymentMethod: 'split',
    payments: [{ id: 'c', date: '2026-11-03 12:00:00', amount: 50, method: 'cash' }, { id: 'k', date: '2026-11-03 12:00:00', amount: 65, method: 'card' }] },
  { id: 'r1', docType: 'return', number: 'RET-1', originalInvoiceNumber: 'INV-1', date: '2026-11-04 10:00:00', customerName: 'عميل عام', items: [{ productId: 'p1', name: 'شاي', qty: -1, price: 50, tax: 7.5, total: -57.5, cost: 30 }], subtotal: -50, tax: -7.5, total: -57.5, paymentMethod: 'cash', restocked: true },
  { id: 'r2', docType: 'return', number: 'RET-2', originalInvoiceNumber: 'INV-2', date: '2026-11-06 10:00:00', customerId: 'c1', customerName: 'أحمد', items: [{ productId: 'p1', name: 'شاي', qty: -1, price: 50, tax: 7.5, total: -57.5 }], subtotal: -50, tax: -7.5, total: -57.5, paymentMethod: 'cash', debtOffset: 57.5, restocked: false },
];
const purchases = [{ id: 'pu1', supplierId: 's1', supplierName: 'مورد', date: '2026-10-30 08:00:00', items: [], subtotal: 1000, vat: 150, total: 1150, supplierInvoiceNo: 'S-9' }];
const purchaseReturns = [{ id: 'pr1', number: 'PR-1', supplierId: 's1', supplierName: 'مورد', date: '2026-11-07', items: [], subtotal: 100, vat: 15, total: 115 }];
const cashMovements = [
  { id: 'm1', date: '2026-11-01 08:00:00', type: 'in', amount: 300, reason: 'عهدة', kind: 'float' },
  { id: 'm2', date: '2026-11-02 08:00:00', type: 'out', amount: 200, reason: 'إيجار' },
  { id: 'm3', date: '2026-11-02 23:00:00', type: 'out', amount: 5, reason: 'عجز', kind: 'diff' },
];
const products = [{ id: 'p1', nameAr: 'شاي', price: 50, cost: 30, stock: 10, damageLog: [{ date: '2026-11-08', qty: 2, cost: 30 }] }];
const journalEntries = [
  { id: 'j1', number: 'OB-000001', date: '2026-10-01', kind: 'opening', memo: 'افتتاحي', createdAt: '', lines: [{ accountId: 'acc-1110', debit: 5000, credit: 0 }, { accountId: 'acc-3100', debit: 0, credit: 5000 }] },
  { id: 'j2', number: 'PV-000001', date: '2026-11-09', kind: 'payment', memo: 'سداد مورد', createdAt: '', lines: [{ accountId: 'acc-2110', debit: 500, credit: 0, partyType: 'supplier', partyId: 's1', partyName: 'مورد' }, { accountId: 'acc-1120', debit: 0, credit: 500 }] },
];
const src = { invoices: inv, purchases, purchaseReturns, cashMovements, products, journalEntries };
const L = A.buildLedger(src, st, { productCost: new Map([['p1', 30]]) });
for (const e of L) { const t = A.lineTotals(e.lines); assert.ok(Math.abs(t.diff) < 0.005, `unbalanced ${e.id} ${JSON.stringify(t)}`); }
console.log('entries:', L.length, L.map((e) => e.kind).join(','));
const bal = A.computeBalances(L);
const net = (id) => A.closingNet(bal.get(id));
// العملاء: 230 − 100 − 50 − 57.5 = 22.5
assert.strictEqual(net('acc-1130'), 22.5);
// الموردون: 1150 − 115 − 500 = 535 دائن
assert.strictEqual(-net('acc-2110'), 535);
// الصندوق: 5000 + 115 + 50 (تحصيل) + 50 (مقسّم) − 57.5 (رد) − 200 − 5 = 4952.5
assert.strictEqual(net('acc-1110'), 4952.5);
assert.strictEqual(net('acc-1125'), 165); // شبكة 100 + 65
assert.strictEqual(net('acc-5220'), 200); // الإيجار مُصنَّف
// المخزون: 1000 − 100 − 60 − 120 (تكلفة INV-2 من تكلفة الصنف) + 30 (مرتجع مُعاد) − 60 (تالف)
assert.strictEqual(net('acc-1140'), 1000 - 100 - 60 - 120 + 30 - 60);
const tb = A.trialBalanceReport(A.DEFAULT_ACCOUNTS, L);
console.log('TB', tb.totals.join(' | '), tb.summary.at(-1).value); assert.ok(tb.summary.at(-1).value.includes('✓'));
const bs = A.balanceSheetReport(A.DEFAULT_ACCOUNTS, L);
console.log('BS', JSON.stringify(bs.figures)); assert.ok(Math.abs(bs.figures.diff) < 0.01);
const is = A.incomeStatementReport(A.DEFAULT_ACCOUNTS, L, '2026-11-01', '2026-11-30', st);
console.log('IS'); for (const r of is.rows) console.log('   ', r.join(' | '));
const F = A.incomeFigures(A.DEFAULT_ACCOUNTS, L, '2026-11-01', '2026-11-30', st);
// الإيرادات 100+200+100 − 50 − 50 = 300 ؛ التكلفة 60+120−30 = 150 ؛ المصروفات 200+5+60 = 265
assert.deepStrictEqual(F, { revenue: 300, cogs: 150, gross: 150, expenses: 265, net: -115 });
const stmt = A.accountStatementReport(A.DEFAULT_ACCOUNTS, L, { accountId: 'acc-1130', partyId: 'c1' }, '2026-11-01', '2026-11-30');
console.log('statement c1'); for (const r of stmt.rows) console.log('   ', r.join(' | '));
const parties = A.partyBalancesReport(A.DEFAULT_ACCOUNTS, L, 'supplier', st);
console.log('suppliers', parties.rows);
// قيد غير متوازن / فترة مقفلة / حساب تجميعي
assert.ok(A.validateEntry({ date: '2026-11-01', lines: [{ accountId: 'acc-1110', debit: 10, credit: 0 }, { accountId: 'acc-4200', debit: 0, credit: 9 }] }, A.DEFAULT_ACCOUNTS).some((e) => e.includes('غير متوازن')));
assert.ok(A.validateEntry({ date: '2026-11-01', lines: [{ accountId: 'acc-1110', debit: 10, credit: 0 }, { accountId: 'acc-4200', debit: 0, credit: 10 }] }, A.DEFAULT_ACCOUNTS, '2026-11-30').some((e) => e.includes('مقفلة')));
assert.ok(A.validateEntry({ date: '2026-12-01', lines: [{ accountId: 'acc-11', debit: 10, credit: 0 }, { accountId: 'acc-4200', debit: 0, credit: 10 }] }, A.DEFAULT_ACCOUNTS).some((e) => e.includes('تجميعي')));
assert.deepStrictEqual(A.validateEntry({ date: '2026-12-01', lines: [{ accountId: 'acc-1110', debit: 10, credit: 0 }, { accountId: 'acc-4200', debit: 0, credit: 10 }] }, A.DEFAULT_ACCOUNTS), []);
assert.strictEqual(A.nextEntryNumber(journalEntries, 'payment'), 'PV-000002');
assert.strictEqual(A.stockValuation(products), 300);
// أداء: 50 ألف فاتورة
const big = Array.from({ length: 50000 }, (_, i) => ({ ...inv[i % 3], id: 'b' + i, date: `2026-${String(1 + (i % 12)).padStart(2, '0')}-10 10:00:00` }));
let t = Date.now(); const LB = A.buildLedger({ ...src, invoices: big }, st); const tb2 = A.trialBalanceReport(A.DEFAULT_ACCOUNTS, LB); const bs2 = A.balanceSheetReport(A.DEFAULT_ACCOUNTS, LB);
console.log('50k invoices →', LB.length, 'entries in', Date.now() - t, 'ms; balanced:', tb2.summary.at(-1).value, bs2.summary.at(-1).value);
assert.ok(Math.abs(bs2.figures.diff) < 0.01);
console.log('المحاسبة: نجحت');
};
