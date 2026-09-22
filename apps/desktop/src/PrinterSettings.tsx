import { useEffect, useState } from 'react';
import type { PortInfo } from 'tauri-plugin-serialplugin-api';
import { getPrinterSettings, kickCashDrawer, listSerialPorts, setPrinterSettings, type PrinterTarget } from './printer';

// UNVERIFIED against real hardware - see src/printer.ts / src-tauri/src/escpos.rs.
export function PrinterSettings() {
  const existing = getPrinterSettings();
  const [kind, setKind] = useState<PrinterTarget['kind']>(existing?.kind ?? 'network');
  const [host, setHost] = useState(existing?.kind === 'network' ? existing.host : '');
  const [port, setPort] = useState(String(existing?.kind === 'network' ? existing.port : 9100));
  const [serialPath, setSerialPath] = useState(existing?.kind === 'usb' ? existing.path : '');
  const [baudRate, setBaudRate] = useState(String(existing?.kind === 'usb' ? existing.baudRate : 9600));
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function refreshPorts() {
    setPortsLoading(true);
    try {
      setPorts(await listSerialPorts());
    } catch (err) {
      setStatus(`Could not list USB/serial ports: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPortsLoading(false);
    }
  }

  // Ports are hot-pluggable - refresh once on switching to USB mode (not
  // continuously, kept simple as an explicit user action via the Refresh
  // button below too) rather than assuming whatever was true at mount.
  useEffect(() => {
    if (kind === 'usb') refreshPorts();
  }, [kind]);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (kind === 'usb') {
      if (!serialPath) {
        setStatus('Pick a USB/serial port first.');
        return;
      }
      setPrinterSettings({ kind: 'usb', path: serialPath, baudRate: Number(baudRate) || 9600 });
    } else {
      setPrinterSettings({ kind: 'network', host, port: Number(port) || 9100 });
    }
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
      <span>Receipt printer:</span>
      <div className="section-actions">
        <button type="button" className={`btn btn-sm ${kind === 'network' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKind('network')}>
          Network
        </button>
        <button type="button" className={`btn btn-sm ${kind === 'usb' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKind('usb')}>
          USB
        </button>
      </div>

      {kind === 'network' ? (
        <>
          <input placeholder="Printer IP" value={host} onChange={(e) => setHost(e.currentTarget.value)} />
          <input placeholder="Port (9100 typical)" value={port} onChange={(e) => setPort(e.currentTarget.value)} />
        </>
      ) : (
        <>
          <div className="section-actions">
            <select value={serialPath} onChange={(e) => setSerialPath(e.currentTarget.value)}>
              <option value="">{portsLoading ? 'Scanning...' : ports.length === 0 ? 'No USB/serial ports found' : 'Select a port...'}</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path}
                  {p.product && p.product !== 'Unknown' ? ` - ${p.product}` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" disabled={portsLoading} onClick={refreshPorts}>
              Refresh
            </button>
          </div>
          <input placeholder="Baud rate (9600 typical)" value={baudRate} onChange={(e) => setBaudRate(e.currentTarget.value)} />
        </>
      )}

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
