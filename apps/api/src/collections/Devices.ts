import type { CollectionConfig } from 'payload';
import { invalidatePlatformStats } from '../lib/platformStatsCache.ts';

// Tills (desktop and phone) as the server knows them: one row per tenant +
// terminal ID (the ID each till generates and keeps locally - see
// apps/desktop/src/terminal.ts). Registered and refreshed automatically by
// lib/devices.ts whenever a till signs in, refreshes its session or syncs a
// sale. A revoked till can't sign in or refresh, so it's signed out within
// a few hours (apps/desktop + apps/mobile react to access_revoked).
// Platform admins read it and revoke/restore; tenants never write it.
export const Devices: CollectionConfig = {
  slug: 'devices',
  admin: { useAsTitle: 'name', defaultColumns: ['tenant', 'name', 'platform', 'lastSeenAt', 'revokedAt'] },
  defaultSort: '-lastSeenAt',
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: ({ req }) => req.user?.collection === 'platform-admins',
    delete: () => false,
  },
  indexes: [{ fields: ['tenant', 'terminalId'], unique: true }],
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'terminalId', type: 'text', required: true },
    { name: 'name', type: 'text' },
    { name: 'platform', type: 'select', options: ['desktop', 'mobile', 'web'] },
    { name: 'lastUser', type: 'relationship', relationTo: 'users' },
    { name: 'firstSeenAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date', index: true },
    { name: 'revokedAt', type: 'date' },
    { name: 'revokedBy', type: 'relationship', relationTo: 'platform-admins', admin: { readOnly: true } },
    { name: 'revokeReason', type: 'text' },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req, operation }) => {
        // Only the revoke fields are operator-editable.
        if (operation === 'update' && originalDoc) {
          const wasRevoked = Boolean(originalDoc.revokedAt);
          const nowRevoked = data.revokedAt !== undefined ? Boolean(data.revokedAt) : wasRevoked;
          if (!wasRevoked && nowRevoked) {
            data.revokedAt = new Date().toISOString();
            if (req.user?.collection === 'platform-admins') data.revokedBy = req.user.id;
          }
          if (wasRevoked && !nowRevoked) {
            data.revokedAt = null;
            data.revokedBy = null;
            data.revokeReason = null;
          }
        }
        return data;
      },
    ],
    afterChange: [
      () => invalidatePlatformStats(),
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update' || req.user?.collection !== 'platform-admins') return doc;
        const was = Boolean(previousDoc?.revokedAt);
        const now = Boolean(doc.revokedAt);
        if (was === now) return doc;
        await req.payload.create({
          collection: 'platform-audit-log',
          overrideAccess: true,
          data: {
            tenant: Number(doc.tenant && typeof doc.tenant === 'object' ? doc.tenant.id : doc.tenant),
            actor: Number(req.user.id),
            action: now ? 'device_revoked' : 'device_restored',
            summary: `Till "${doc.name || String(doc.terminalId).slice(0, 8)}" ${now ? 'revoked' : 'restored'}${now && doc.revokeReason ? ` - ${doc.revokeReason}` : ''}`,
            metadata: { deviceId: doc.id, terminalId: doc.terminalId },
          },
          req,
        });
        return doc;
      },
    ],
  },
};
