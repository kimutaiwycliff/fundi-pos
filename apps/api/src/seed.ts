// Run with: npx payload run ./src/seed.ts
// Creates one demo tenant, two stores, sample products, and one user per
// role, so the hooks/access-control/sync machinery has something real to
// exercise. Uses overrideAccess: true throughout - this is a trusted
// server-side script, not a user-facing request, and Tenants.create is
// deliberately blocked at the API layer (tenants are provisioned by
// signup/billing, not created by end users).
import { getPayload } from 'payload';
import config from './payload.config.ts';

async function seed() {
  const payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: 'Demo Hardware Co', subscriptionTier: 'growth', billingStatus: 'active' },
    overrideAccess: true,
  });
  console.log(`Created tenant: ${tenant.id}`);

  const storeA = await payload.create({
    collection: 'stores',
    data: { tenant: tenant.id, name: 'Westlands Branch', address: 'Westlands, Nairobi', timezone: 'Africa/Nairobi' },
    overrideAccess: true,
  });
  const storeB = await payload.create({
    collection: 'stores',
    data: { tenant: tenant.id, name: 'Mombasa Road Branch', address: 'Mombasa Rd, Nairobi', timezone: 'Africa/Nairobi' },
    overrideAccess: true,
  });
  console.log(`Created stores: ${storeA.id}, ${storeB.id}`);

  const owner = await payload.create({
    collection: 'users',
    data: {
      tenant: tenant.id,
      role: 'owner',
      status: 'active',
      email: 'owner@demo-hardware.test',
      password: 'demo-password-123',
    },
    overrideAccess: true,
  });
  const manager = await payload.create({
    collection: 'users',
    data: {
      tenant: tenant.id,
      store: storeA.id,
      role: 'manager',
      status: 'active',
      email: 'manager@demo-hardware.test',
      password: 'demo-password-123',
    },
    overrideAccess: true,
  });
  const cashier = await payload.create({
    collection: 'users',
    data: {
      tenant: tenant.id,
      store: storeA.id,
      role: 'cashier',
      status: 'active',
      email: 'cashier@demo-hardware.test',
      password: 'demo-password-123',
      pin: '1234',
    },
    overrideAccess: true,
  });
  console.log(`Created users: owner=${owner.id} manager=${manager.id} cashier=${cashier.id}`);

  const hammer = await payload.create({
    collection: 'products',
    data: {
      tenant: tenant.id,
      sku: 'HW-HAMMER-01',
      barcode: '6001234567890',
      name: 'Claw Hammer 16oz',
      category: 'Hand Tools',
      costPrice: 450,
      sellPrice: 799,
      taxRate: 0.16,
      reorderPoint: 5,
      maxDiscountAmount: 0,
    },
    overrideAccess: true,
    draft: false,
  });
  const paint = await payload.create({
    collection: 'products',
    data: {
      tenant: tenant.id,
      sku: 'HW-PAINT-5L',
      barcode: '6001234567891',
      name: 'Emulsion Paint 5L - White',
      category: 'Paint',
      costPrice: 1800,
      sellPrice: 2899,
      taxRate: 0.16,
      reorderPoint: 3,
      maxDiscountAmount: 0,
    },
    overrideAccess: true,
    draft: false,
  });
  console.log(`Created products: ${hammer.id}, ${paint.id}`);

  // Opening stock via a 'restock' movement - never a direct stock-count write.
  await payload.create({
    collection: 'stock-movements',
    data: {
      id: crypto.randomUUID(),
      tenant: tenant.id,
      store: storeA.id,
      product: hammer.id,
      quantityDelta: 25,
      reason: 'restock',
      clientTimestamp: new Date().toISOString(),
      sourceTerminal: 'seed-script',
    },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'stock-movements',
    data: {
      id: crypto.randomUUID(),
      tenant: tenant.id,
      store: storeA.id,
      product: paint.id,
      quantityDelta: 10,
      reason: 'restock',
      clientTimestamp: new Date().toISOString(),
      sourceTerminal: 'seed-script',
    },
    overrideAccess: true,
  });
  console.log('Seeded opening stock via StockMovements ledger.');

  console.log('\nDone. Login at /admin with owner@demo-hardware.test / demo-password-123');
  process.exit(0);
}

try {
  await seed();
} catch (err) {
  console.error(err);
  process.exit(1);
}
