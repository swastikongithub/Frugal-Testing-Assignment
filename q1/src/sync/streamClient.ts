import type { TickFrame } from '../../shared/protocol';
import type { Telemetry } from '../lib/telemetry';
import type { SyncEngine } from './SyncEngine';

const RECONNECT_MS = 1000;

/** Opens the market WebSocket and feeds every tick frame into the sync engine. */
export function connectStream(engine: SyncEngine, telemetry: Telemetry): void {
  const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/stream`;

  const open = () => {
    const socket = new WebSocket(url);
    socket.addEventListener('message', (event) => {
      let frame: TickFrame;
      try {
        frame = JSON.parse(String(event.data)) as TickFrame;
      } catch {
        telemetry.frames.malformed += 1;
        return;
      }
      if (frame.type === 'tick' && Number.isInteger(frame.seq)) engine.onFrame(frame);
    });
    socket.addEventListener('close', () => {
      window.setTimeout(open, RECONNECT_MS);
    });
  };

  open();
}

export async function fetchSnapshot() {
  const res = await fetch('/api/snapshot', { cache: 'no-store' });
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  return res.json();
}
