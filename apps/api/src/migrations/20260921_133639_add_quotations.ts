import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "quotations_line_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"variant" varchar,
  	"label" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL
  );
  
  CREATE TABLE "quotations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"store_id" integer,
  	"customer_name" varchar,
  	"customer_phone" varchar,
  	"notes" varchar,
  	"total" numeric NOT NULL,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quotations_id" integer;
  ALTER TABLE "quotations_line_items" ADD CONSTRAINT "quotations_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotations_line_items" ADD CONSTRAINT "quotations_line_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "quotations_line_items_order_idx" ON "quotations_line_items" USING btree ("_order");
  CREATE INDEX "quotations_line_items_parent_id_idx" ON "quotations_line_items" USING btree ("_parent_id");
  CREATE INDEX "quotations_line_items_product_idx" ON "quotations_line_items" USING btree ("product_id");
  CREATE INDEX "quotations_tenant_idx" ON "quotations" USING btree ("tenant_id");
  CREATE INDEX "quotations_store_idx" ON "quotations" USING btree ("store_id");
  CREATE INDEX "quotations_created_by_idx" ON "quotations" USING btree ("created_by_id");
  CREATE INDEX "quotations_updated_at_idx" ON "quotations" USING btree ("updated_at");
  CREATE INDEX "quotations_created_at_idx" ON "quotations" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quotations_fk" FOREIGN KEY ("quotations_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_quotations_id_idx" ON "payload_locked_documents_rels" USING btree ("quotations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotations_line_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "quotations_line_items" CASCADE;
  DROP TABLE "quotations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quotations_fk";
  
  DROP INDEX "payload_locked_documents_rels_quotations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quotations_id";`)
}
