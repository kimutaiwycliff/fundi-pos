import type { ReactNode } from 'react';
import { XIcon } from './icons';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Purely presentational shell used to host VoidOrderPanel, PrinterSettings,
// and the held-sales list as slide-over panels instead of always-rendered
// blocks stacked below the cart - none of those components' own state or
// handlers change, they just render as `children` here.
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  if (!open) return null;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="drawer-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
