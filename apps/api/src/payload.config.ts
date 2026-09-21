import path from 'path';
import { fileURLToPath } from 'url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { s3Storage } from '@payloadcms/storage-s3';
import { buildConfig } from 'payload';

import { Tenants } from './collections/Tenants.ts';
import { Stores } from './collections/Stores.ts';
import { Users } from './collections/Users.ts';
import { Products } from './collections/Products.ts';
import { Media } from './collections/Media.ts';
import { StoreProductOverrides } from './collections/StoreProductOverrides.ts';
import { StockMovements } from './collections/StockMovements.ts';
import { Orders } from './collections/Orders.ts';
import { CreditPayments } from './collections/CreditPayments.ts';
import { PurchaseOrders } from './collections/PurchaseOrders.ts';
import { Quotations } from './collections/Quotations.ts';
import { Suppliers } from './collections/Suppliers.ts';
import { StockTransfers } from './collections/StockTransfers.ts';
import { Customers } from './collections/Customers.ts';
import { SyncLog } from './collections/SyncLog.ts';
import { Shifts } from './collections/Shifts.ts';
import { PlatformAdmins } from './collections/PlatformAdmins.ts';
import { AuditLog } from './collections/AuditLog.ts';
import { PlatformAuditLog } from './collections/PlatformAuditLog.ts';
import { Posts } from './collections/Posts.ts';
import { PostImages } from './collections/PostImages.ts';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    // The admin panel's own session is tied to whichever collection is
    // designated here - a platform admin, not a tenant user. Tenant staff
    // never use this raw Payload UI at all (apps/web is their entire
    // product surface); this is purely the SaaS operator's own console.
    user: PlatformAdmins.slug,
    importMap: {
      baseDir: path.resolve(dirname, 'app/(payload)'),
    },
  },
  collections: [
    PlatformAdmins,
    Tenants,
    Stores,
    Users,
    Products,
    Media,
    StoreProductOverrides,
    StockMovements,
    Orders,
    CreditPayments,
    PurchaseOrders,
    Quotations,
    Suppliers,
    StockTransfers,
    Customers,
    SyncLog,
    Shifts,
    AuditLog,
    PlatformAuditLog,
    Posts,
    PostImages,
  ],
  // apps/web talks to Payload through its own server-side route handlers
  // (same-origin from the browser's perspective, proxied server-to-server -
  // sidesteps cross-origin cookie SameSite/Secure complications entirely
  // for local http dev). CORS/CSRF are still opened for localhost:3000 for
  // any direct browser calls (e.g. public reads) and for local admin-panel access.
  //
  // The admin panel itself (served FROM this same app) also needs its own
  // origin in this list - Payload's CSRF check is a strict allowlist
  // match, not an automatic same-origin exception. Caught live: logging
  // out of /admin on the real deployed domain silently failed with only
  // localhost:3000 allowed, since that request's Origin (the admin UI's
  // own real domain) was never in the list.
  cors: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  csrf: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    // Cloudflare R2 (S3-compatible) - see apps/api/.env for the actual
    // credentials. Chosen over Payload's local-disk default specifically
    // for S3-compatibility with a self-hosted MinIO, should the user move
    // this off R2 onto their own VPS later - only the env values change.
    // disablePayloadAccessControl + generateFileURL: R2's S3 API endpoint
    // is upload-only, so reads go straight to R2's own public URL instead
    // of being proxied through this app.
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => {
            const key = prefix ? `${prefix}/${filename}` : filename;
            return `${process.env.R2_PUBLIC_URL}/${key}`;
          },
        },
        'post-images': {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => {
            const key = prefix ? `${prefix}/${filename}` : filename;
            return `${process.env.R2_PUBLIC_URL}/${key}`;
          },
        },
      },
      bucket: process.env.R2_BUCKET || '',
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        forcePathStyle: true,
      },
    }),
  ],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
    // NOT wiring prodMigrations here (despite the real gap that leaves -
    // see migrations/README below): production's `payload-migrations`
    // table already carries a batch:-1 "dev push was used on this
    // database" row from however it was originally bootstrapped, before
    // migrations became the strategy. @payloadcms/drizzle's migrate()
    // interactively confirms before proceeding whenever that row exists
    // (drizzle/dist/migrate.js), and the production container has no TTY -
    // wiring prodMigrations here made every boot hang indefinitely on that
    // prompt, taking the API down. Caught live: deployed, health check
    // timed out, api.fundipos.co.ke stopped responding entirely.
    // Applying pending migrations to production needs a one-time
    // interactive `payload migrate` run (real terminal, someone answers
    // the prompt once) before this can be turned back on safely.
  }),
});
