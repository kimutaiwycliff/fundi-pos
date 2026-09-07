import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { API_BASE_URL } from './auth';

// Same three Payload REST endpoints apps/mobile/src/admin/ReportsScreen.tsx
// already calls, via tauriFetch instead of plain fetch (see auth.ts's own
// note on why - CORS from the Tauri webview). Response shapes are copied
// from that screen's own interfaces, which mirror what the endpoints
// actually return.

export type Range = 'today' | '7d' | '30d' | 'all';

export interface PaymentBreakdown {
  cash: number;
  mpesa: number;
  card: number;
  credit: number;
}
export interface TopProduct {
  name: string;
  revenue: number;
  quantity: number;
}
export interface ByStore {
  store: number;
  revenue: number;
  orderCount: number;
}
export interface ByCategory {
  category: string;
  revenue: number;
  quantity: number;
}
export interface ByCashier {
  cashier: number;
  name: string;
  revenue: number;
  orderCount: number;
}
export interface Comparison {
  totalSales: number;
  orderCount: number;
  profitTotal: number | null;
}
export interface SalesSummary {
  totalSales: number;
  discountGivenTotal: number;
  orderCount: number;
  averageOrderValue: number;
  profitTotal: number | null;
  paymentBreakdown: PaymentBreakdown;
  topProducts: TopProduct[];
  byStore: ByStore[];
  byCategory: ByCategory[];
  byCashier: ByCashier[];
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
  comparison: Comparison | null;
}
export interface DailyPoint {
  date: string;
  totalSales: number;
  orderCount: number;
  voidedCount: number;
  refundedCount: number;
}
export interface StockValue {
  potentialRevenue: number;
  stockValue: number | null;
  potentialProfit: number | null;
}

export async function fetchSalesSummary(payloadToken: string, range: Range): Promise<SalesSummary> {
  const res = await tauriFetch(`${API_BASE_URL}/api/reports/sales-summary?range=${range}`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  return res.json();
}

export async function fetchSalesDaily(payloadToken: string, range: '7d' | '30d'): Promise<DailyPoint[]> {
  const res = await tauriFetch(`${API_BASE_URL}/api/reports/sales-daily?range=${range}`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  const body = await res.json().catch(() => null);
  return body?.days ?? [];
}

export async function fetchStockValue(payloadToken: string): Promise<StockValue> {
  const res = await tauriFetch(`${API_BASE_URL}/api/reports/stock-value`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  return res.json();
}
