'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

type Store = { id: number; name: string };

interface UploadResult {
  createdCount: number;
  variantsAddedCount: number;
  skippedCount: number;
  errors: { row: number; message: string }[];
}

export function ImportProductsDialog({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState<string>(stores[0] ? String(stores[0].id) : '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a .xlsx file first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    if (storeId) formData.append('storeId', storeId);

    try {
      const response = await clientFetch('/api/products/bulk-upload', { method: 'POST', body: formData });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const message = errorMessageFrom(body, 'Upload failed');
        setError(message);
        toast.error(message);
        return;
      }

      const uploadResult = body as UploadResult;
      setResult(uploadResult);
      const variantNote = uploadResult.variantsAddedCount > 0 ? `, ${uploadResult.variantsAddedCount} variant${uploadResult.variantsAddedCount === 1 ? '' : 's'} added` : '';
      toast.success(
        `${uploadResult.createdCount} product${uploadResult.createdCount === 1 ? '' : 's'} created${variantNote}, ${uploadResult.skippedCount} skipped`,
      );
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Import from Excel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk import products</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <a
            href="/api/products/bulk-upload/template"
            className="text-sm text-primary underline underline-offset-2 w-fit"
          >
            Download the template spreadsheet
          </a>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-store">Store for opening stock (optional)</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger id="import-store">
                <SelectValue placeholder="No opening stock" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={String(store.id)}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">Filled-in spreadsheet</Label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".xlsx"
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                {result.createdCount} product{result.createdCount === 1 ? '' : 's'} created
                {result.variantsAddedCount > 0
                  ? `, ${result.variantsAddedCount} variant${result.variantsAddedCount === 1 ? '' : 's'} added`
                  : ''}
                , {result.skippedCount} skipped.
              </p>
              {result.errors.length > 0 ? (
                <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
