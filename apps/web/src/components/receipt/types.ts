export type ReceiptLine = {
  label: string;
  quantity: number;
  lineTotal: number;
};

export type ReceiptData = {
  orderId: string;
  createdAt: string;
  cashierLabel: string;
  customerLabel: string | null;
  lines: ReceiptLine[];
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: 'cash' | 'mpesa' | 'card' | 'credit';
  isUnpaidCredit: boolean;
  isSettledCredit: boolean;
  settledAtLabel: string | null;
};

export type TenantReceiptInfo = {
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

export const TENDER_LABEL: Record<ReceiptData['tenderType'], string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  credit: 'Credit (pay later)',
};
