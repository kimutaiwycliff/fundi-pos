import path from 'path';
import { fileURLToPath } from 'url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';

import { Tenants } from './collections/Tenants.ts';
import { Stores } from './collections/Stores.ts';
import { Users } from './collections/Users.ts';
import { Products } from './collections/Products.ts';
import { StoreProductOverrides } from './collections/StoreProductOverrides.ts';
import { StockMovements } from './collections/StockMovements.ts';
import { Orders } from './collections/Orders.ts';
import { PurchaseOrders } from './collections/PurchaseOrders.ts';
import { Suppliers } from './collections/Suppliers.ts';
import { StockTransfers } from './collections/StockTransfers.ts';
import { Customers } from './collections/Customers.ts';
import { SyncLog } from './collections/SyncLog.ts';
import { Shifts } from './collections/Shifts.ts';
import { PlatformAdmins } from './collections/PlatformAdmins.ts';
import { AuditLog } from './collections/AuditLog.ts';

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
    StoreProductOverrides,
    StockMovements,
    Orders,
    PurchaseOrders,
    Suppliers,
    StockTransfers,
    Customers,
    SyncLog,
    Shifts,
    AuditLog,
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
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
});
