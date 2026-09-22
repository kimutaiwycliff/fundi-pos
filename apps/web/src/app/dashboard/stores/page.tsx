import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { StoreDialog } from './store-dialog';
import { StoreDeleteButton } from './store-delete-button';

type Store = { id: number; name: string; address: string | null; timezone: string };

export default async function StoresPage() {
  const [{ docs: stores }, me] = await Promise.all([
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const canManageStores = me.role === 'owner' || me.role === 'manager';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Stores</h1>
        <StoreDialog />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="hidden sm:table-cell">Timezone</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No stores yet.
                </TableCell>
              </TableRow>
            ) : (
              stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>{store.name}</TableCell>
                  <TableCell className="max-w-48 truncate" title={store.address ?? undefined}>
                    {store.address ?? '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{store.timezone}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StoreDialog store={store} />
                      {canManageStores && <StoreDeleteButton storeId={store.id} name={store.name} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
