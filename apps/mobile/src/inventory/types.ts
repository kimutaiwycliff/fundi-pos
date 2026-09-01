export interface StockLevel {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_label: string | null;
  sku: string;
  reorder_point: number;
  quantity: number;
}

export function isLowStock(level: Pick<StockLevel, 'quantity' | 'reorder_point'>): boolean {
  return level.reorder_point > 0 && level.quantity <= level.reorder_point;
}
