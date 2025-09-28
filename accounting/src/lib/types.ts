export type CurrencyCode = 'RUB' | 'USD' | 'EUR';

export type OperationKind = 'subscription' | 'donation' | 'inapp_currency' | 'other';

export interface IncomeRecord {
  id: string;
  userId: string;
  dateIso: string; // ISO 8601
  amountMinor: number; // amount in minor units (e.g. kopecks)
  currency: CurrencyCode;
  operation: OperationKind;
  paymentSystemFeeMinor?: number; // fee in minor units
  note?: string;
}

export interface ExpenseRecord {
  id: string;
  counterparty: string;
  dateIso: string;
  amountMinor: number;
  currency: CurrencyCode;
  category: string;
  documentRef?: string; // invoice/act number
  note?: string;
}

export interface ReceiptRecord {
  id: string;
  paymentId: string;
  dateIso: string;
  url: string; // link to receipt
}

export interface ContractRecord {
  id: string;
  title: string;
  version?: string;
  dateIso: string;
  url: string;
  type: 'public_offer' | 'user_agreement' | 'vendor' | 'bank' | 'psp';
}

export interface RegistrationDoc {
  id: string;
  type: 'registration_certificate' | 'tax_notification' | 'bank_agreement';
  title: string;
  dateIso?: string;
  url: string;
}

export interface LedgerEntry {
  id: string;
  dateIso: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
}

export interface MonthlyStat {
  year: number;
  month: number; // 1..12
  incomeMinor: number;
  expenseMinor: number;
}

export interface Totals {
  incomeMinor: number;
  expenseMinor: number;
}

export interface GroupedStats {
  totalsAllTime: Totals;
  totalsThisMonth: Totals;
  byMonth: MonthlyStat[];
  byYear: { year: number; incomeMinor: number; expenseMinor: number }[];
}

export interface IdMap<T> { [id: string]: T }


