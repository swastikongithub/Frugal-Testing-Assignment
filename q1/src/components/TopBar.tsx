import type { SyncState } from '../lib/telemetry';
import { PARSE_MODE, SESSION_ID } from '../lib/config';

const STATE_LABEL: Record<SyncState, string> = {
  false: 'DESYNC',
  syncing: 'SYNCING',
  synchronized: 'LIVE',
};

export function TopBar({ state, seq }: { state: SyncState; seq: number }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◢◤</span> DRIFTDESK <span className="tag">MOCK EXCHANGE · LOCAL DATA</span>
      </div>
      <div className="topbar-stats">
        <span className={`pill pill-${state}`} data-testid="sync-pill">
          {STATE_LABEL[state]}
        </span>
        <span>
          SEQ <b data-testid="applied-seq">{seq}</b>
        </span>
        <span className={PARSE_MODE === 'unsafe' ? 'mode unsafe' : 'mode'}>
          PARSER {PARSE_MODE === 'unsafe' ? 'UNSAFE (?unsafe=1)' : 'STRICT'}
        </span>
        <span className="muted">session {SESSION_ID.slice(0, 13)}</span>
      </div>
    </header>
  );
}
