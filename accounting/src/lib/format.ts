export function formatMoneyFromMinor(amountMinor: number, currency: 'RUB' | 'USD' | 'EUR' = 'RUB'): string {
  const amount = Math.round(amountMinor) / 100;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(amount);
}

export function parseISO(dateIso: string): Date {
  return new Date(dateIso);
}

export function ymKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}


