import { ExportCards } from '@/components/platform/export-cards';

export const metadata = { title: 'Exports · Platform' };

export default function PlatformExportsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="text-sm text-muted-foreground">CSV files for Excel or Google Sheets. Dates are Nairobi days, inclusive.</p>
      </div>
      <ExportCards />
    </div>
  );
}
