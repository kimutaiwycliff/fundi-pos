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
import { StaffDialog } from './staff-dialog';

type Store = { id: number; name: string };
type Staff = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  store: { id: number; name: string } | number | null;
};

export default async function StaffPage() {
  const [{ docs: staff }, { docs: stores }] = await Promise.all([
    payloadFetch<{ docs: Staff[] }>('/api/users?sort=name&limit=100'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
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
                  <StaffDialog stores={stores} staff={person} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
