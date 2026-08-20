import { generateKeyPairSync } from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { importSPKI, jwtVerify } from 'jose';

// Ephemeral keypair generated per test run - exercises the same signing/JWKS
// logic as lib/powersyncAuth.ts without depending on the real deployed
// secret (which lives only in .env, not in this test's env block).
describe('PowerSync JWT issuance', () => {
  let signPowerSyncToken: typeof import('../lib/powersyncAuth.ts').signPowerSyncToken;
  let getPowerSyncJWKS: typeof import('../lib/powersyncAuth.ts').getPowerSyncJWKS;

  beforeAll(async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    process.env.POWERSYNC_JWT_PRIVATE_KEY = privateKey;
    process.env.POWERSYNC_JWT_PUBLIC_KEY = publicKey;
    process.env.POWERSYNC_JWT_KID = 'test-key';

    const mod = await import('../lib/powersyncAuth.ts');
    signPowerSyncToken = mod.signPowerSyncToken;
    getPowerSyncJWKS = mod.getPowerSyncJWKS;
  });

  it('signs a token whose claims match the given user, and verifies against its own JWKS', async () => {
    const token = await signPowerSyncToken({ id: 42, tenant: 7, store: 3, role: 'cashier' });

    const jwks = await getPowerSyncJWKS();
    expect(jwks.keys).toHaveLength(1);
    const publicKey = await importSPKI(process.env.POWERSYNC_JWT_PUBLIC_KEY!, 'RS256');

    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      audience: 'hardware-pos-saas',
    });

    expect(protectedHeader.kid).toBe('test-key');
    expect(payload.sub).toBe('42');
    expect(payload.tenant_id).toBe('7');
    expect(payload.store_id).toBe('3');
    expect(payload.role).toBe('cashier');
  });

  it('encodes a null store as null, not the string "null", for org-level admins', async () => {
    const token = await signPowerSyncToken({ id: 1, tenant: 7, store: null, role: 'owner' });
    const publicKey = await importSPKI(process.env.POWERSYNC_JWT_PUBLIC_KEY!, 'RS256');
    const { payload } = await jwtVerify(token, publicKey, { audience: 'hardware-pos-saas' });
    expect(payload.store_id).toBeNull();
  });

  it('rejects verification against a different signing key (tokens are not forgeable)', async () => {
    const token = await signPowerSyncToken({ id: 1, tenant: 7, store: 1, role: 'cashier' });
    const { publicKey: otherPublicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const importedOtherKey = await importSPKI(otherPublicKey, 'RS256');
    await expect(jwtVerify(token, importedOtherKey)).rejects.toThrow();
  });
});
