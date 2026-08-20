import { getPowerSyncJWKS } from '@/lib/powersyncAuth';

// Public endpoint - PowerSync's service fetches this itself (client_auth.jwks_uri
// in docker/powersync/powersync.yaml) to verify tokens minted by /token above.
export async function GET() {
  const jwks = await getPowerSyncJWKS();
  return Response.json(jwks);
}
