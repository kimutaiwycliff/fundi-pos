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

type Staff = { id: number; email: string; role: string; store: { name: string } | number | null };

export default async function StaffPage() {
  const { docs: staff } = await payloadFetch<{ docs: Staff[] }>('/api/users?sort=email&limit=100');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Staff</h1>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Store</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((person) => (
              <TableRow key={person.id}>
                <TableCell>{person.email}</TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
