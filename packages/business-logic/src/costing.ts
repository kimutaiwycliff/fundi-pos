import { roundCurrency } from './money.ts';

// Weighted-average costing (spec Section 6.2 leaves FIFO vs. weighted-average
// open; weighted-average is the default — see build plan for rationale).
// Only restocks (positive StockMovements with reason 'restock') move the
// average; sales/write-offs consume at the current average without changing it.
export interface CostBasis {
  quantityOnHand: number;
  averageCost: number;
}

export function applyRestock(
  basis: CostBasis,
  incomingQuantity: number,
  incomingUnitCost: number,
): CostBasis {
  if (incomingQuantity <= 0) {
    throw new Error(`incomingQuantity must be > 0, got ${incomingQuantity}`);
  }
  const existingValue = basis.quantityOnHand * basis.averageCost;
  const incomingValue = incomingQuantity * incomingUnitCost;
  const newQuantity = basis.quantityOnHand + incomingQuantity;
  const newAverageCost =
    newQuantity === 0 ? 0 : roundCurrency((existingValue + incomingValue) / newQuantity);
  return { quantityOnHand: newQuantity, averageCost: newAverageCost };
}

export function applyConsumption(basis: CostBasis, quantityConsumed: number): CostBasis {
  if (quantityConsumed <= 0) {
    throw new Error(`quantityConsumed must be > 0, got ${quantityConsumed}`);
  }
  return {
    quantityOnHand: basis.quantityOnHand - quantityConsumed,
    averageCost: basis.averageCost,
  };
}

export function costOfGoodsSold(basis: CostBasis, quantitySold: number): number {
  return roundCurrency(basis.averageCost * quantitySold);
}
