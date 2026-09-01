import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_credit_payments_method" AS ENUM('cash', 'mpesa', 'card', 'other');
  ALTER TYPE "public"."enum_audit_log_action" ADD VALUE 'credit_payment_recorded' BEFORE 'sale_settled';
  CREATE TABLE "credit_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"order_id" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"method" "enum_credit_payments_method" DEFAULT 'cash' NOT NULL,
  	"note" varchar,
  	"recorded_by_id" integer NOT NULL,
  	"paid_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "credit_payments_id" integer;
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "credit_payments_tenant_idx" ON "credit_payments" USING btree ("tenant_id");
  CREATE INDEX "credit_payments_order_idx" ON "credit_payments" USING btree ("order_id");
  CREATE INDEX "credit_payments_recorded_by_idx" ON "credit_payments" USING btree ("recorded_by_id");
  CREATE INDEX "credit_payments_updated_at_idx" ON "credit_payments" USING btree ("updated_at");
  CREATE INDEX "credit_payments_created_at_idx" ON "credit_payments" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_credit_payments_fk" FOREIGN KEY ("credit_payments_id") REFERENCES "public"."credit_payments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_credit_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("credit_payments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "credit_payments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "credit_payments" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_credit_payments_fk";
  
  ALTER TABLE "audit_log" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_audit_log_action";
  CREATE TYPE "public"."enum_audit_log_action" AS ENUM('price_changed', 'order_voided', 'order_refunded', 'sale_settled', 'login', 'login_blocked', 'staff_created', 'staff_banned', 'staff_reactivated', 'staff_deleted', 'store_created', 'store_deleted');
  ALTER TABLE "audit_log" ALTER COLUMN "action" SET DATA TYPE "public"."enum_audit_log_action" USING "action"::"public"."enum_audit_log_action";
  DROP INDEX "payload_locked_documents_rels_credit_payments_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "credit_payments_id";
  DROP TYPE "public"."enum_credit_payments_method";`)
}
