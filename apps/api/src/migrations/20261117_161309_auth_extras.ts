import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "platform_admins" ADD COLUMN "totp_enabled" boolean DEFAULT false;
  ALTER TABLE "platform_admins" ADD COLUMN "totp_secret" varchar;
  ALTER TABLE "platform_admins" ADD COLUMN "totp_pending_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "google_sub" varchar;
  ALTER TABLE "trial_grants" ADD COLUMN "google_sub" varchar;
  CREATE INDEX "users_google_sub_idx" ON "users" USING btree ("google_sub");
  CREATE INDEX "trial_grants_google_sub_idx" ON "trial_grants" USING btree ("google_sub");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "users_google_sub_idx";
  DROP INDEX "trial_grants_google_sub_idx";
  ALTER TABLE "platform_admins" DROP COLUMN "totp_enabled";
  ALTER TABLE "platform_admins" DROP COLUMN "totp_secret";
  ALTER TABLE "platform_admins" DROP COLUMN "totp_pending_secret";
  ALTER TABLE "users" DROP COLUMN "google_sub";
  ALTER TABLE "trial_grants" DROP COLUMN "google_sub";`)
}
