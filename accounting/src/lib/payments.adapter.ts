import type { PaymentRow } from './payments'
import type { IncomeRecord } from './types'

// Convert payments table rows into IncomeRecord[] assuming currency RUB and amount in rubles
export function paymentsToIncome(records: PaymentRow[]): IncomeRecord[] {
  return (records || []).filter(r => (r?.status || '').toLowerCase() === 'succeeded').map(r => ({
    id: r.id,
    userId: r.user_id || 'unknown',
    dateIso: r.captured_at || new Date().toISOString(),
    amountMinor: Math.round(Number(r.amount_rub || 0) * 100),
    currency: (r.currency || 'RUB').toUpperCase() as any,
    operation: r.type === 'plan' ? 'subscription' : (r.type === 'gems' ? 'inapp_currency' : 'other'),
    paymentSystemFeeMinor: undefined,
    note: r.product_id || undefined,
  }))
}


