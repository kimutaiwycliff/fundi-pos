import { Badge } from '@/components/ui/badge';
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
import { StaffDialog } from './staff-dialog';
import { StaffStatusActions } from './staff-status-actions';

type Store = { id: number; name: string };
type Staff = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  status: 'active' | 'banned';
  store: { id: number; name: string } | number | null;
};

export default async function StaffPage() {
  const [{ docs: staff }, { docs: stores }, me] = await Promise.all([
    payloadFetch<{ docs: Staff[] }>('/api/users?sort=name&limit=100'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const canManageStaff = me.role === 'owner' || me.role === 'manager';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <StaffDialog stores={stores} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="font-medium">{person.name ?? '—'}</TableCell>
                <TableCell>{person.email}</TableCell>
                <TableCell>{person.phone ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={person.role === 'owner' ? 'default' : 'secondary'}>{person.role}</Badge>
                </TableCell>
                <TableCell>
                  {person.store == null
                    ? 'All stores'
                    : typeof person.store === 'object'
                      ? person.store.name
                      : `#${person.store}`}
                </TableCell>
                <TableCell>
                  <Badge variant={person.status === 'banned' ? 'destructive' : 'secondary'}>
                    {person.status === 'banned' ? 'Banned' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StaffDialog stores={stores} staff={person} />
                    {canManageStaff && person.id !== me.id && (
                      <StaffStatusActions staffId={person.id} status={person.status} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
