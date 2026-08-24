// Real Rust-side PowerSync `BackendConnector` implementation.
//
// Confirmed against the actual vendored crate source (not guessed from
// other PowerSync SDKs' JS-based connector shape):
//   ~/.cargo/registry/src/*/powersync-0.0.7/src/sync/connector.rs
//     pub trait BackendConnector: Send + Sync {
//         async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError>;
//         async fn upload_data(&self) -> Result<(), PowerSyncError>;
//     }
//     pub struct PowerSyncCredentials { pub endpoint: String, pub token: String }
// and the crate's own test at
//   ~/.cargo/registry/src/*/powersync-0.0.7/tests/sync_test.rs (`upload_retry` test)
// which is the pattern this file follows: fetch_credentials() re-mints a
// token on every call (that's how 1hr JWT expiry is handled - the sync
// engine re-invokes fetch_credentials() itself on reconnect), and
// upload_data() drains one local transaction at a time via
// `PowerSyncDatabase::next_crud_transaction()` / `CrudTransaction::complete()`.
use std::sync::Mutex;

use async_trait::async_trait;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, CrudEntry, PowerSyncCredentials, PowerSyncDatabase, UpdateType};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConnectorError {
    #[error("HTTP {status} calling {url}: {body}")]
    HttpStatus { status: u16, url: String, body: String },
    #[error("local CRUD entry for table '{table}' is missing its row data")]
    MissingData { table: String },
}

#[derive(Deserialize)]
struct TokenResponse {
    token: String,
}

/// Talks to apps/api (Payload) to mint PowerSync credentials and to upload
/// local writes back to Postgres.
pub struct ApiConnector {
    db: PowerSyncDatabase,
    api_base_url: String,
    powersync_url: String,
    payload_token: Mutex<String>,
    http: Client,
}

impl ApiConnector {
    pub fn new(db: PowerSyncDatabase, api_base_url: String, powersync_url: String, payload_token: String) -> Self {
        Self {
            db,
            api_base_url,
            powersync_url,
            payload_token: Mutex::new(payload_token),
            http: Client::new(),
        }
    }

    /// Called from the `powersync_update_token` Tauri command when the JS
    /// side refreshes the underlying Payload session JWT.
    pub fn set_payload_token(&self, token: String) {
        *self.payload_token.lock().unwrap() = token;
    }

    fn payload_token(&self) -> String {
        self.payload_token.lock().unwrap().clone()
    }

