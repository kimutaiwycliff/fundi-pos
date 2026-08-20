import { roundCurrency } from './money.ts';

// Kenyan retail convention (and the default for this POS): sellPrice is
// VAT-inclusive — the shelf price already contains the tax. `computeTax`
// extracts the tax portion from a tax-inclusive gross amount rather than
// adding tax on top, unless `mode: 'exclusive'` is passed explicitly.
export type TaxMode = 'inclusive' | 'exclusive';

export interface TaxResult {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
}

export function computeTax(
  amount: number,
  taxRate: number,
  mode: TaxMode = 'inclusive',
): TaxResult {
  if (taxRate < 0) {
    throw new Error(`taxRate must be >= 0, got ${taxRate}`);
  }

  if (mode === 'inclusive') {
    const grossAmount = roundCurrency(amount);
    const netAmount = roundCurrency(grossAmount / (1 + taxRate));
    const taxAmount = roundCurrency(grossAmount - netAmount);
    return { netAmount, taxAmount, grossAmount };
  }

  const netAmount = roundCurrency(amount);
  const taxAmount = roundCurrency(netAmount * taxRate);
  const grossAmount = roundCurrency(netAmount + taxAmount);
  return { netAmount, taxAmount, grossAmount };
}
