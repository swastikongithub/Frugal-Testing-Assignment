import { useLayoutEffect } from 'react';
import type { SyncState } from '../lib/telemetry';
import { telemetry } from '../lib/telemetry';
import { LoaderCanvas } from './LoaderCanvas';

/**
 * Replaces the watchlist while the book is not trustworthy. A layout effect
 * records show/hide times inside the same commit that adds/removes the DOM,
 * so the timestamps match what the browser is about to paint.
 */
export function Skeleton({ state, rows }: { state: SyncState; rows: number }) {
  useLayoutEffect(() => {
    const cycle = telemetry.skeletonShown();
    return () => telemetry.skeletonHidden(cycle);
  }, []);

  return (
    <section className="skeleton" data-testid="loading-skeleton" aria-busy="true" aria-label="Resynchronising market data">
      <div className="sync-banner">
        <LoaderCanvas />
        <div>
          <div className="sync-title">{state === 'false' ? 'SEQUENCE GAP — BOOK DESYNCHRONISED' : 'RESYNCING FROM SNAPSHOT'}</div>
          <div className="sync-sub">
            {state === 'false'
              ? 'Live frames are missing. Prices on screen would be wrong, so they are hidden.'
              : 'Fetched REST snapshot; waiting for contiguous live frames to confirm.'}
          </div>
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="row skeleton-row" key={i}>
          <div className="shimmer w-28" />
          <div className="shimmer chart" />
          <div className="shimmer w-40" />
        </div>
      ))}
    </section>
  );
}
