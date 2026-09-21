// Local PowerSync SQLite schema for the hardware POS till.
//
// Column names/types are a direct mirror of the underlying Postgres tables
// (confirmed via `psql -h localhost -p 5433 -U pos_admin -d pos_saas -c '\d <table>'`
// against the running docker-postgres-1 container, and against
// docker/powersync/sync-config.yaml's `SELECT * FROM <table> ...` streams -
// PowerSync replicates the raw table structure, not Payload's camelCase
// collection field names).
//
// Notes:
// - The `id` column is never declared here: PowerSync always adds it
//   implicitly as TEXT (see node_modules/@powersync/common's Table.validate(),
//   which throws if a custom `id` column is declared). Postgres integer PKs
//   (products.id, stores.id, users.id, customers.id,
//   store_product_overrides.id) are stringified automatically when synced;
//   orders.id/stock_movements.id are already client-generated UUID text
//   columns in Postgres, so no conversion happens there.
// - Postgres `numeric` columns map to REAL (SQLite/PowerSync has no
//   fixed-point decimal type).
// - Postgres `boolean` columns map to INTEGER (0/1) - SQLite has no boolean
//   type and @powersync/common's `column` helper only exposes
//   text/integer/real.
// - Postgres `timestamp(3) with time zone` columns map to TEXT (ISO 8601
//   strings, as PowerSync's Postgres source connector serializes them).
import { column, Schema, Table } from '@powersync/common';

const tenants = new Table({
  name: column.text,
  receipt_header: column.text,
  receipt_footer: column.text,
  shifts_required: column.integer,
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

// Ported from apps/mobile/src/db/schema.ts - this table didn't exist here
// at all previously (a known, documented gap - see mobile's own schema.ts
// header comment), leaving desktop with no local variant data to build a
// sell-time picker against. The server-side sync bucket already serves
// this identical stream to mobile, so this is purely a client-side
// schema/UI gap being closed, not a backend change.
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
    tax_total: column.real,
    discount_total: column.real,
    total: column.real,
    tender_type: column.text,
    payment_status: column.text,
    settled_at: column.text,
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
