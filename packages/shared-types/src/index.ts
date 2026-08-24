// Shared domain types for Fundi.
// Mirrors the Payload collections defined in POS_SAAS_SPEC.md Section 4.
// Desktop (offline) and web (online) both import these so client and server
// agree on shape without duplicating definitions.

export type UUID = string;
export type ISODateString = string;

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface Tenant {
  id: UUID;
  name: string;
  subscriptionTier: string;
  billingStatus: 'active' | 'trialing' | 'past_due' | 'canceled';
}

export interface Store {
  id: UUID;
  tenant: UUID;
  name: string;
  address: string;
  timezone: string;
}

export interface User {
  id: UUID;
  tenant: UUID;
  store: UUID | null;
  role: UserRole;
  pinHash: string;
}

export interface ProductVariant {
  id: UUID;
  label: string; // e.g. "Red / L"
  sku: string;
  barcode: string | null;
}

export interface Product {
  id: UUID;
  tenant: UUID;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  variants: ProductVariant[];
  costPrice: number;
  sellPrice: number;
  taxRate: number;
  isBundle: boolean;
  bundleComponents: Array<{ product: UUID; quantity: number }>;
}

export interface StoreProductOverride {
  id: UUID;
  store: UUID;
  product: UUID;
  priceOverride: number | null;
  isAvailable: boolean;
}

export type StockMovementReason =
  | 'sale'
  | 'restock'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'write_off';

export interface StockMovement {
  id: UUID; // client-generated, idempotency key
  tenant: UUID;
  store: UUID;
  product: UUID;
  variant: UUID | null;
  quantityDelta: number; // positive = restock/return, negative = sale/write-off
  reason: StockMovementReason;
  relatedOrder: UUID | null;
  clientTimestamp: ISODateString;
  serverTimestamp: ISODateString | null;
  sourceTerminal: string;
}

export interface OrderLineItem {
  product: UUID;
  variant: UUID | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export type TenderType = 'cash' | 'mpesa' | 'card';
export type PaymentStatus = 'paid' | 'pending' | 'failed';
export type OrderStatus = 'completed' | 'refunded' | 'voided';
export type KraSubmissionStatus = 'not_applicable' | 'pending' | 'submitted' | 'failed';

export interface Order {
  id: UUID; // client-generated
  tenant: UUID;
  store: UUID;
  terminal: string;
  cashier: UUID;
  lineItems: OrderLineItem[];
  taxTotal: number;
  discountTotal: number;
  total: number;
  tenderType: TenderType;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdOffline: boolean;
  syncedAt: ISODateString | null;
  // KRA eTIMS fields (nullable until vendor certification is complete — see Phase 8)
  kraInvoiceNumber: string | null;
  kraQrCode: string | null;
  kraCuSerial: string | null;
  kraSubmissionStatus: KraSubmissionStatus;
}

export interface PurchaseOrderLineItem {
  product: UUID;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: UUID;
  tenant: UUID;
  store: UUID;
  supplier: UUID;
  lineItems: PurchaseOrderLineItem[];
  status: 'draft' | 'sent' | 'received';
  receivedAt: ISODateString | null;
}

export interface Supplier {
  id: UUID;
  tenant: UUID;
  name: string;
  contactInfo: string;
}

export interface StockTransferLineItem {
  product: UUID;
  quantity: number;
}

export interface StockTransfer {
  id: UUID;
  tenant: UUID;
  fromStore: UUID;
  toStore: UUID;
  lineItems: StockTransferLineItem[];
  status: 'draft' | 'in_transit' | 'received';
}

export interface Customer {
  id: UUID;
  tenant: UUID;
  name: string;
  phone: string;
  loyaltyPoints: number;
}

export interface SyncLog {
  id: UUID;
  terminal: string;
  lastSyncedAt: ISODateString;
  pendingCount: number;
  conflictCount: number;
}
