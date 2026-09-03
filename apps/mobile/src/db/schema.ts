// Local PowerSync SQLite schema for the Android till.
//
// Ported from apps/desktop/src/schema.ts, then corrected against a live
// `\d <table>` against docker-postgres-1 (desktop's version had drifted:
// missing products.is_active/image_id, products.max_discount_percent no
// longer exists (renamed max_discount_amount), missing products.reorder_point,
// missing customers.email, and several orders columns added since
// (loyalty_points_earned, settled_by_id, mpesa_checkout_request_id,
// pesapal_order_tracking_id)) and extended with products_variants, which
// desktop's schema doesn't have at all - see docker/powersync/sync-config.yaml
// for the corresponding new sync stream.
//
// Notes:
// - The `id` column is never declared here: PowerSync always adds it
//   implicitly as TEXT (see node_modules/@powersync/common's Table.validate(),
//   which throws if a custom `id` column is declared). Postgres integer PKs
//   are stringified automatically when synced; orders.id/stock_movements.id
//   are already client-generated UUID text columns in Postgres, so no
//   conversion happens there. products_variants.id is likewise already a
//   text column in Postgres (Payload's array-field row id).
// - Postgres `numeric` columns map to REAL (SQLite/PowerSync has no
//   fixed-point decimal type).
// - Postgres `boolean` columns map to INTEGER (0/1) - SQLite has no boolean
//   type and @powersync/common's `column` helper only exposes
//   text/integer/real.
// - Postgres `timestamp(3) with time zone` columns map to TEXT (ISO 8601
//   strings, as PowerSync's Postgres source connector serializes them).
// - Postgres enum columns (orders.tender_type/payment_status/status/
//   kra_submission_status, stock_movements.reason) map to TEXT.
import { column, Schema, Table } from '@powersync/common';

const tenants = new Table({
  name: column.text,
  receipt_header: column.text,
  receipt_footer: column.text,
  updated_at: column.text,
  created_at: column.text,
});

const products = new Table(
  {
    tenant_id: column.integer,
    sku: column.text,
    barcode: column.text,
    name: column.text,
    category: column.text,
    is_active: column.integer,
    cost_price: column.real,
    sell_price: column.real,
    tax_rate: column.real,
    max_discount_amount: column.real,
    reorder_point: column.real,
    is_bundle: column.integer,
    image_id: column.integer,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'] } },
);

// Variant sub-rows of Products (Payload normalizes the Products.variants
// array field into this child table, same _parent_id shape as
// orders_line_items below). Scoped tenant-only in sync-config.yaml, same as
// products itself - a variant's price/label isn't store-specific, only its
// stock is (tracked via stock_movements, keyed by this row's own id in that
// table's `variant` text column).
const products_variants = new Table(
  {
    _parent_id: column.integer,
    _order: column.integer,
    label: column.text,
    sku: column.text,
    barcode: column.text,
    sell_price: column.real,
    cost_price: column.real,
    image_id: column.integer,
    // Denormalized onto each row server-side specifically so this table's
    // PowerSync stream can filter without a join (PowerSync's sync rules
    // don't support them) - see docker/powersync/sync-config.yaml's own
    // note on this stream. Not otherwise used by any local query.
    tenant_id: column.integer,
  },
  { indexes: { parent: ['_parent_id'] } },
);

const stores = new Table(
  {
    tenant_id: column.integer,
    name: column.text,
    address: column.text,
    timezone: column.text,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'] } },
);

const users = new Table(
  {
    // Only the columns docker/powersync/sync-config.yaml's `users` stream
    // actually selects - Payload's own admin-panel auth secrets
    // (hash/salt/reset_password_token/...) are deliberately excluded there
    // so a compromised till can't exfiltrate every staff member's password
    // hash; declaring them here too would just leave them permanently null.
    tenant_id: column.integer,
    store_id: column.integer,
    role: column.text,
    pin_hash: column.text,
    email: column.text,
    phone: column.text,
    name: column.text,
    status: column.text,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'], store: ['store_id'] } },
);

const customers = new Table(
  {
    tenant_id: column.integer,
    name: column.text,
    phone: column.text,
    email: column.text,
    loyalty_points: column.real,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'] } },
);

const store_product_overrides = new Table(
  {
    tenant_id: column.integer,
    store_id: column.integer,
    product_id: column.integer,
    price_override: column.real,
    is_available: column.integer,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'], store: ['store_id'], product: ['product_id'] } },
);

const stock_movements = new Table(
  {
    tenant_id: column.integer,
    store_id: column.integer,
    product_id: column.integer,
    variant: column.text,
    quantity_delta: column.real,
    reason: column.text,
    related_order_id: column.text,
    client_timestamp: column.text,
    server_timestamp: column.text,
    source_terminal: column.text,
    flagged_for_review: column.integer,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'], store: ['store_id'], product: ['product_id'] } },
);

const orders = new Table(
  {
    tenant_id: column.integer,
    store_id: column.integer,
    terminal: column.text,
    terminal_name: column.text,
    cashier_id: column.integer,
    customer_id: column.integer,
    loyalty_points_earned: column.real,
    tax_total: column.real,
    discount_total: column.real,
    total: column.real,
    tender_type: column.text,
    payment_status: column.text,
    settled_at: column.text,
    settled_by_id: column.integer,
    mpesa_checkout_request_id: column.text,
    pesapal_order_tracking_id: column.text,
    status: column.text,
    created_offline: column.integer,
    synced_at: column.text,
    kra_invoice_number: column.text,
    kra_qr_code: column.text,
    kra_cu_serial: column.text,
    kra_submission_status: column.text,
    updated_at: column.text,
    created_at: column.text,
  },
  { indexes: { tenant: ['tenant_id'], store: ['store_id'], customer: ['customer_id'] } },
);

// Payload normalizes Orders.lineItems into its own Postgres child table
// (_parent_id -> orders.id, _order = array index) rather than a JSON column -
// mirrored here the same way so a local order write is two related table
// inserts, exactly like the server side. Matches
// `SELECT oli.* FROM orders_line_items oli JOIN orders ...` in
// sync-config.yaml exactly - the join there is only for server-side
// scoping, it doesn't add any of `orders`'s own columns to what's replicated.
const orders_line_items = new Table(
  {
    _parent_id: column.text,
    _order: column.integer,
    product_id: column.integer,
    variant: column.text,
    quantity: column.real,
    unit_price: column.real,
    discount: column.real,
    // Same reasoning as products_variants.tenant_id above.
    tenant_id: column.integer,
    store_id: column.integer,
  },
  { indexes: { parent: ['_parent_id'] } },
);

export const AppSchema = new Schema({
  tenants,
  products,
  products_variants,
  stores,
  users,
  customers,
  store_product_overrides,
  stock_movements,
  orders,
  orders_line_items,
});

export type Database = (typeof AppSchema)['types'];
