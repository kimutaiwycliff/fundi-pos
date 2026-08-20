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

        for entry in &tx.crud {
            match entry.table.as_str() {
                "stock_movements" => self.upload_stock_movement(entry).await?,
                other => {
                    // products/stores/users/customers/store_product_overrides are
                    // backoffice-managed reference data in this app - there is no
                    // ingestion endpoint for tills to write them back, and `orders`
                    // needs a full lineItems array this flat local table doesn't
                    // carry (see apps/api/src/collections/Orders.ts). Neither is
                    // needed for the sync round-trip this phase is proving, so we
                    // log and drop rather than blocking the upload queue forever.
                    eprintln!(
                        "[connector] no upload handler for table '{other}' (id={}), dropping",
                        entry.id
                    );
                }
            }
        }

        tx.complete().await
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
            "product": field("product_id"),
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
