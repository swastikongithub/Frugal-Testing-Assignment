import { telemetry } from '../lib/telemetry';
import { formatMs } from '../lib/format';

/** Live view of window.__telemetry, so the video shows what the tests are reading. */
export function TelemetryPanel() {
  const f = telemetry.frames;
  const lastSkeleton = telemetry.skeleton[telemetry.skeleton.length - 1];
  return (
    <aside className="telemetry" aria-label="Sync telemetry">
      <h2>SYNC TELEMETRY</h2>
      <dl className="kv">
        <dt>frames rx / applied</dt>
        <dd>
          {f.received} / {f.applied}
        </dd>
        <dt>gaps</dt>
        <dd className={f.gaps ? 'warn' : ''}>{f.gaps}</dd>
        <dt>out of order</dt>
        <dd className={f.outOfOrder ? 'warn' : ''}>{f.outOfOrder}</dd>
        <dt>stale discarded</dt>
        <dd>{f.staleDiscarded}</dd>
        <dt>frame age (last / max)</dt>
        <dd>
          {f.lastAgeMs} / {f.maxAgeMs} ms
        </dd>
        <dt>snapshots req / applied</dt>
        <dd>
          {telemetry.snapshots.requested} / {telemetry.snapshots.applied}
        </dd>
        <dt>skeleton cycles</dt>
        <dd>{telemetry.skeleton.length}</dd>
        <dt>last paint-settled</dt>
        <dd>{formatMs(lastSkeleton?.paintSettledAt)}</dd>
        <dt>long tasks</dt>
        <dd>{telemetry.longTasks.length}</dd>
      </dl>

      <h3>STATE TRANSITIONS</h3>
      <ol className="log">
        {telemetry.transitions.slice(-7).map((t, i) => (
          <li key={`${t.at}-${i}`}>
            <span className="muted">{t.at.toFixed(0).padStart(6, ' ')}</span> {t.from ?? '∅'} → <b>{t.to}</b>{' '}
            <span className="muted">
              #{t.seq} f{t.loaderFrame}
            </span>
          </li>
        ))}
      </ol>

      <h3>TAPS</h3>
      <ol className="log">
        {telemetry.taps.slice(-5).map((t) => (
          <li key={t.id}>
            <span className="muted">{t.at.toFixed(1)}</span> {t.target}
            {t.hitZone ? ` → ${t.hitZone}` : ''}
          </li>
        ))}
      </ol>
    </aside>
  );
}
