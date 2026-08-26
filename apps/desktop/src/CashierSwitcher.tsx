import { useState } from 'react';
import { findStaffAndCheckPinLocally } from './pin';

interface ActiveCashier {
  id: number;
  phone: string | null;
  name: string | null;
}

interface CashierSwitcherProps {
  active: ActiveCashier;
  onSwitch: (cashier: ActiveCashier) => void;
  // A shift belongs to a specific cashier (ShiftPanel.tsx) - switching away
  // mid-shift would leave it open under someone no longer at the register,
  // so the switch itself is blocked (not just discouraged) while one is
  // open. `canSwitch` gates the button; `onBlocked` lets Till.tsx surface
  // the "close your shift first" notice instead of silently doing nothing.
  canSwitch: boolean;
  onBlocked: () => void;
}

// Fast cashier switching (spec Section 6.1) - a shared till doesn't need a
// full logout/login (which would also drop the PowerSync connection) just
// to attribute the next sale to whoever's actually standing at the
// register. PIN check is instant and fully offline.
export function CashierSwitcher({ active, onSwitch, canSwitch, onBlocked }: CashierSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await findStaffAndCheckPinLocally(phone, pin);
    if (!result || !result.valid) {
      setError('Incorrect phone number or PIN.');
      return;
    }
    onSwitch({ id: result.userId, phone, name: result.name });
    setSwitching(false);
    setPhone('');
    setPin('');
  }

  function handleSwitchClick() {
    if (!canSwitch) {
      onBlocked();
      return;
    }
    setSwitching(true);
  }

  if (!switching) {
    return (
      <div className="cashier-switcher">
        <span>Cashier: {active.name || active.phone || `#${active.id}`}</span>
        <button className="btn btn-secondary btn-sm" onClick={handleSwitchClick}>
          Switch
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSwitch} className="cashier-switch-form">
      <input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
      <input type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.currentTarget.value)} />
      <button type="submit" className="btn btn-primary btn-sm">
        Confirm
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitching(false)}>
        Cancel
      </button>
      {error && <span className="cashier-switch-error">{error}</span>}
    </form>
  );
}
