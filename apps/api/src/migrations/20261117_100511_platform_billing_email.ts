import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscription_payments_status" AS ENUM('pending', 'confirmed', 'rejected');
  CREATE TYPE "public"."enum_platform_notifications_status" AS ENUM('sent', 'logged', 'failed');
  CREATE TYPE "public"."enum_trial_extension_requests_status" AS ENUM('pending', 'approved', 'declined');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'billing-reminders', 'platform-digest');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'billing-reminders', 'platform-digest');
  CREATE TABLE "platform_notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"kind" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"status" "enum_platform_notifications_status" NOT NULL,
  	"error" varchar,
  	"provider_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trial_extension_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"requested_by_id" integer,
  	"message" varchar,
  	"status" "enum_trial_extension_requests_status" DEFAULT 'pending' NOT NULL,
  	"days_granted" numeric,
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"new_trial_ends_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "subscription_payments" ADD COLUMN "status" "enum_subscription_payments_status" DEFAULT 'confirmed' NOT NULL;
  ALTER TABLE "subscription_payments" ADD COLUMN "claimed_by_id" integer;
  ALTER TABLE "subscription_payments" ADD COLUMN "decided_by_id" integer;
  ALTER TABLE "subscription_payments" ADD COLUMN "decided_at" timestamp(3) with time zone;
  ALTER TABLE "subscription_payments" ADD COLUMN "reject_reason" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "platform_notifications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trial_extension_requests_id" integer;
  ALTER TABLE "platform_notifications" ADD CONSTRAINT "platform_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trial_extension_requests" ADD CONSTRAINT "trial_extension_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trial_extension_requests" ADD CONSTRAINT "trial_extension_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trial_extension_requests" ADD CONSTRAINT "trial_extension_requests_decided_by_id_platform_admins_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "platform_notifications_tenant_idx" ON "platform_notifications" USING btree ("tenant_id");
  CREATE INDEX "platform_notifications_kind_idx" ON "platform_notifications" USING btree ("kind");
  CREATE UNIQUE INDEX "platform_notifications_key_idx" ON "platform_notifications" USING btree ("key");
  CREATE INDEX "platform_notifications_updated_at_idx" ON "platform_notifications" USING btree ("updated_at");
  CREATE INDEX "platform_notifications_created_at_idx" ON "platform_notifications" USING btree ("created_at");
  CREATE INDEX "trial_extension_requests_tenant_idx" ON "trial_extension_requests" USING btree ("tenant_id");
  CREATE INDEX "trial_extension_requests_requested_by_idx" ON "trial_extension_requests" USING btree ("requested_by_id");
  CREATE INDEX "trial_extension_requests_status_idx" ON "trial_extension_requests" USING btree ("status");
  CREATE INDEX "trial_extension_requests_decided_by_idx" ON "trial_extension_requests" USING btree ("decided_by_id");
  CREATE INDEX "trial_extension_requests_updated_at_idx" ON "trial_extension_requests" USING btree ("updated_at");
  CREATE INDEX "trial_extension_requests_created_at_idx" ON "trial_extension_requests" USING btree ("created_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_claimed_by_id_users_id_fk" FOREIGN KEY ("claimed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_decided_by_id_platform_admins_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_notifications_fk" FOREIGN KEY ("platform_notifications_id") REFERENCES "public"."platform_notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trial_extension_requests_fk" FOREIGN KEY ("trial_extension_requests_id") REFERENCES "public"."trial_extension_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");
  CREATE INDEX "subscription_payments_claimed_by_idx" ON "subscription_payments" USING btree ("claimed_by_id");
  CREATE INDEX "subscription_payments_decided_by_idx" ON "subscription_payments" USING btree ("decided_by_id");
  CREATE INDEX "payload_locked_documents_rels_platform_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_notifications_id");
  CREATE INDEX "payload_locked_documents_rels_trial_extension_requests_i_idx" ON "payload_locked_documents_rels" USING btree ("trial_extension_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered from Payload's generated version (tables were dropped with
  // CASCADE before their constraints, so rollback always failed).
  await db.execute(sql`
  ALTER TABLE "subscription_payments" DROP CONSTRAINT IF EXISTS "subscription_payments_claimed_by_id_users_id_fk";
  
  ALTER TABLE "subscription_payments" DROP CONSTRAINT IF EXISTS "subscription_payments_decided_by_id_platform_admins_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_platform_notifications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trial_extension_requests_fk";
  
  DROP INDEX IF EXISTS "subscription_payments_status_idx";
  DROP INDEX IF EXISTS "subscription_payments_claimed_by_idx";
  DROP INDEX IF EXISTS "subscription_payments_decided_by_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_platform_notifications_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trial_extension_requests_i_idx";
  ALTER TABLE "subscription_payments" DROP COLUMN "status";
  ALTER TABLE "subscription_payments" DROP COLUMN "claimed_by_id";
  ALTER TABLE "subscription_payments" DROP COLUMN "decided_by_id";
  ALTER TABLE "subscription_payments" DROP COLUMN "decided_at";
  ALTER TABLE "subscription_payments" DROP COLUMN "reject_reason";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "platform_notifications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trial_extension_requests_id";
  DROP TABLE "platform_notifications" CASCADE;
  DROP TABLE "trial_extension_requests" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP TYPE "public"."enum_subscription_payments_status";
  DROP TYPE "public"."enum_platform_notifications_status";
  DROP TYPE "public"."enum_trial_extension_requests_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
