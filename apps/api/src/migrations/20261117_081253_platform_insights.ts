import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_platform_tenant_notes_kind" AS ENUM('call', 'whatsapp', 'email', 'visit', 'note');
  CREATE TABLE "tenant_activity_days" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"logins" numeric DEFAULT 0 NOT NULL,
  	"pings" numeric DEFAULT 0 NOT NULL,
  	"sources" jsonb,
  	"first_seen_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "platform_tenant_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"author_id" integer,
  	"kind" "enum_platform_tenant_notes_kind" DEFAULT 'note' NOT NULL,
  	"body" varchar NOT NULL,
  	"follow_up_on" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tenant_activity_days_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "platform_tenant_notes_id" integer;
  ALTER TABLE "tenant_activity_days" ADD CONSTRAINT "tenant_activity_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenant_activity_days" ADD CONSTRAINT "tenant_activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "platform_tenant_notes" ADD CONSTRAINT "platform_tenant_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "platform_tenant_notes" ADD CONSTRAINT "platform_tenant_notes_author_id_platform_admins_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tenant_activity_days_tenant_idx" ON "tenant_activity_days" USING btree ("tenant_id");
  CREATE INDEX "tenant_activity_days_user_idx" ON "tenant_activity_days" USING btree ("user_id");
  CREATE INDEX "tenant_activity_days_day_idx" ON "tenant_activity_days" USING btree ("day");
  CREATE INDEX "tenant_activity_days_last_seen_at_idx" ON "tenant_activity_days" USING btree ("last_seen_at");
  CREATE INDEX "tenant_activity_days_updated_at_idx" ON "tenant_activity_days" USING btree ("updated_at");
  CREATE INDEX "tenant_activity_days_created_at_idx" ON "tenant_activity_days" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_day_idx" ON "tenant_activity_days" USING btree ("user_id","day");
  CREATE INDEX "platform_tenant_notes_tenant_idx" ON "platform_tenant_notes" USING btree ("tenant_id");
  CREATE INDEX "platform_tenant_notes_author_idx" ON "platform_tenant_notes" USING btree ("author_id");
  CREATE INDEX "platform_tenant_notes_follow_up_on_idx" ON "platform_tenant_notes" USING btree ("follow_up_on");
  CREATE INDEX "platform_tenant_notes_updated_at_idx" ON "platform_tenant_notes" USING btree ("updated_at");
  CREATE INDEX "platform_tenant_notes_created_at_idx" ON "platform_tenant_notes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenant_activity_days_fk" FOREIGN KEY ("tenant_activity_days_id") REFERENCES "public"."tenant_activity_days"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_tenant_notes_fk" FOREIGN KEY ("platform_tenant_notes_id") REFERENCES "public"."platform_tenant_notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tenant_activity_days_id_idx" ON "payload_locked_documents_rels" USING btree ("tenant_activity_days_id");
  CREATE INDEX "payload_locked_documents_rels_platform_tenant_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_tenant_notes_id");`)

  // Backfill sign-in history from the tenant audit log, which has recorded
  // every email and PIN login since launch - so "last sign-in" and "active
  // days" are meaningful from day one instead of starting empty. Which app
  // each login came from was never recorded, so sources stays empty.
  await db.execute(sql`
  INSERT INTO "tenant_activity_days" ("tenant_id", "user_id", "day", "logins", "pings", "sources", "first_seen_at", "last_seen_at")
  SELECT a."tenant_id", a."actor_id",
    to_char(a."created_at" AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD'),
    COUNT(*), 0, '[]'::jsonb, MIN(a."created_at"), MAX(a."created_at")
  FROM "audit_log" a
  JOIN "users" u ON u."id" = a."actor_id" AND u."tenant_id" = a."tenant_id"
  WHERE a."action" = 'login'
  GROUP BY a."tenant_id", a."actor_id", to_char(a."created_at" AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD')
  ON CONFLICT ("user_id", "day") DO NOTHING;`)

  // Carry each tenant's old single internal-notes textarea over as its
  // first note. The tenants.platform_notes column itself is left in place.
  await db.execute(sql`
  INSERT INTO "platform_tenant_notes" ("tenant_id", "kind", "body")
  SELECT "id", 'note', "platform_notes" FROM "tenants"
  WHERE "platform_notes" IS NOT NULL AND btrim("platform_notes") <> '';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reordered from Payload's generated version, which dropped the tables
  // (CASCADE, taking these constraints with them) before dropping the
  // constraints - so rolling back always failed.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tenant_activity_days_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_platform_tenant_notes_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tenant_activity_days_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_platform_tenant_notes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tenant_activity_days_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "platform_tenant_notes_id";
  DROP TABLE "tenant_activity_days" CASCADE;
  DROP TABLE "platform_tenant_notes" CASCADE;
  DROP TYPE "public"."enum_platform_tenant_notes_kind";`)
}
