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
