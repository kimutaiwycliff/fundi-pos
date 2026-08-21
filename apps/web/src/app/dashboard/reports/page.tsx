import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';

interface SalesSummary {
  totalSales: number;
  totalTax: number;
  orderCount: number;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byStore: Array<{ store: number; revenue: number }>;
}

export default async function ReportsPage() {
  const summary = await payloadFetch<SalesSummary>('/api/reports/sales-summary');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Sales & margin</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total sales</CardDescription>
            <CardTitle className="text-2xl">{summary.totalSales.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders</CardDescription>
            <CardTitle className="text-2xl">{summary.orderCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Tax collected</CardDescription>
            <CardTitle className="text-2xl">{summary.totalTax.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <h2 className="text-lg font-medium">Top products</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Units sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.topProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No completed sales yet.
                </TableCell>
              </TableRow>
            ) : (
              summary.topProducts.map((p) => (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{p.quantity}</TableCell>
                  <TableCell className="text-right">{p.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-medium">By store</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.byStore.map((s) => (
              <TableRow key={s.store}>
                <TableCell>#{s.store}</TableCell>
                <TableCell className="text-right">{s.revenue.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
