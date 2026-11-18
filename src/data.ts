import { CompanySettings, Product, Customer, Invoice, CurrencyConfig, ProductGroup } from './types';

// لا شعار افتراضي: يرفع صاحب المنشأة شعاره من الإعدادات
export const defaultCompanyLogoAsset = '';

export const initialProductGroups: ProductGroup[] = [];

export const defaultCurrencies: CurrencyConfig[] = [
  {
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbol: '﷼',
    exchangeRate: 1.0,
    isBase: true,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'USD',
    nameAr: 'دولار أمريكي',
    nameEn: 'US Dollar',
    symbol: '$',
    exchangeRate: 3.75, // 1 USD = 3.75 SAR
    isBase: false,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'EUR',
    nameAr: 'يورو أوروبي',
    nameEn: 'Euro',
    symbol: '€',
    exchangeRate: 4.12, // 1 EUR = 4.12 SAR
    isBase: false,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'AED',
    nameAr: 'درهم إماراتي',
    nameEn: 'UAE Dirham',
    symbol: 'د.إ',
    exchangeRate: 1.02, // 1 AED = 1.02 SAR
    isBase: false,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'KWD',
    nameAr: 'دينار كويتي',
    nameEn: 'Kuwaiti Dinar',
    symbol: 'د.ك',
    exchangeRate: 12.25, // 1 KWD = 12.25 SAR
    isBase: false,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'BHD',
    nameAr: 'دينار بحريني',
    nameEn: 'Bahraini Dinar',
    symbol: 'د.ب',
    exchangeRate: 9.95, // 1 BHD = 9.95 SAR
    isBase: false,
    isEnabled: false,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'OMR',
    nameAr: 'ريال عماني',
    nameEn: 'Omani Rial',
    symbol: 'ر.ع',
    exchangeRate: 9.75, // 1 OMR = 9.75 SAR
    isBase: false,
    isEnabled: false,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'QAR',
    nameAr: 'ريال قطري',
    nameEn: 'Qatari Riyal',
    symbol: 'ر.ق',
    exchangeRate: 1.03, // 1 QAR = 1.03 SAR
    isBase: false,
    isEnabled: false,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'EGP',
    nameAr: 'جنيه مصري',
    nameEn: 'Egyptian Pound',
    symbol: 'ج.م',
    exchangeRate: 0.077, // 1 EGP = 0.077 SAR
    isBase: false,
    isEnabled: true,
    lastUpdated: '2026-09-23 12:00',
  },
  {
    code: 'GBP',
    nameAr: 'جنيه إسترليني',
    nameEn: 'British Pound',
    symbol: '£',
    exchangeRate: 4.88, // 1 GBP = 4.88 SAR
    isBase: false,
    isEnabled: false,
    lastUpdated: '2026-09-23 12:00',
  },
];

export const initialProducts: Product[] = [];

export const initialCustomers: Customer[] = [];

export const initialInvoices: Invoice[] = [];

export const defaultCompanySettings: CompanySettings = {
  companyName: '',
  address: '',
  phone: '',
  mobile: '',
  vatNumber: '',
  grNumber: '',
  moNumber: '',
  footer: 'شكراً لتسوقكم معنا - نأمل زيارتكم مجدداً',
  taxRate: 15,
  activityType: 'restaurant',
  logoUrl: '',
  printerSettings: {
    cashierPrinter: '',
    kitchenPrinter: ''
  },
  multiCurrency: {
    enabled: false,
    baseCurrency: 'SAR',
    currencies: defaultCurrencies,
  },
};
