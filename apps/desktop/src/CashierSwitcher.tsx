import { useState } from 'react';
import { findStaffAndCheckPinLocally } from './pin';

interface ActiveCashier {
  id: number;
  email: string;
  name: string | null;
}

interface CashierSwitcherProps {
  active: ActiveCashier;
  onSwitch: (cashier: ActiveCashier) => void;
}

// Fast cashier switching (spec Section 6.1) - a shared till doesn't need a
// full logout/login (which would also drop the PowerSync connection) just
// to attribute the next sale to whoever's actually standing at the
// register. PIN check is instant and fully offline.
export function CashierSwitcher({ active, onSwitch }: CashierSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await findStaffAndCheckPinLocally(email, pin);
    if (!result || !result.valid) {
      setError('Incorrect email or PIN.');
      return;
    }
    onSwitch({ id: result.userId, email, name: result.name });
    setSwitching(false);
    setEmail('');
    setPin('');
  }

  if (!switching) {
    return (
      <div className="cashier-switcher">
        <span>Cashier: {active.name || active.email}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setSwitching(true)}>
          Switch
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSwitch} className="cashier-switch-form">
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
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
