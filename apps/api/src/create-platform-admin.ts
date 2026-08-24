// One-off provisioning script - platform admins can't be created through
// the REST API by design (see collections/PlatformAdmins.ts). Run with:
//   PLATFORM_ADMIN_EMAIL=you@yourcompany.com PLATFORM_ADMIN_PASSWORD=... \
//   PLATFORM_ADMIN_NAME="Your Name" npx payload run ./src/create-platform-admin.ts
import { getPayload } from 'payload';
import config from './payload.config.ts';

async function run() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME;
  if (!email || !password || !name) {
    throw new Error('Set PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, and PLATFORM_ADMIN_NAME');
  }

  const payload = await getPayload({ config });
  const admin = await payload.create({
    collection: 'platform-admins',
    data: { email, password, name },
    overrideAccess: true,
  });
  console.log(`Created platform admin: ${admin.email} (id ${admin.id}). Log in at /admin.`);
  process.exit(0);
}

try {
  await run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
