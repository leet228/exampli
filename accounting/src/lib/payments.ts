import { supabase } from './supabase'

export interface PaymentRow {
  id: string
  user_id: string | null
  type: 'gems' | 'plan' | string
  product_id: string | null
  amount_rub: number | null
  currency: string | null
  status: string | null
  test: boolean | null
  payment_method: any | null
  metadata: any | null
  captured_at: string | null
}

export async function fetchPayments(limit = 1000): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}


