import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_billing_cycle" AS ENUM('monthly', 'quarterly', 'annual');
  CREATE TYPE "public"."enum_subscription_payments_method" AS ENUM('mpesa', 'bank', 'card', 'cash', 'other');
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'payment_recorded';
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'payment_deleted';
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'billing_updated';
  CREATE TABLE "subscription_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"amount" numeric NOT NULL,
  	"method" "enum_subscription_payments_method" DEFAULT 'mpesa' NOT NULL,
  	"reference" varchar,
  	"paid_at" timestamp(3) with time zone NOT NULL,
  	"period_start" timestamp(3) with time zone,
  	"period_end" timestamp(3) with time zone,
  	"note" varchar,
  	"recorded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "billing_cycle" "enum_tenants_billing_cycle" DEFAULT 'monthly';
  ALTER TABLE "tenants" ADD COLUMN "plan_price" numeric;
  ALTER TABLE "tenants" ADD COLUMN "paid_until" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "trial_ends_at" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "billing_contact_name" varchar;
  ALTER TABLE "tenants" ADD COLUMN "billing_contact_phone" varchar;
  ALTER TABLE "tenants" ADD COLUMN "billing_contact_email" varchar;
  ALTER TABLE "tenants" ADD COLUMN "platform_notes" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscription_payments_id" integer;
  ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recorded_by_id_platform_admins_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "subscription_payments_tenant_idx" ON "subscription_payments" USING btree ("tenant_id");
  CREATE INDEX "subscription_payments_paid_at_idx" ON "subscription_payments" USING btree ("paid_at");
  CREATE INDEX "subscription_payments_period_end_idx" ON "subscription_payments" USING btree ("period_end");
  CREATE INDEX "subscription_payments_recorded_by_idx" ON "subscription_payments" USING btree ("recorded_by_id");
  CREATE INDEX "subscription_payments_updated_at_idx" ON "subscription_payments" USING btree ("updated_at");
  CREATE INDEX "subscription_payments_created_at_idx" ON "subscription_payments" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscription_payments_fk" FOREIGN KEY ("subscription_payments_id") REFERENCES "public"."subscription_payments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_subscription_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("subscription_payments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "subscription_payments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "subscription_payments" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscription_payments_fk";
  
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_platform_audit_log_action";
  CREATE TYPE "public"."enum_platform_audit_log_action" AS ENUM('tenant_suspended', 'tenant_reactivated', 'tenant_soft_deleted', 'tenant_restored', 'subscription_changed', 'addon_changed');
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE "public"."enum_platform_audit_log_action" USING "action"::"public"."enum_platform_audit_log_action";
  DROP INDEX "payload_locked_documents_rels_subscription_payments_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "billing_cycle";
  ALTER TABLE "tenants" DROP COLUMN "plan_price";
  ALTER TABLE "tenants" DROP COLUMN "paid_until";
  ALTER TABLE "tenants" DROP COLUMN "trial_ends_at";
  ALTER TABLE "tenants" DROP COLUMN "billing_contact_name";
  ALTER TABLE "tenants" DROP COLUMN "billing_contact_phone";
  ALTER TABLE "tenants" DROP COLUMN "billing_contact_email";
  ALTER TABLE "tenants" DROP COLUMN "platform_notes";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscription_payments_id";
  DROP TYPE "public"."enum_tenants_billing_cycle";
  DROP TYPE "public"."enum_subscription_payments_method";`)
}