    async fn fetch_credentials_impl(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        let url = format!("{}/api/powersync/token", self.api_base_url);
        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("JWT {}", self.payload_token()))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(PowerSyncError::upload_error(ConnectorError::HttpStatus {
                status: status.as_u16(),
                url,
                body,
            }));
        }

        let body: TokenResponse = resp.json().await?;
        Ok(PowerSyncCredentials {
            endpoint: self.powersync_url.clone(),
            token: body.token,
        })
    }

    async fn upload_data_impl(&self) -> Result<(), PowerSyncError> {
        let Some(tx) = self.db.next_crud_transaction().await? else {
            return Ok(());
        };

        // The till always writes an order and its line items together in
        // one local writeTransaction (see apps/desktop/src/Till.tsx), so
        // both land in this same crud transaction - group line items by
        // their parent order id upfront so upload_order() can assemble one
        // nested POST instead of the two separate table rows Postgres
        // itself normalizes them into.
        let line_items_by_parent = group_line_items_by_parent(&tx.crud);

        for entry in &tx.crud {
            match entry.table.as_str() {
                "stock_movements" => self.upload_stock_movement(entry).await?,
                "orders" => {
                    let line_items = line_items_for_order(entry, &line_items_by_parent);
                    self.upload_order(entry, &line_items).await?;
                }
                "orders_line_items" => {
                    // Consumed above as part of its parent order - nothing
                    // to upload independently.
                }
                other => {
                    // products/stores/users/customers/store_product_overrides are
                    // backoffice-managed reference data in this app - there is no
                    // ingestion endpoint for tills to write them back. Not needed
                    // for the sync round-trip this phase is proving, so we log and
                    // drop rather than blocking the upload queue forever.
                    eprintln!(
                        "[connector] no upload handler for table '{other}' (id={}), dropping",
                        entry.id
                    );
                }
            }
        }

        tx.complete().await
    }

    async fn upload_order(&self, entry: &CrudEntry, line_items: &[&CrudEntry]) -> Result<(), PowerSyncError> {
        let UpdateType::Put = &entry.update_type else {
            // Orders are create-only from the till's perspective (refunds/
            // voids are manager-gated status transitions made from the web
            // dashboard, not local edits - see apps/api/src/collections/Orders.ts).
            eprintln!("[connector] ignoring non-insert change on orders id={}", entry.id);
            return Ok(());
        };

        let body = build_order_body(entry, line_items).map_err(|table| {
            PowerSyncError::upload_error(ConnectorError::MissingData { table })
        })?;

        let url = format!("{}/api/sync/orders", self.api_base_url);
        let resp = self
            .http
            .post(&url)
            .header("Authorization", format!("JWT {}", self.payload_token()))
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(PowerSyncError::upload_error(ConnectorError::HttpStatus {
                status: status.as_u16(),
                url,
                body,
            }));
        }

        Ok(())
    }

    async fn upload_stock_movement(&self, entry: &CrudEntry) -> Result<(), PowerSyncError> {
        let UpdateType::Put = &entry.update_type else {
            // stock_movements is create-only in Payload (update: () => false,
            // delete: neverDelete) - the till never issues UPDATE/DELETE against
            // it, so this should not happen in practice.
            eprintln!(
                "[connector] ignoring non-insert change on stock_movements id={}",
                entry.id
            );
            return Ok(());
        };

        let data = entry.data.as_ref().ok_or_else(|| {
            PowerSyncError::upload_error(ConnectorError::MissingData {
                table: entry.table.clone(),
            })
        })?;

        let field = |name: &str| data.get(name).cloned().unwrap_or(Value::Null);

        // Translate from our local snake_case columns (mirroring Postgres) to
        // the camelCase Payload field names expected by the dedicated
        // idempotent ingestion route (apps/api/src/app/api/sync/stock-movements/route.ts),
        // which wraps payload.create({ collection: 'stock-movements', ... })
        // and treats a duplicate client-generated `id` as a no-op success -
        // safe to retry.
        let body = json!({
            "id": entry.id,
            "tenant": field("tenant_id"),
            "store": field("store_id"),
            "product": to_number(field("product_id")),
            "variant": field("variant"),
            "quantityDelta": field("quantity_delta"),
            "reason": field("reason"),
            "relatedOrder": field("related_order_id"),
            "clientTimestamp": field("client_timestamp"),
            "sourceTerminal": field("source_terminal"),
        });

        let url = format!("{}/api/sync/stock-movements", self.api_base_url);
        let resp = self
            .http
            .post(&url)
            .header("Authorization", format!("JWT {}", self.payload_token()))
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(PowerSyncError::upload_error(ConnectorError::HttpStatus {
                status: status.as_u16(),
                url,
                body,
            }));
        }

        Ok(())
    }
}

/// `orders_line_items.product_id` (and `stock_movements.product_id`) are
/// declared `column.integer` in the local schema (schema.ts), mirroring
/// Postgres's real INTEGER foreign key - but the value actually inserted at
/// the till comes from a *different* local table's `id` column, which
/// PowerSync always stores as TEXT (schema.ts's own documented rule: every
/// table's implicit `id` is TEXT, Postgres integer PKs included). SQLite
/// does not coerce that TEXT into the destination column's declared
/// affinity for the CRUD-queue diff PowerSync uploads, so it round-trips
/// here as a JSON string (confirmed live via direct sqlite3 inspection of
/// a stuck ps_crud row: `"product_id":"275"`) - which Payload's `product`
/// relationship field then rejects outright ("Line Items 1 > Product" is
/// invalid), 500ing every retry and leaving the order permanently unsynced.
fn to_number(value: Value) -> Value {
    match value {
        Value::String(s) => s.parse::<i64>().map(Value::from).unwrap_or(Value::String(s)),
        other => other,
    }
}

