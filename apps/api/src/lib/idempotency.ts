// Payload has no hook that can cancel a create mid-flight and substitute a
// different return value - beforeChange can only transform data, then the
// DB write always happens (confirmed against Payload's own create operation
// source). So idempotent replay (spec Section 5: "replaying an
// already-applied UUID is a no-op server-side") has to be handled at the
// call site: attempt the create, and if it fails specifically because the
// client-supplied id already exists, treat that as success and return the
// existing doc instead of surfacing an error.
//
// Payload's ValidationError stores its field-level detail at `err.data.errors`
// (confirmed against node_modules/payload/dist/errors/{ValidationError,APIError}.js -
// APIError's constructor assigns the third constructor arg to `this.data`,
// not `this.errors`).
export function isDuplicateIdError(err: unknown): boolean {
  const data = (err as { data?: { errors?: Array<{ path?: string; message?: string }> } })?.data;
  const errors = data?.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => e.path === 'id' || /unique/i.test(e.message ?? ''));
}
