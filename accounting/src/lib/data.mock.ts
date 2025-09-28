import type { IncomeRecord, ExpenseRecord, ReceiptRecord, ContractRecord, RegistrationDoc } from './types'

export const mockIncomes: IncomeRecord[] = [
  { id: 'i1', userId: 'u1', dateIso: '2025-01-10', amountMinor: 49900, currency: 'RUB', operation: 'subscription', paymentSystemFeeMinor: 299 },
  { id: 'i2', userId: 'u2', dateIso: '2025-01-22', amountMinor: 19900, currency: 'RUB', operation: 'donation', paymentSystemFeeMinor: 199 },
  { id: 'i3', userId: 'u1', dateIso: '2025-02-02', amountMinor: 99900, currency: 'RUB', operation: 'subscription', paymentSystemFeeMinor: 599 },
  { id: 'i4', userId: 'u3', dateIso: '2025-02-16', amountMinor: 29900, currency: 'RUB', operation: 'inapp_currency', paymentSystemFeeMinor: 199 },
  { id: 'i5', userId: 'u4', dateIso: '2025-03-05', amountMinor: 149900, currency: 'RUB', operation: 'subscription', paymentSystemFeeMinor: 899 },
]

export const mockExpenses: ExpenseRecord[] = [
  { id: 'e1', counterparty: 'ООО Реклама', dateIso: '2025-01-31', amountMinor: 250000, currency: 'RUB', category: 'Маркетинг', documentRef: 'Акт №5' },
  { id: 'e2', counterparty: 'ИП Иванов', dateIso: '2025-02-20', amountMinor: 120000, currency: 'RUB', category: 'Аутсорс-разработка', documentRef: 'Акт №12' },
  { id: 'e3', counterparty: 'АО Банк', dateIso: '2025-02-28', amountMinor: 50000, currency: 'RUB', category: 'Эквайринг', documentRef: 'Выписка' },
]

export const mockReceipts: ReceiptRecord[] = [
  { id: 'r1', paymentId: 'i1', dateIso: '2025-01-10', url: '#' },
  { id: 'r2', paymentId: 'i3', dateIso: '2025-02-02', url: '#' },
]

export const mockContracts: ContractRecord[] = [
  { id: 'c1', title: 'Публичная оферта', version: 'v2.1', dateIso: '2025-01-01', url: '#', type: 'public_offer' },
  { id: 'c2', title: 'Пользовательское соглашение', version: 'v1.4', dateIso: '2025-01-01', url: '#', type: 'user_agreement' },
]

export const mockRegDocs: RegistrationDoc[] = [
  { id: 'd1', type: 'registration_certificate', title: 'Свидетельство о регистрации', dateIso: '2024-12-20', url: '#' },
  { id: 'd2', type: 'tax_notification', title: 'Уведомление о постановке на учет', dateIso: '2024-12-22', url: '#' },
  { id: 'd3', type: 'bank_agreement', title: 'Договор с банком', dateIso: '2025-01-05', url: '#' },
]


