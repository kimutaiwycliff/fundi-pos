import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardOverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Products</CardDescription>
            <CardTitle className="text-2xl">Manage catalog</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            SKUs, barcodes, pricing, and tax rates shared across all stores.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Stores</CardDescription>
            <CardTitle className="text-2xl">Multi-location</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Each store syncs only its own stock movements and orders.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Staff</CardDescription>
            <CardTitle className="text-2xl">Roles & PINs</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Owners and managers invite cashiers with fast till PIN login.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
