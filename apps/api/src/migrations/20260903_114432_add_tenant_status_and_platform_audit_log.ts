import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_status" AS ENUM('active', 'suspended', 'deleted');
  CREATE TYPE "public"."enum_platform_audit_log_action" AS ENUM('tenant_suspended', 'tenant_reactivated', 'tenant_soft_deleted', 'tenant_restored', 'subscription_changed');
  CREATE TABLE "platform_audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"actor_id" integer NOT NULL,
  	"action" "enum_platform_audit_log_action" NOT NULL,
  	"summary" varchar NOT NULL,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "status" "enum_tenants_status" DEFAULT 'active' NOT NULL;
  ALTER TABLE "tenants" ADD COLUMN "status_changed_at" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "status_reason" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "platform_audit_log_id" integer;
  ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_actor_id_platform_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "platform_audit_log_tenant_idx" ON "platform_audit_log" USING btree ("tenant_id");
  CREATE INDEX "platform_audit_log_actor_idx" ON "platform_audit_log" USING btree ("actor_id");
  CREATE INDEX "platform_audit_log_updated_at_idx" ON "platform_audit_log" USING btree ("updated_at");
  CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_audit_log_fk" FOREIGN KEY ("platform_audit_log_id") REFERENCES "public"."platform_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_platform_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_audit_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "platform_audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "platform_audit_log" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_platform_audit_log_fk";
  
  DROP INDEX "payload_locked_documents_rels_platform_audit_log_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "status";
  ALTER TABLE "tenants" DROP COLUMN "status_changed_at";
  ALTER TABLE "tenants" DROP COLUMN "status_reason";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "platform_audit_log_id";
  DROP TYPE "public"."enum_tenants_status";
  DROP TYPE "public"."enum_platform_audit_log_action";`)
}
