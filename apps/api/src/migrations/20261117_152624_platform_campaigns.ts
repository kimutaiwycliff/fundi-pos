import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "platform_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"segment" varchar NOT NULL,
  	"recipients" numeric NOT NULL,
  	"skipped_opted_out" numeric DEFAULT 0,
  	"sent_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "marketing_opt_out" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "platform_campaigns_id" integer;
  ALTER TABLE "platform_campaigns" ADD CONSTRAINT "platform_campaigns_sent_by_id_platform_admins_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "platform_campaigns_sent_by_idx" ON "platform_campaigns" USING btree ("sent_by_id");
  CREATE INDEX "platform_campaigns_updated_at_idx" ON "platform_campaigns" USING btree ("updated_at");
  CREATE INDEX "platform_campaigns_created_at_idx" ON "platform_campaigns" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_campaigns_fk" FOREIGN KEY ("platform_campaigns_id") REFERENCES "public"."platform_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_platform_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_campaigns_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered from Payload's generated version (tables were dropped with
  // CASCADE before their constraints, so rollback always failed).
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_platform_campaigns_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_platform_campaigns_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "marketing_opt_out";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "platform_campaigns_id";
  DROP TABLE "platform_campaigns" CASCADE;`)
}
