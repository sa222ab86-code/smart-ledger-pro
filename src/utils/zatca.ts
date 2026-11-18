import QRCode from 'qrcode';

export interface ZatcaTlvData {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  totalWithVat: number | string;
  vatAmount: number | string;
}

export interface DecodedZatcaTag {
  tag: number;
  tagName: string;
  tagNameAr: string;
  value: string;
}

/**
 * Encodes a tag, length, and value into a byte array according to ZATCA standards
 * Tag: 1 byte (1-5)
 * Length: 1 byte (UTF-8 byte length)
 * Value: UTF-8 encoded bytes
 */
function getTlvTag(tagNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const length = valueBytes.length;

  const tagBytes = new Uint8Array(2 + length);
  tagBytes[0] = tagNumber;
  tagBytes[1] = length;
  tagBytes.set(valueBytes, 2);

  return tagBytes;
}

/**
 * Generates the official ZATCA Phase 1 compliant Base64 string from TLV tags:
 * Tag 1: Seller's Name (اسم المورد)
 * Tag 2: VAT Registration Number (الرقم الضريبي للمورد - 15 رقماً)
 * Tag 3: Time stamp (تاريخ ووقت الفاتورة بتنسيق ISO 8601)
 * Tag 4: Invoice Total with VAT (إجمالي الفاتورة شاملاً ضريبة القيمة المضافة)
 * Tag 5: VAT Total (مجموع ضريبة القيمة المضافة)
 */
export function generateZatcaTlvBase64(data: ZatcaTlvData): string {
  let formattedTime = data.timestamp || new Date().toISOString();
  
  // Format timestamp to ISO standard: YYYY-MM-DDTHH:mm:ss if it's "YYYY-MM-DD HH:mm:ss"
  if (formattedTime.includes(' ') && !formattedTime.includes('T')) {
    formattedTime = formattedTime.replace(' ', 'T');
  }
  if (formattedTime.length === 16) {
    formattedTime += ':00';
  }

  const cleanVat = (data.vatNumber || '300000000000003').replace(/\s/g, '');
  const cleanSeller = data.sellerName || 'مؤسسة تجارية';
  const cleanTotal = Number(data.totalWithVat || 0).toFixed(2);
  const cleanVatAmount = Number(data.vatAmount || 0).toFixed(2);

  const tags = [
    getTlvTag(1, cleanSeller),
    getTlvTag(2, cleanVat),
    getTlvTag(3, formattedTime),
    getTlvTag(4, cleanTotal),
    getTlvTag(5, cleanVatAmount)
  ];

  // Concatenate all tags
  const totalLength = tags.reduce((acc, tag) => acc + tag.length, 0);
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  for (const tag of tags) {
    combined.set(tag, offset);
    offset += tag.length;
  }

  // Convert to Base64
  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a ZATCA Base64 TLV string back into human readable tags for verification
 */
export function decodeZatcaTlvBase64(base64Str: string): DecodedZatcaTag[] {
  try {
    const binary = atob(base64Str.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const tagNames: Record<number, { en: string; ar: string }> = {
      1: { en: 'Seller Name', ar: 'اسم المورد' },
      2: { en: 'VAT Registration Number', ar: 'الرقم الضريبي للمنشأة' },
      3: { en: 'Invoice Timestamp', ar: 'تاريخ ووقت الفاتورة' },
      4: { en: 'Invoice Total (with VAT)', ar: 'إجمالي الفاتورة شامل الضريبة' },
      5: { en: 'VAT Total', ar: 'مجموع ضريبة القيمة المضافة' }
    };

    const result: DecodedZatcaTag[] = [];
    let index = 0;
    const decoder = new TextDecoder('utf-8');

    while (index < bytes.length) {
      const tag = bytes[index];
      const length = bytes[index + 1];
      if (index + 2 + length > bytes.length) break;

      const valueBytes = bytes.slice(index + 2, index + 2 + length);
      const value = decoder.decode(valueBytes);

      result.push({
        tag,
        tagName: tagNames[tag]?.en || `Tag ${tag}`,
        tagNameAr: tagNames[tag]?.ar || `الوسم ${tag}`,
        value
      });

      index += 2 + length;
    }

    return result;
  } catch (err) {
    console.error('Failed to decode ZATCA TLV Base64', err);
    return [];
  }
}

/**
 * Generates an official Z-Report closure payload Base64 conforming to audit requirements
 */
export interface ZReportData {
  reportNumber: string;
  sellerName: string;
  vatNumber: string;
  posTerminalId: string;
  cashierName: string;
  shiftStart: string;
  shiftEnd: string;
  totalCash: number;
  totalCard: number;
  subtotal: number;
  totalVat: number;
  grandTotal: number;
  invoicesCount: number;
}

export function generateZReportTlvBase64(data: ZReportData): string {
  // TLV structure extended for POS Z-Report audit:
  // Tag 1: Seller Name
  // Tag 2: VAT Number
  // Tag 3: Shift End Timestamp
  // Tag 4: Grand Total
  // Tag 5: Total VAT
  // Tag 6: Report Serial Number & Terminal ID
  // Tag 7: Invoices Count & Payment Breakdown
  const encoder = new TextEncoder();
  const makeTag = (tagNum: number, strVal: string) => {
    const valBytes = encoder.encode(strVal);
    const tagBytes = new Uint8Array(2 + valBytes.length);
    tagBytes[0] = tagNum;
    tagBytes[1] = valBytes.length;
    tagBytes.set(valBytes, 2);
    return tagBytes;
  };

  const tags = [
    makeTag(1, data.sellerName || 'مؤسسة تجارية'),
    makeTag(2, (data.vatNumber || '300000000000003').replace(/\s/g, '')),
    makeTag(3, data.shiftEnd || new Date().toISOString()),
    makeTag(4, data.grandTotal.toFixed(2)),
    makeTag(5, data.totalVat.toFixed(2)),
    makeTag(6, `${data.reportNumber}|POS:${data.posTerminalId}`),
    makeTag(7, `INV:${data.invoicesCount}|CASH:${data.totalCash.toFixed(2)}|CARD:${data.totalCard.toFixed(2)}`)
  ];

  const totalLength = tags.reduce((acc, tag) => acc + tag.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const tag of tags) {
    combined.set(tag, offset);
    offset += tag.length;
  }

  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Asynchronously generates a high-quality DataURL QR code image
 */
export async function generateQrDataUrl(
  content: string,
  options?: QRCode.QRCodeToDataURLOptions
): Promise<string> {
  try {
    return await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 260,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      ...options
    });
  } catch (err) {
    console.error('Error generating QR DataURL:', err);
    return '';
  }
}
