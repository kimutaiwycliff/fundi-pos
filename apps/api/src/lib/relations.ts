// Payload's hook `doc` relationship fields may arrive either as a bare
// id or as a populated related document, depending on the request's depth.
// Every hook that reads a relationship field must normalize through this -
// passing a populated object straight into a query `where` clause silently
// coerces to NaN/garbage instead of erroring (caught by hand while seeding).
export function toID(value: unknown): string | number {
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string | number }).id;
  }
  return value as string | number;
}

// req.user is now a union (User | PlatformAdmin) since PlatformAdmins was
// registered as a second auth collection - PlatformAdmin has no
// tenant/store/role fields at all (deliberately: see PlatformAdmins.ts).
// Every tenant-scoped custom route/hook that reads req.user.tenant etc.
// must narrow through this first - a platform admin has no legitimate
// reason to be hitting till/reporting/payment endpoints, so treat that
// case the same as "not logged in" rather than let it crash or silently
// write `tenant: undefined`.
export function isTenantUser<T extends { collection: string }>(user: T | null | undefined): user is Extract<T, { collection: 'users' }> {
  return Boolean(user) && user!.collection === 'users';
}
