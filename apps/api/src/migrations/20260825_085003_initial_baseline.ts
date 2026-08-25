import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_subscription_tier" AS ENUM('trial', 'starter', 'growth', 'enterprise');
  CREATE TYPE "public"."enum_tenants_billing_status" AS ENUM('active', 'trialing', 'past_due', 'canceled');
  CREATE TYPE "public"."enum_users_role" AS ENUM('owner', 'manager', 'cashier');
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'banned');
  CREATE TYPE "public"."enum_stock_movements_reason" AS ENUM('sale', 'restock', 'transfer_in', 'transfer_out', 'adjustment', 'write_off');
  CREATE TYPE "public"."enum_orders_tender_type" AS ENUM('cash', 'mpesa', 'card', 'credit');
  CREATE TYPE "public"."enum_orders_payment_status" AS ENUM('paid', 'pending', 'failed');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('completed', 'refunded', 'voided');
  CREATE TYPE "public"."enum_orders_kra_submission_status" AS ENUM('not_applicable', 'pending', 'submitted', 'failed');
  CREATE TYPE "public"."enum_purchase_orders_status" AS ENUM('draft', 'sent', 'received');
  CREATE TYPE "public"."enum_stock_transfers_status" AS ENUM('draft', 'in_transit', 'received');
  CREATE TYPE "public"."enum_shifts_status" AS ENUM('open', 'closed');
  CREATE TYPE "public"."enum_audit_log_action" AS ENUM('price_changed', 'order_voided', 'order_refunded', 'sale_settled', 'login', 'login_blocked', 'staff_created', 'staff_banned', 'staff_reactivated', 'staff_deleted', 'store_created', 'store_deleted');
  CREATE TYPE "public"."enum_audit_log_entity_type" AS ENUM('product', 'order', 'user', 'store');
  CREATE TABLE "platform_admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "platform_admins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "tenants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"subscription_tier" "enum_tenants_subscription_tier" DEFAULT 'trial' NOT NULL,
  	"billing_status" "enum_tenants_billing_status" DEFAULT 'trialing' NOT NULL,
  	"receipt_header" varchar,
  	"receipt_footer" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stores" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"address" varchar,
  	"timezone" varchar DEFAULT 'Africa/Nairobi' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer,
  	"role" "enum_users_role" DEFAULT 'cashier' NOT NULL,
  	"status" "enum_users_status" DEFAULT 'active' NOT NULL,
  	"name" varchar,
  	"phone" varchar,
  	"pin_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "products_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"sku" varchar NOT NULL,
  	"barcode" varchar
  );
  
  CREATE TABLE "products_bundle_components" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"quantity" numeric DEFAULT 1
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"sku" varchar NOT NULL,
  	"barcode" varchar,
  	"name" varchar NOT NULL,
  	"category" varchar,
  	"cost_price" numeric DEFAULT 0 NOT NULL,
  	"sell_price" numeric DEFAULT 0 NOT NULL,
  	"tax_rate" numeric DEFAULT 0.16 NOT NULL,
  	"max_discount_percent" numeric DEFAULT 0 NOT NULL,
  	"reorder_point" numeric DEFAULT 0 NOT NULL,
  	"is_bundle" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "store_product_overrides" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer NOT NULL,
  	"product_id" integer NOT NULL,
  	"price_override" numeric,
  	"is_available" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stock_movements" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer NOT NULL,
  	"product_id" integer NOT NULL,
  	"variant" varchar,
  	"quantity_delta" numeric NOT NULL,
  	"reason" "enum_stock_movements_reason" NOT NULL,
  	"related_order_id" varchar,
  	"client_timestamp" timestamp(3) with time zone NOT NULL,
  	"server_timestamp" timestamp(3) with time zone,
  	"source_terminal" varchar NOT NULL,
  	"flagged_for_review" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_line_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"variant" varchar,
  	"quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"discount" numeric DEFAULT 0 NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer NOT NULL,
  	"terminal" varchar NOT NULL,
  	"terminal_name" varchar,
  	"cashier_id" integer NOT NULL,
  	"customer_id" integer,
  	"loyalty_points_earned" numeric,
  	"tax_total" numeric NOT NULL,
  	"discount_total" numeric NOT NULL,
  	"total" numeric NOT NULL,
  	"tender_type" "enum_orders_tender_type" NOT NULL,
  	"payment_status" "enum_orders_payment_status" DEFAULT 'paid' NOT NULL,
  	"settled_at" timestamp(3) with time zone,
  	"settled_by_id" integer,
  	"mpesa_checkout_request_id" varchar,
  	"pesapal_order_tracking_id" varchar,
  	"status" "enum_orders_status" DEFAULT 'completed' NOT NULL,
  	"created_offline" boolean DEFAULT false,
  	"synced_at" timestamp(3) with time zone,
  	"kra_invoice_number" varchar,
  	"kra_qr_code" varchar,
  	"kra_cu_serial" varchar,
  	"kra_submission_status" "enum_orders_kra_submission_status" DEFAULT 'not_applicable' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "purchase_orders_line_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_cost" numeric NOT NULL
  );
  
  CREATE TABLE "purchase_orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer NOT NULL,
  	"supplier_id" integer NOT NULL,
  	"status" "enum_purchase_orders_status" DEFAULT 'draft' NOT NULL,
  	"received_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "suppliers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"contact_info" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "stock_transfers_line_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"quantity" numeric NOT NULL
  );
  
  CREATE TABLE "stock_transfers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"from_store_id" integer NOT NULL,
  	"to_store_id" integer NOT NULL,
  	"status" "enum_stock_transfers_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "customers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"phone" varchar,
  	"loyalty_points" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sync_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"terminal" varchar NOT NULL,
  	"last_synced_at" timestamp(3) with time zone NOT NULL,
  	"pending_count" numeric DEFAULT 0 NOT NULL,
  	"conflict_count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "shifts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer NOT NULL,
  	"terminal" varchar NOT NULL,
  	"cashier_id" integer NOT NULL,
  	"opened_at" timestamp(3) with time zone NOT NULL,
  	"opening_float" numeric DEFAULT 0 NOT NULL,
  	"closed_at" timestamp(3) with time zone,
  	"closing_cash_counted" numeric,
  	"expected_cash" numeric,
  	"variance" numeric,
  	"status" "enum_shifts_status" DEFAULT 'open' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"actor_id" integer NOT NULL,
  	"action" "enum_audit_log_action" NOT NULL,
  	"entity_type" "enum_audit_log_entity_type" NOT NULL,
  	"entity_id" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"platform_admins_id" integer,
  	"tenants_id" integer,
  	"stores_id" integer,
  	"users_id" integer,
  	"products_id" integer,
  	"store_product_overrides_id" integer,
  	"stock_movements_id" varchar,
  	"orders_id" varchar,
  	"purchase_orders_id" integer,
  	"suppliers_id" integer,
  	"stock_transfers_id" integer,
  	"customers_id" integer,
  	"sync_log_id" integer,
  	"shifts_id" integer,
  	"audit_log_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"platform_admins_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "platform_admins_sessions" ADD CONSTRAINT "platform_admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_variants" ADD CONSTRAINT "products_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_bundle_components" ADD CONSTRAINT "products_bundle_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_bundle_components" ADD CONSTRAINT "products_bundle_components_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "store_product_overrides" ADD CONSTRAINT "store_product_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "store_product_overrides" ADD CONSTRAINT "store_product_overrides_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "store_product_overrides" ADD CONSTRAINT "store_product_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_related_order_id_orders_id_fk" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_line_items" ADD CONSTRAINT "orders_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_line_items" ADD CONSTRAINT "orders_line_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_settled_by_id_users_id_fk" FOREIGN KEY ("settled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_orders_line_items" ADD CONSTRAINT "purchase_orders_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_orders_line_items" ADD CONSTRAINT "purchase_orders_line_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_transfers_line_items" ADD CONSTRAINT "stock_transfers_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_transfers_line_items" ADD CONSTRAINT "stock_transfers_line_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_store_id_stores_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_store_id_stores_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_admins_fk" FOREIGN KEY ("platform_admins_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stores_fk" FOREIGN KEY ("stores_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_store_product_overrides_fk" FOREIGN KEY ("store_product_overrides_id") REFERENCES "public"."store_product_overrides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_movements_fk" FOREIGN KEY ("stock_movements_id") REFERENCES "public"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_purchase_orders_fk" FOREIGN KEY ("purchase_orders_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppliers_fk" FOREIGN KEY ("suppliers_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_transfers_fk" FOREIGN KEY ("stock_transfers_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sync_log_fk" FOREIGN KEY ("sync_log_id") REFERENCES "public"."sync_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shifts_fk" FOREIGN KEY ("shifts_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_platform_admins_fk" FOREIGN KEY ("platform_admins_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "platform_admins_sessions_order_idx" ON "platform_admins_sessions" USING btree ("_order");
  CREATE INDEX "platform_admins_sessions_parent_id_idx" ON "platform_admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "platform_admins_updated_at_idx" ON "platform_admins" USING btree ("updated_at");
  CREATE INDEX "platform_admins_created_at_idx" ON "platform_admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "platform_admins_email_idx" ON "platform_admins" USING btree ("email");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "stores_tenant_idx" ON "stores" USING btree ("tenant_id");
  CREATE INDEX "stores_updated_at_idx" ON "stores" USING btree ("updated_at");
  CREATE INDEX "stores_created_at_idx" ON "stores" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");
  CREATE INDEX "users_store_idx" ON "users" USING btree ("store_id");
  CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "products_variants_order_idx" ON "products_variants" USING btree ("_order");
  CREATE INDEX "products_variants_parent_id_idx" ON "products_variants" USING btree ("_parent_id");
  CREATE INDEX "products_bundle_components_order_idx" ON "products_bundle_components" USING btree ("_order");
  CREATE INDEX "products_bundle_components_parent_id_idx" ON "products_bundle_components" USING btree ("_parent_id");
  CREATE INDEX "products_bundle_components_product_idx" ON "products_bundle_components" USING btree ("product_id");
  CREATE INDEX "products_tenant_idx" ON "products" USING btree ("tenant_id");
  CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");
  CREATE INDEX "products_barcode_idx" ON "products" USING btree ("barcode");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "store_product_overrides_tenant_idx" ON "store_product_overrides" USING btree ("tenant_id");
  CREATE INDEX "store_product_overrides_store_idx" ON "store_product_overrides" USING btree ("store_id");
  CREATE INDEX "store_product_overrides_product_idx" ON "store_product_overrides" USING btree ("product_id");
  CREATE INDEX "store_product_overrides_updated_at_idx" ON "store_product_overrides" USING btree ("updated_at");
  CREATE INDEX "store_product_overrides_created_at_idx" ON "store_product_overrides" USING btree ("created_at");
  CREATE INDEX "stock_movements_tenant_idx" ON "stock_movements" USING btree ("tenant_id");
  CREATE INDEX "stock_movements_store_idx" ON "stock_movements" USING btree ("store_id");
  CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");
  CREATE INDEX "stock_movements_related_order_idx" ON "stock_movements" USING btree ("related_order_id");
  CREATE INDEX "stock_movements_updated_at_idx" ON "stock_movements" USING btree ("updated_at");
  CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements" USING btree ("created_at");
  CREATE INDEX "orders_line_items_order_idx" ON "orders_line_items" USING btree ("_order");
  CREATE INDEX "orders_line_items_parent_id_idx" ON "orders_line_items" USING btree ("_parent_id");
  CREATE INDEX "orders_line_items_product_idx" ON "orders_line_items" USING btree ("product_id");
  CREATE INDEX "orders_tenant_idx" ON "orders" USING btree ("tenant_id");
  CREATE INDEX "orders_store_idx" ON "orders" USING btree ("store_id");
  CREATE INDEX "orders_cashier_idx" ON "orders" USING btree ("cashier_id");
  CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
  CREATE INDEX "orders_settled_by_idx" ON "orders" USING btree ("settled_by_id");
  CREATE INDEX "orders_mpesa_checkout_request_id_idx" ON "orders" USING btree ("mpesa_checkout_request_id");
  CREATE INDEX "orders_pesapal_order_tracking_id_idx" ON "orders" USING btree ("pesapal_order_tracking_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "purchase_orders_line_items_order_idx" ON "purchase_orders_line_items" USING btree ("_order");
  CREATE INDEX "purchase_orders_line_items_parent_id_idx" ON "purchase_orders_line_items" USING btree ("_parent_id");
  CREATE INDEX "purchase_orders_line_items_product_idx" ON "purchase_orders_line_items" USING btree ("product_id");
  CREATE INDEX "purchase_orders_tenant_idx" ON "purchase_orders" USING btree ("tenant_id");
  CREATE INDEX "purchase_orders_store_idx" ON "purchase_orders" USING btree ("store_id");
  CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");
  CREATE INDEX "purchase_orders_updated_at_idx" ON "purchase_orders" USING btree ("updated_at");
  CREATE INDEX "purchase_orders_created_at_idx" ON "purchase_orders" USING btree ("created_at");
  CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id");
  CREATE INDEX "suppliers_updated_at_idx" ON "suppliers" USING btree ("updated_at");
  CREATE INDEX "suppliers_created_at_idx" ON "suppliers" USING btree ("created_at");
  CREATE INDEX "stock_transfers_line_items_order_idx" ON "stock_transfers_line_items" USING btree ("_order");
  CREATE INDEX "stock_transfers_line_items_parent_id_idx" ON "stock_transfers_line_items" USING btree ("_parent_id");
  CREATE INDEX "stock_transfers_line_items_product_idx" ON "stock_transfers_line_items" USING btree ("product_id");
  CREATE INDEX "stock_transfers_tenant_idx" ON "stock_transfers" USING btree ("tenant_id");
  CREATE INDEX "stock_transfers_from_store_idx" ON "stock_transfers" USING btree ("from_store_id");
  CREATE INDEX "stock_transfers_to_store_idx" ON "stock_transfers" USING btree ("to_store_id");
  CREATE INDEX "stock_transfers_updated_at_idx" ON "stock_transfers" USING btree ("updated_at");
  CREATE INDEX "stock_transfers_created_at_idx" ON "stock_transfers" USING btree ("created_at");
  CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");
  CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");
  CREATE INDEX "customers_updated_at_idx" ON "customers" USING btree ("updated_at");
  CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at");
  CREATE INDEX "sync_log_terminal_idx" ON "sync_log" USING btree ("terminal");
  CREATE INDEX "sync_log_updated_at_idx" ON "sync_log" USING btree ("updated_at");
  CREATE INDEX "sync_log_created_at_idx" ON "sync_log" USING btree ("created_at");
  CREATE INDEX "shifts_tenant_idx" ON "shifts" USING btree ("tenant_id");
  CREATE INDEX "shifts_store_idx" ON "shifts" USING btree ("store_id");
  CREATE INDEX "shifts_cashier_idx" ON "shifts" USING btree ("cashier_id");
  CREATE INDEX "shifts_updated_at_idx" ON "shifts" USING btree ("updated_at");
  CREATE INDEX "shifts_created_at_idx" ON "shifts" USING btree ("created_at");
  CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id");
  CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");
  CREATE INDEX "audit_log_entity_id_idx" ON "audit_log" USING btree ("entity_id");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_platform_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_admins_id");
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_stores_id_idx" ON "payload_locked_documents_rels" USING btree ("stores_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_store_product_overrides_id_idx" ON "payload_locked_documents_rels" USING btree ("store_product_overrides_id");
  CREATE INDEX "payload_locked_documents_rels_stock_movements_id_idx" ON "payload_locked_documents_rels" USING btree ("stock_movements_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_purchase_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("purchase_orders_id");
  CREATE INDEX "payload_locked_documents_rels_suppliers_id_idx" ON "payload_locked_documents_rels" USING btree ("suppliers_id");
  CREATE INDEX "payload_locked_documents_rels_stock_transfers_id_idx" ON "payload_locked_documents_rels" USING btree ("stock_transfers_id");
  CREATE INDEX "payload_locked_documents_rels_customers_id_idx" ON "payload_locked_documents_rels" USING btree ("customers_id");
  CREATE INDEX "payload_locked_documents_rels_sync_log_id_idx" ON "payload_locked_documents_rels" USING btree ("sync_log_id");
  CREATE INDEX "payload_locked_documents_rels_shifts_id_idx" ON "payload_locked_documents_rels" USING btree ("shifts_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_platform_admins_id_idx" ON "payload_preferences_rels" USING btree ("platform_admins_id");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "platform_admins_sessions" CASCADE;
  DROP TABLE "platform_admins" CASCADE;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "stores" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "products_variants" CASCADE;
  DROP TABLE "products_bundle_components" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "store_product_overrides" CASCADE;
  DROP TABLE "stock_movements" CASCADE;
  DROP TABLE "orders_line_items" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "purchase_orders_line_items" CASCADE;
  DROP TABLE "purchase_orders" CASCADE;
  DROP TABLE "suppliers" CASCADE;
  DROP TABLE "stock_transfers_line_items" CASCADE;
  DROP TABLE "stock_transfers" CASCADE;
  DROP TABLE "customers" CASCADE;
  DROP TABLE "sync_log" CASCADE;
  DROP TABLE "shifts" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_tenants_subscription_tier";
  DROP TYPE "public"."enum_tenants_billing_status";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_stock_movements_reason";
  DROP TYPE "public"."enum_orders_tender_type";
  DROP TYPE "public"."enum_orders_payment_status";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_orders_kra_submission_status";
  DROP TYPE "public"."enum_purchase_orders_status";
  DROP TYPE "public"."enum_stock_transfers_status";
  DROP TYPE "public"."enum_shifts_status";
  DROP TYPE "public"."enum_audit_log_action";
  DROP TYPE "public"."enum_audit_log_entity_type";`)
}
