import { useState } from 'react';
import { getPrinterSettings, kickCashDrawer, setPrinterSettings } from './printer';

// UNVERIFIED against real hardware - see src/printer.ts / src-tauri/src/escpos.rs.
export function PrinterSettings() {
  const existing = getPrinterSettings();
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.port ?? 9100));
  const [status, setStatus] = useState<string | null>(null);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setPrinterSettings(host, Number(port) || 9100);
    setStatus('Saved.');
  }

  async function handleTestKick() {
    setStatus(null);
    try {
      await kickCashDrawer();
      setStatus('Drawer kick sent.');
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <form onSubmit={handleSave} className="printer-settings">
      <span>Receipt printer (network, port 9100 typical):</span>
      <input placeholder="Printer IP" value={host} onChange={(e) => setHost(e.currentTarget.value)} />
      <input placeholder="Port" value={port} onChange={(e) => setPort(e.currentTarget.value)} />
      <button type="submit" className="btn btn-primary btn-sm">
        Save
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={handleTestKick}>
        Test drawer kick
      </button>
      {status && <span className="printer-status">{status}</span>}
    </form>
  );
}
