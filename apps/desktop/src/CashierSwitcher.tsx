import { useState } from 'react';
import { loginWithPin } from './auth';

interface ActiveCashier {
  id: number;
  phone: string | null;
  name: string | null;
  role: string;
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
// full logout/login just to attribute the next sale to whoever's actually
// standing at the register. This used to be a fully-offline local PIN check
// against a synced pin_hash row; now that this app is online-only (no local
// database at all), it goes through the real POST /api/auth/pin-login call
// instead (auth.ts's loginWithPin - the same call the main login screen
// uses) purely to verify the typed phone+PIN server-side and read back the
// switched-to person's id/name/role. The fresh payloadToken that call
// returns is deliberately discarded: the till keeps using its own original
// session token for every request either way (the `cashier` field on a new
// sale is an explicit value in the request body, not derived from the JWT -
// see orders.ts's submitOrder), so there's nothing to swap it into.
export function CashierSwitcher({ active, onSwitch, canSwitch, onBlocked }: CashierSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await loginWithPin(phone, pin);
      onSwitch({ id: user.id, phone: user.phone ?? phone, name: user.name ?? null, role: user.role });
      setSwitching(false);
      setPhone('');
      setPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect phone number or PIN.');
    } finally {
      setBusy(false);
    }
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
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? 'Checking...' : 'Confirm'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitching(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span className="cashier-switch-error">{error}</span>}
    </form>
  );
}
