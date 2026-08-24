import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { StoreDialog } from './store-dialog';

type Store = { id: number; name: string; address: string | null; timezone: string };

export default async function StoresPage() {
  const { docs: stores } = await payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stores</h1>
        <StoreDialog trigger={<Button>New store</Button>} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Timezone</TableHead>
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
                  <TableCell>{store.address ?? '—'}</TableCell>
                  <TableCell>{store.timezone}</TableCell>
                  <TableCell>
                    <StoreDialog
                      store={store}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    />
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
