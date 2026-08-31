'use client';

import { Button } from '@/components/ui/button';
import { CustomerPicker } from './customer-picker';
import type { CustomerRef } from './page';
import type { TenderType } from './types';

// Cash and M-Pesa both settle the instant a sale is rung up - M-Pesa here is
// purely a tender-type label for how the customer paid (they pay the
// till/paybill directly, outside this app), matching apps/desktop/src/
// Till.tsx's deliberate no-STK-push design. Credit is a "pay later" tab,
// always tied to a customer.
const TENDER_OPTIONS: Array<{ value: TenderType; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'credit', label: 'Credit' },
];

export function TenderPicker({
  value,
  onChange,
  customers,
  selectedCustomer,
  onSelectCustomer,
  onCustomerCreated,
}: {
  value: TenderType;
  onChange: (value: TenderType) => void;
  customers: CustomerRef[];
  selectedCustomer: CustomerRef | null;
  onSelectCustomer: (customer: CustomerRef | null) => void;
  onCustomerCreated: (customer: CustomerRef) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Tender type" className="grid grid-cols-3 gap-1.5">
        {TENDER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? 'default' : 'outline'}
            size="lg"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {value === 'credit' ? (
        <CustomerPicker
          customers={customers}
          value={selectedCustomer}
          onChange={onSelectCustomer}
          onCreated={onCustomerCreated}
        />
      ) : null}
    </div>
  );
}
