'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Product = { id: number; name: string; sku: string };

// A plain <Select> is unusable once a catalog has more than a couple dozen
// products (this project's own demo dataset has 370+) - every form that
// picks one product out of the whole catalog needs to be searchable, not
// just a giant dropdown someone has to scroll through.
export function ProductCombobox({
  products,
  value,
  onValueChange,
  placeholder = 'Search products…',
}: {
  products: Product[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => String(p.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected ? `${selected.name} (${selected.sku})` : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or SKU..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.sku}`}
                  onSelect={() => {
                    onValueChange(String(product.id));
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 size-4', String(product.id) === value ? 'opacity-100' : 'opacity-0')} />
                  {product.name} <span className="ml-1 text-muted-foreground">({product.sku})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
