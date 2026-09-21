import { redirect } from 'next/navigation';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import type { Product, StoreRef } from '../../sell/page';
import { QuotationBuilder } from './quotation-builder';

export default async function NewQuotationPage() {
  const me = await getCurrentUser();
  // Same manager/owner gate as the list page - Quotations.ts's create
  // access would 403 a cashier anyway, this just avoids handing them a
  // form that can only fail.
  if (me.role !== 'owner' && me.role !== 'manager') redirect('/dashboard');

  // Same product-picking chain as the Sell page (ProductSearch,
  // VariantPickerDialog) reused as-is, so the same product shape/query is
  // needed here - see quotation-builder.tsx for why stock levels aren't
  // fetched (a quotation is never gated by stock-on-hand).
  const [{ docs: products }, { docs: stores }, { docs: mediaDocs }] = await Promise.all([
    payloadFetch<{ docs: Product[] }>('/api/products?sort=name&limit=1000&depth=0&where[isActive][equals]=true'),
    payloadFetch<{ docs: StoreRef[] }>('/api/stores?sort=name&limit=100'),
    payloadFetch<{ docs: { id: number; url: string }[] }>('/api/media?limit=1000&depth=0'),
  ]);
  const mediaUrlById: Record<number, string> = Object.fromEntries(mediaDocs.map((m) => [m.id, m.url]));

  return (
    <QuotationBuilder me={me} products={products} stores={stores} mediaUrlById={mediaUrlById} />
  );
}
