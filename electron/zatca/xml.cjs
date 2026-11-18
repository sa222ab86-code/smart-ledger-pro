'use strict';
/**
 * بنّاء XML يُخرج النص مباشرة بالصيغة القياسية C14N (بلا مسافات بين العناصر):
 *  - تعريفات النطاقات أولاً (الافتراضي ثم حسب البادئة)، ثم السمات مرتبة أبجدياً
 *  - العناصر الفارغة تُكتب <a></a>
 *  - الهروب حسب C14N
 * بهذا يكون نص الفاتورة نفسه هو صيغتها القياسية، وبصمة الفاتورة تُحسب منه مباشرة دون مكتبة XML.
 * (يُتحقق من ذلك في الاختبارات مقابل xmllint --c14n11)
 */

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

/** عنصر: el('cbc:ID', {schemeID:'CRN'}, 'value' | [children]) — undefined/null/false في الأبناء تُتجاهل */
function el(name, attrs, children) {
  if (attrs === undefined || typeof attrs === 'string' || typeof attrs === 'number' || Array.isArray(attrs)) {
    children = attrs; attrs = {};
  }
  return { name, attrs: attrs || {}, children: children === undefined || children === null ? [] : [].concat(children) };
}

function serialize(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return escText(node);
  const ns = Object.keys(node.attrs).filter((k) => k === 'xmlns' || k.startsWith('xmlns:'))
    .sort((a, b) => (a === 'xmlns' ? -1 : b === 'xmlns' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const plain = Object.keys(node.attrs).filter((k) => !(k === 'xmlns' || k.startsWith('xmlns:')))
    .filter((k) => node.attrs[k] !== undefined && node.attrs[k] !== null).sort();
  let s = `<${node.name}`;
  for (const k of ns) s += ` ${k}="${escAttr(node.attrs[k])}"`;
  for (const k of plain) s += ` ${k}="${escAttr(node.attrs[k])}"`;
  s += '>';
  for (const c of node.children) s += serialize(c);
  return s + `</${node.name}>`;
}

module.exports = { el, serialize, escText, escAttr };
