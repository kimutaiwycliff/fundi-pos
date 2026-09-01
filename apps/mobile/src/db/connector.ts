import type { CrudEntry, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/common';
import { UpdateType } from '@powersync/common';
import { API_BASE_URL, POWERSYNC_URL, fetchPowerSyncToken } from '../lib/auth';
import type { CommonPowerSyncDatabase } from '@powersync/common';

// Ported from apps/desktop/src-tauri/src/connector.rs - same upload/credential
// protocol, but as an ordinary JS PowerSyncBackendConnector (RN's SDK can
// connect() directly from JS; Tauri's plugin can't - see desktop's
// powersync.ts for that constraint) instead of a Rust BackendConnector.
export class ApiConnector implements PowerSyncBackendConnector {
  private payloadToken: string;
  private storeId: number | null;

  constructor(payloadToken: string, storeId: number | null) {
    this.payloadToken = payloadToken;
    this.storeId = storeId;
  }

  /** Called from wherever the JS side refreshes the underlying Payload session JWT (mirrors desktop's refreshPayloadToken). */
  setPayloadToken(token: string): void {
    this.payloadToken = token;
  }

  setStoreId(storeId: number | null): void {
    this.storeId = storeId;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const token = await fetchPowerSyncToken(this.payloadToken, this.storeId);
    return { endpoint: POWERSYNC_URL, token };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;

    // The till always writes an order and its line items together in one
    // local writeTransaction, so both land in this same crud transaction -
    // group line items by their parent order id upfront so uploadOrder()
    // can assemble one nested POST instead of the two separate table rows
    // Postgres itself normalizes them into.
    const lineItemsByParent = groupLineItemsByParent(tx.crud);

    for (const entry of tx.crud) {
      if (entry.table === 'stock_movements') {
        await this.uploadStockMovement(entry);
      } else if (entry.table === 'orders') {
        const lineItems = lineItemsForOrder(entry, lineItemsByParent);
        await this.uploadOrder(entry, lineItems);
      } else if (entry.table === 'orders_line_items') {
        // Consumed above as part of its parent order - nothing to upload
        // independently.
      } else {
        // products/products_variants/stores/users/customers/
        // store_product_overrides are backoffice-managed reference data in
        // this app - there is no ingestion endpoint for tills to write them
        // back. Log and drop rather than blocking the upload queue forever.
        console.warn(`[connector] no upload handler for table '${entry.table}' (id=${entry.id}), dropping`);
      }
    }

    await tx.complete();
  }

  private async uploadOrder(entry: CrudEntry, lineItems: CrudEntry[]): Promise<void> {
    if (entry.op !== UpdateType.PUT) {
      // Orders are create-only from the till's perspective (refunds/voids
      // are manager-gated status transitions made server-side, not local
      // edits - see apps/api/src/collections/Orders.ts).
      console.warn(`[connector] ignoring non-insert change on orders id=${entry.id}`);
      return;
    }

    const body = buildOrderBody(entry, lineItems);
    await this.post('/api/sync/orders', body);
  }

  private async uploadStockMovement(entry: CrudEntry): Promise<void> {
    if (entry.op !== UpdateType.PUT) {
      // stock_movements is create-only in Payload (update: () => false,
      // delete: neverDelete) - the till never issues UPDATE/DELETE against
      // it, so this should not happen in practice.
      console.warn(`[connector] ignoring non-insert change on stock_movements id=${entry.id}`);
      return;
    }

    const data = entry.opData;
    if (!data) return;

    // Translate from local snake_case columns (mirroring Postgres) to the
    // camelCase Payload field names expected by the dedicated idempotent
    // ingestion route (apps/api/src/app/api/sync/stock-movements/route.ts),
    // which treats a duplicate client-generated `id` as a no-op success -
    // safe to retry.
    const body = {
      id: entry.id,
      tenant: data.tenant_id,
      store: data.store_id,
      product: toNumber(data.product_id),
      variant: data.variant,
      quantityDelta: data.quantity_delta,
      reason: data.reason,
      relatedOrder: data.related_order_id,
      clientTimestamp: data.client_timestamp,
      sourceTerminal: data.source_terminal,
    };

    await this.post('/api/sync/stock-movements', body);
  }

  private async post(path: string, body: unknown): Promise<void> {
    const url = `${API_BASE_URL}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${this.payloadToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} calling ${url}: ${responseBody}`);
    }
  }
}

// orders_line_items.product_id (and stock_movements.product_id) are
// declared column.integer in the local schema, mirroring Postgres's real
// INTEGER foreign key - but the value actually inserted at the till comes
// from a *different* local table's `id` column, which PowerSync always
// stores as TEXT (schema.ts's own documented rule). SQLite does not coerce
// that TEXT into the destination column's declared affinity for the
// CRUD-queue diff PowerSync uploads, so it round-trips here as a JSON
// string - which Payload's `product` relationship field then rejects
// outright, 500ing every retry and leaving the order permanently unsynced
// (confirmed live on desktop via a stuck ps_crud row).
function toNumber(value: unknown): unknown {
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

function groupLineItemsByParent(crud: CrudEntry[]): Map<string, CrudEntry[]> {
  const byParent = new Map<string, CrudEntry[]>();
  for (const entry of crud) {
    if (entry.table !== 'orders_line_items') continue;
    const parentId = entry.opData?._parent_id;
    if (typeof parentId !== 'string') continue;
    const existing = byParent.get(parentId);
    if (existing) {
      existing.push(entry);
    } else {
      byParent.set(parentId, [entry]);
    }
  }
  return byParent;
}

/** Sorts an order's line items back into the original cart order via the `_order` column (array index) - the crud transaction doesn't guarantee insertion order. */
function lineItemsForOrder(orderEntry: CrudEntry, byParent: Map<string, CrudEntry[]>): CrudEntry[] {
  const lineItems = byParent.get(orderEntry.id) ?? [];
  return [...lineItems].sort((a, b) => (Number(a.opData?._order) || 0) - (Number(b.opData?._order) || 0));
}

/** Assembles the nested JSON body /api/sync/orders expects from a local `orders` CrudEntry and its already-grouped/sorted `orders_line_items` entries. */
function buildOrderBody(entry: CrudEntry, lineItems: CrudEntry[]) {
  const data = entry.opData ?? {};

  const lineItemsJson = lineItems.map((li) => {
    const liData = li.opData ?? {};
    return {
      product: toNumber(liData.product_id),
      variant: liData.variant,
      quantity: liData.quantity,
      unitPrice: liData.unit_price,
      discount: liData.discount,
    };
  });

  // SQLite has no boolean type - the local `created_offline` column is
  // INTEGER 0/1, but Payload's checkbox field expects a real JSON boolean.
  const createdOffline = Number(data.created_offline) === 1;

  return {
    id: entry.id,
    tenant: data.tenant_id,
    store: data.store_id,
    terminal: data.terminal,
    terminalName: data.terminal_name,
    cashier: data.cashier_id,
    customer: toNumber(data.customer_id),
    lineItems: lineItemsJson,
    taxTotal: data.tax_total,
    discountTotal: data.discount_total,
    total: data.total,
    tenderType: data.tender_type,
    paymentStatus: data.payment_status,
    status: data.status,
    createdOffline,
  };
}
