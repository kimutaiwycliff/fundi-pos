import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trial_grants_source" AS ENUM('signup', 'operator');
  CREATE TYPE "public"."enum_devices_platform" AS ENUM('desktop', 'mobile', 'web');
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'tenant_provisioned';
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'tenant_purged';
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'device_revoked';
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'device_restored';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purge-tenants';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purge-tenants';
  CREATE TABLE "trial_grants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"business_name" varchar NOT NULL,
  	"email_canonical" varchar,
  	"email_raw" varchar,
  	"phone" varchar,
  	"ip" varchar,
  	"source" "enum_trial_grants_source" NOT NULL,
  	"trial_days" numeric,
  	"repeat_override" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "devices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"terminal_id" varchar NOT NULL,
  	"name" varchar,
  	"platform" "enum_devices_platform",
  	"last_user_id" integer,
  	"first_seen_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"revoked_by_id" integer,
  	"revoke_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "platform_audit_log" ALTER COLUMN "actor_id" DROP NOT NULL;
  ALTER TABLE "tenants" ADD COLUMN "scheduled_purge_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trial_grants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "devices_id" integer;
  ALTER TABLE "trial_grants" ADD CONSTRAINT "trial_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "devices" ADD CONSTRAINT "devices_last_user_id_users_id_fk" FOREIGN KEY ("last_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_id_platform_admins_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trial_grants_tenant_idx" ON "trial_grants" USING btree ("tenant_id");
  CREATE INDEX "trial_grants_email_canonical_idx" ON "trial_grants" USING btree ("email_canonical");
  CREATE INDEX "trial_grants_phone_idx" ON "trial_grants" USING btree ("phone");
  CREATE INDEX "trial_grants_ip_idx" ON "trial_grants" USING btree ("ip");
  CREATE INDEX "trial_grants_updated_at_idx" ON "trial_grants" USING btree ("updated_at");
  CREATE INDEX "trial_grants_created_at_idx" ON "trial_grants" USING btree ("created_at");
  CREATE INDEX "devices_tenant_idx" ON "devices" USING btree ("tenant_id");
  CREATE INDEX "devices_last_user_idx" ON "devices" USING btree ("last_user_id");
  CREATE INDEX "devices_last_seen_at_idx" ON "devices" USING btree ("last_seen_at");
  CREATE INDEX "devices_revoked_by_idx" ON "devices" USING btree ("revoked_by_id");
  CREATE INDEX "devices_updated_at_idx" ON "devices" USING btree ("updated_at");
  CREATE INDEX "devices_created_at_idx" ON "devices" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_terminalId_idx" ON "devices" USING btree ("tenant_id","terminal_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trial_grants_fk" FOREIGN KEY ("trial_grants_id") REFERENCES "public"."trial_grants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_devices_fk" FOREIGN KEY ("devices_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trial_grants_id_idx" ON "payload_locked_documents_rels" USING btree ("trial_grants_id");
  CREATE INDEX "payload_locked_documents_rels_devices_id_idx" ON "payload_locked_documents_rels" USING btree ("devices_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered from Payload's generated version (tables were dropped with
  // CASCADE before their constraints, so rollback always failed).
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trial_grants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_devices_fk";
  
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_platform_audit_log_action";
  CREATE TYPE "public"."enum_platform_audit_log_action" AS ENUM('tenant_suspended', 'tenant_reactivated', 'tenant_soft_deleted', 'tenant_restored', 'subscription_changed', 'addon_changed', 'payment_recorded', 'payment_deleted', 'billing_updated');
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE "public"."enum_platform_audit_log_action" USING "action"::"public"."enum_platform_audit_log_action";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'billing-reminders', 'platform-digest');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'billing-reminders', 'platform-digest');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trial_grants_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_devices_id_idx";
  ALTER TABLE "platform_audit_log" ALTER COLUMN "actor_id" SET NOT NULL;
  ALTER TABLE "tenants" DROP COLUMN "scheduled_purge_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trial_grants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "devices_id";
  DROP TABLE "trial_grants" CASCADE;
  DROP TABLE "devices" CASCADE;
  DROP TYPE "public"."enum_trial_grants_source";
  DROP TYPE "public"."enum_devices_platform";`)
}
