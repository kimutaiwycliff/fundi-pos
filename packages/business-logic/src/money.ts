// All currency math is rounded to 2 decimal places at each boundary to avoid
// floating-point drift compounding across many line items in a single order.
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