/// Groups `orders_line_items` crud entries by their `_parent_id` (the
/// order's id) - pulled out as a free function, rather than inlined in
/// upload_data_impl, so it (and build_order_body below) can be unit tested
/// without a live PowerSyncDatabase/HTTP client.
fn group_line_items_by_parent(crud: &[CrudEntry]) -> std::collections::HashMap<&str, Vec<&CrudEntry>> {
    let mut by_parent: std::collections::HashMap<&str, Vec<&CrudEntry>> = std::collections::HashMap::new();
    for entry in crud {
        if entry.table == "orders_line_items" {
            if let Some(parent_id) = entry
                .data
                .as_ref()
                .and_then(|d| d.get("_parent_id"))
                .and_then(|v| v.as_str())
            {
                by_parent.entry(parent_id).or_default().push(entry);
            }
        }
    }
    by_parent
}

/// Looks up an order's line items and sorts them back into the original
/// cart order via the `_order` column (array index) - `next_crud_transaction`
/// doesn't guarantee entries arrive in insertion order.
fn line_items_for_order<'a>(
    order_entry: &CrudEntry,
    by_parent: &std::collections::HashMap<&str, Vec<&'a CrudEntry>>,
) -> Vec<&'a CrudEntry> {
    let mut line_items: Vec<&CrudEntry> = by_parent.get(order_entry.id.as_str()).cloned().unwrap_or_default();
    line_items.sort_by_key(|li| {
        li.data
            .as_ref()
            .and_then(|d| d.get("_order"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
    });
    line_items
}

/// Assembles the nested JSON body /api/sync/orders expects (see
/// apps/api/src/app/api/sync/orders/route.ts and
/// apps/api/src/collections/Orders.ts) from a local `orders` CrudEntry and
/// its already-grouped/sorted `orders_line_items` entries. Returns the
/// offending table name as Err if the order entry has no data (shouldn't
/// happen for a PUT, but next_crud_transaction's contract allows it).
fn build_order_body(entry: &CrudEntry, line_items: &[&CrudEntry]) -> Result<Value, String> {
    let data = entry.data.as_ref().ok_or_else(|| entry.table.clone())?;
    let field = |name: &str| data.get(name).cloned().unwrap_or(Value::Null);

    let line_items_json: Vec<Value> = line_items
        .iter()
        .filter_map(|li| {
            let li_data = li.data.as_ref()?;
            let li_field = |name: &str| li_data.get(name).cloned().unwrap_or(Value::Null);
            Some(json!({
                "product": to_number(li_field("product_id")),
                "variant": li_field("variant"),
                "quantity": li_field("quantity"),
                "unitPrice": li_field("unit_price"),
                "discount": li_field("discount"),
            }))
        })
        .collect();

    // SQLite has no boolean type - our local `created_offline` column is
    // INTEGER 0/1 (see schema.ts), but Payload's checkbox field expects a
    // real JSON boolean.
    let created_offline = matches!(field("created_offline"), Value::Number(n) if n.as_i64() == Some(1));

    Ok(json!({
        "id": entry.id,
        "tenant": field("tenant_id"),
        "store": field("store_id"),
        "terminal": field("terminal"),
        "cashier": field("cashier_id"),
        "lineItems": line_items_json,
        "taxTotal": field("tax_total"),
        "discountTotal": field("discount_total"),
        "total": field("total"),
        "tenderType": field("tender_type"),
        "status": field("status"),
        "createdOffline": created_offline,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(table: &str, id: &str, data: Value) -> CrudEntry {
        CrudEntry {
            client_id: 1,
            transaction_id: 1,
            update_type: UpdateType::Put,
            table: table.to_string(),
            id: id.to_string(),
            metadata: None,
            data: data.as_object().cloned(),
            previous_values: None,
        }
    }

    #[test]
    fn assembles_an_order_with_its_line_items_in_cart_order() {
        let order = entry(
            "orders",
            "order-1",
            json!({
                "tenant_id": 1, "store_id": 1, "terminal": "till-1", "cashier_id": 3,
                "tax_total": 27.59, "discount_total": 0.0, "total": 200.0,
                "tender_type": "cash", "status": "completed", "created_offline": 1
            }),
        );
        // Inserted out of cart order on purpose - build_order_body must
        // re-sort by `_order`, not trust CrudEntry iteration order.
        // product_id is a STRING here deliberately - that's what a real
        // local ps_crud row actually contains (confirmed live via direct
        // sqlite3 inspection: `"product_id":"275"`), since it's bound from
        // another table's PowerSync-implicit TEXT id. A test fixture using a
        // bare number here would not have caught the real bug.
        let line_b = entry(
            "orders_line_items",
            "li-b",
            json!({ "_parent_id": "order-1", "_order": 1, "product_id": "2", "quantity": 1.0, "unit_price": 100.0, "discount": 0.0 }),
        );
        let line_a = entry(
            "orders_line_items",
            "li-a",
            json!({ "_parent_id": "order-1", "_order": 0, "product_id": "1", "quantity": 2.0, "unit_price": 50.0, "discount": 0.0 }),
        );

        let crud = vec![order, line_b, line_a];
        let order = crud.iter().find(|e| e.table == "orders").unwrap();
        let by_parent = group_line_items_by_parent(&crud);
        let sorted = line_items_for_order(order, &by_parent);
        let body = build_order_body(order, &sorted).expect("order has data");

        assert_eq!(body["id"], "order-1");
        assert_eq!(body["total"], 200.0);
        assert_eq!(body["createdOffline"], true);
        let line_items = body["lineItems"].as_array().unwrap();
        assert_eq!(line_items.len(), 2);
        // product_id "1" (order index 0) must come before "2" (index 1), and
        // both must come out as real JSON numbers - Payload's `product`
        // relationship field rejects a string outright.
        assert_eq!(line_items[0]["product"], 1);
        assert!(line_items[0]["product"].is_number());
        assert_eq!(line_items[1]["product"], 2);
        assert!(line_items[1]["product"].is_number());
    }

    #[test]
    fn to_number_parses_numeric_strings_but_leaves_other_values_alone() {
        assert_eq!(to_number(json!("275")), json!(275));
        assert_eq!(to_number(json!(275)), json!(275));
        assert_eq!(to_number(json!(null)), json!(null));
        // Not silently dropped/nulled if it somehow isn't numeric - passed
        // through as-is so Payload's own validation error stays legible
        // instead of masking it as a different "missing field" error.
        assert_eq!(to_number(json!("not-a-number")), json!("not-a-number"));
    }

    #[test]
    fn ignores_line_items_belonging_to_a_different_order() {
        let order = entry(
            "orders",
            "order-1",
            json!({ "tenant_id": 1, "store_id": 1, "terminal": "till-1", "cashier_id": 3,
                    "tax_total": 0.0, "discount_total": 0.0, "total": 0.0,
                    "tender_type": "cash", "status": "completed", "created_offline": 0 }),
        );
        let other_orders_line = entry(
            "orders_line_items",
            "li-x",
            json!({ "_parent_id": "some-other-order", "_order": 0, "product_id": 9, "quantity": 1.0, "unit_price": 1.0, "discount": 0.0 }),
        );

        let crud = vec![order, other_orders_line];
        let order = crud.iter().find(|e| e.table == "orders").unwrap();
        let by_parent = group_line_items_by_parent(&crud);
        let sorted = line_items_for_order(order, &by_parent);

        assert!(sorted.is_empty());
    }

    #[test]
    fn build_order_body_errors_with_the_table_name_when_data_is_missing() {
        let mut delete_entry = entry("orders", "order-1", json!({}));
        delete_entry.data = None;
        delete_entry.update_type = UpdateType::Delete;

        let err = build_order_body(&delete_entry, &[]).unwrap_err();
        assert_eq!(err, "orders");
    }
}

/// Thin `BackendConnector` wrapper so we can hold onto an `Arc<ApiConnector>`
/// ourselves (to mutate its token later from `powersync_update_token`) while
/// also handing a connector to `SyncOptions::new`, which takes ownership of
/// whatever implements the trait.
pub struct ConnectorHandle(pub std::sync::Arc<ApiConnector>);

#[async_trait]
impl BackendConnector for ConnectorHandle {
    async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        self.0.fetch_credentials_impl().await
    }

    async fn upload_data(&self) -> Result<(), PowerSyncError> {
        self.0.upload_data_impl().await
    }
}
