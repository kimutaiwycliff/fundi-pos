import type { Product } from './page';

export interface CartLine {
  product: Product;
  quantity: number;
  // A flat currency amount off this line's subtotal (not a percentage) -
  // mirrors apps/desktop/src/Till.tsx's CartLine.discountAmount.
  discountAmount: number;
}

export type TenderType = 'cash' | 'mpesa' | 'credit';
