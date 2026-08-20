import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';

// PowerSync client auth: each till/dashboard session gets a short-lived JWT
// carrying tenant_id/store_id/role custom claims. PowerSync's self-hosted
// service fetches our JWKS endpoint to verify these (client_auth.jwks_uri in
// docker/powersync/powersync.yaml) and sync-config.yaml's streams read the
// claims back out via auth.parameter('tenant_id') / auth.parameter('store_id')
// (confirmed against @powersync/service-sync-rules' own compiler source -
// auth.parameter(x) desugars to auth.parameters() ->> '$.x').
//
// This is a separate signing key from Payload's own admin-panel auth
// (PAYLOAD_SECRET) - different audience, different consumer, no reason to
// share key material between them.
const AUDIENCE = 'hardware-pos-saas';
const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour; the till re-fetches on expiry/reconnect

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function signPowerSyncToken(user: {
  id: string | number;
  tenant: string | number;
  store?: string | number | null;
  role: string;
}): Promise<string> {
  const privateKey = await importPKCS8(requireEnv('POWERSYNC_JWT_PRIVATE_KEY'), 'RS256');
  const kid = requireEnv('POWERSYNC_JWT_KID');

  return new SignJWT({
    // MUST be JSON numbers, not strings: PowerSync's bucket-parameterization
    // builds a literal key from the JWT claim's JSON type (a quoted "1" vs
    // bare 1), and compares it against the key computed from the replicated
    // row's actual column value - tenant_id/store_id are integer columns in
    // Postgres, so a string claim here means the two keys never match and
    // sync silently returns zero rows. Found via a real end-to-end sync
    // test (PowerSync logged operations_synced: 0 despite correct bucket
    // names and a live, correctly-authenticated connection).
    tenant_id: Number(user.tenant),
    store_id: user.store != null ? Number(user.store) : null,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(String(user.id))
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(privateKey);
}

export async function getPowerSyncJWKS() {
  const publicKey = await importSPKI(requireEnv('POWERSYNC_JWT_PUBLIC_KEY'), 'RS256');
  const jwk = await exportJWK(publicKey);
  return {
    keys: [{ ...jwk, alg: 'RS256', use: 'sig', kid: requireEnv('POWERSYNC_JWT_KID') }],
  };
}
