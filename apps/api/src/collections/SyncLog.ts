import type { CollectionConfig } from 'payload';
import { isAuthenticated, managerOrOwner } from '../access/index.ts';

// Debugging/audit only - not business data. Written by authenticated
// terminals reporting their own sync status; read by owners/managers via
// the dashboard to see which terminals are behind or conflicting.
export const SyncLog: CollectionConfig = {
  slug: 'sync-log',
  admin: { useAsTitle: 'terminal' },
  access: {
    read: managerOrOwner,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'terminal', type: 'text', required: true, index: true },
    { name: 'lastSyncedAt', type: 'date', required: true },
    { name: 'pendingCount', type: 'number', required: true, defaultValue: 0 },
    { name: 'conflictCount', type: 'number', required: true, defaultValue: 0 },
  ],
};
