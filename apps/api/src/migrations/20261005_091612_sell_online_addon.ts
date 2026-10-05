import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_addons" AS ENUM('sell_online');
  CREATE TYPE "public"."enum_orders_channel" AS ENUM('walk_in', 'whatsapp', 'instagram', 'tiktok', 'facebook', 'online_shop', 'phone', 'other');
  CREATE TYPE "public"."enum_customers_source" AS ENUM('walk_by', 'referral', 'tiktok', 'instagram', 'facebook', 'whatsapp', 'google', 'influencer', 'ad', 'other');
  CREATE TYPE "public"."enum_promo_codes_kind" AS ENUM('percentage', 'flat');
  ALTER TYPE "public"."enum_platform_audit_log_action" ADD VALUE 'addon_changed';
  CREATE TABLE "tenants_addons" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_tenants_addons",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "promo_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"code" varchar NOT NULL,
  	"label" varchar,
  	"kind" "enum_promo_codes_kind" DEFAULT 'percentage' NOT NULL,
  	"value" numeric NOT NULL,
  	"min_spend" numeric,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"max_uses" numeric,
  	"uses_count" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"referrer_customer_id" integer,
  	"referrer_reward_points" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "addons_changed_at" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "whatsapp_number" varchar;
  ALTER TABLE "tenants" ADD COLUMN "social_handles" varchar;
  ALTER TABLE "tenants" ADD COLUMN "google_review_url" varchar;
  ALTER TABLE "tenants" ADD COLUMN "loyalty_point_value" numeric DEFAULT 1;
  ALTER TABLE "tenants" ADD COLUMN "shop_slug" varchar;
  ALTER TABLE "tenants" ADD COLUMN "storefront_enabled" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "storefront_tagline" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "tenants" ADD COLUMN "seo_image_id" integer;
  ALTER TABLE "tenants" ADD COLUMN "storefront_city" varchar;
  ALTER TABLE "tenants" ADD COLUMN "storefront_indexable" boolean DEFAULT true;
  ALTER TABLE "tenants" ADD COLUMN "google_site_verification" varchar;
  ALTER TABLE "products" ADD COLUMN "show_online" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "online_description" varchar;
  ALTER TABLE "products" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "products" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "orders" ADD COLUMN "channel" "enum_orders_channel" DEFAULT 'walk_in';
  ALTER TABLE "orders" ADD COLUMN "promo_code_text" varchar;
  ALTER TABLE "orders" ADD COLUMN "promo_code_id" integer;
  ALTER TABLE "orders" ADD COLUMN "promo_discount" numeric DEFAULT 0;
  ALTER TABLE "orders" ADD COLUMN "loyalty_points_redeemed" numeric DEFAULT 0;
  ALTER TABLE "orders" ADD COLUMN "loyalty_discount" numeric DEFAULT 0;
  ALTER TABLE "orders" ADD COLUMN "referrer_points_awarded" numeric DEFAULT 0;
  ALTER TABLE "customers" ADD COLUMN "source" "enum_customers_source";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "promo_codes_id" integer;
  ALTER TABLE "tenants_addons" ADD CONSTRAINT "tenants_addons_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tenants_addons_order_idx" ON "tenants_addons" USING btree ("order");
  CREATE INDEX "tenants_addons_parent_idx" ON "tenants_addons" USING btree ("parent_id");
  CREATE INDEX "promo_codes_tenant_idx" ON "promo_codes" USING btree ("tenant_id");
  CREATE INDEX "promo_codes_code_idx" ON "promo_codes" USING btree ("code");
  CREATE INDEX "promo_codes_referrer_customer_idx" ON "promo_codes" USING btree ("referrer_customer_id");
  CREATE INDEX "promo_codes_updated_at_idx" ON "promo_codes" USING btree ("updated_at");
  CREATE INDEX "promo_codes_created_at_idx" ON "promo_codes" USING btree ("created_at");
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promo_codes_fk" FOREIGN KEY ("promo_codes_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "tenants_shop_slug_idx" ON "tenants" USING btree ("shop_slug");
  CREATE INDEX "tenants_seo_image_idx" ON "tenants" USING btree ("seo_image_id");
  CREATE INDEX "orders_promo_code_idx" ON "orders" USING btree ("promo_code_id");
  CREATE INDEX "payload_locked_documents_rels_promo_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("promo_codes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants_addons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "promo_codes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants_addons" CASCADE;
  DROP TABLE "promo_codes" CASCADE;
  ALTER TABLE "tenants" DROP CONSTRAINT "tenants_seo_image_id_media_id_fk";
  
  ALTER TABLE "orders" DROP CONSTRAINT "orders_promo_code_id_promo_codes_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_promo_codes_fk";
  
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_platform_audit_log_action";
  CREATE TYPE "public"."enum_platform_audit_log_action" AS ENUM('tenant_suspended', 'tenant_reactivated', 'tenant_soft_deleted', 'tenant_restored', 'subscription_changed');
  ALTER TABLE "platform_audit_log" ALTER COLUMN "action" SET DATA TYPE "public"."enum_platform_audit_log_action" USING "action"::"public"."enum_platform_audit_log_action";
  DROP INDEX "tenants_shop_slug_idx";
  DROP INDEX "tenants_seo_image_idx";
  DROP INDEX "orders_promo_code_idx";
  DROP INDEX "payload_locked_documents_rels_promo_codes_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "addons_changed_at";
  ALTER TABLE "tenants" DROP COLUMN "whatsapp_number";
  ALTER TABLE "tenants" DROP COLUMN "social_handles";
  ALTER TABLE "tenants" DROP COLUMN "google_review_url";
  ALTER TABLE "tenants" DROP COLUMN "loyalty_point_value";
  ALTER TABLE "tenants" DROP COLUMN "shop_slug";
  ALTER TABLE "tenants" DROP COLUMN "storefront_enabled";
  ALTER TABLE "tenants" DROP COLUMN "storefront_tagline";
  ALTER TABLE "tenants" DROP COLUMN "seo_title";
  ALTER TABLE "tenants" DROP COLUMN "seo_description";
  ALTER TABLE "tenants" DROP COLUMN "seo_image_id";
  ALTER TABLE "tenants" DROP COLUMN "storefront_city";
  ALTER TABLE "tenants" DROP COLUMN "storefront_indexable";
  ALTER TABLE "tenants" DROP COLUMN "google_site_verification";
  ALTER TABLE "products" DROP COLUMN "show_online";
  ALTER TABLE "products" DROP COLUMN "online_description";
  ALTER TABLE "products" DROP COLUMN "seo_title";
  ALTER TABLE "products" DROP COLUMN "seo_description";
  ALTER TABLE "orders" DROP COLUMN "channel";
  ALTER TABLE "orders" DROP COLUMN "promo_code_text";
  ALTER TABLE "orders" DROP COLUMN "promo_code_id";
  ALTER TABLE "orders" DROP COLUMN "promo_discount";
  ALTER TABLE "orders" DROP COLUMN "loyalty_points_redeemed";
  ALTER TABLE "orders" DROP COLUMN "loyalty_discount";
  ALTER TABLE "orders" DROP COLUMN "referrer_points_awarded";
  ALTER TABLE "customers" DROP COLUMN "source";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "promo_codes_id";
  DROP TYPE "public"."enum_tenants_addons";
  DROP TYPE "public"."enum_orders_channel";
  DROP TYPE "public"."enum_customers_source";
  DROP TYPE "public"."enum_promo_codes_kind";`)
}
