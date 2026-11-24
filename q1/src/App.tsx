import { useEffect, useSyncExternalStore } from 'react';
import { engine, orders } from './appState';
import { PARSE_MODE } from './lib/config';
import { InstrumentRow } from './components/InstrumentRow';
import { Skeleton } from './components/Skeleton';
import { TelemetryPanel } from './components/TelemetryPanel';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';

const SKELETON_ROWS = 6;

export function App() {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);
  useSyncExternalStore(orders.subscribe, orders.getVersion);
  const state = engine.state;

  // "false" has been committed. Store updates are synchronous in React, so this
  // effect can run before the browser paints; wait two animation frames so the
  // desynchronised state (skeleton + loader) is actually on screen before syncing.
  useEffect(() => {
    if (state !== 'false') return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => engine.beginSync());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [state]);

  return (
    <div id="terminal" data-state-sync={state} data-parse-mode={PARSE_MODE}>
      <TopBar state={state} seq={engine.appliedSeq} />
      <div className="layout">
        <main className="watchlist" aria-label="Watchlist">
          {state === 'synchronized' ? (
            [...engine.instruments.values()].map((inst) => {
              const ticket = orders.get(inst.symbol);
              return (
                <InstrumentRow
                  // Re-mount on new snapshot data (epoch) and on every order update (revision).
                  key={`${inst.symbol}:${engine.epoch}:${ticket?.revision ?? 0}`}
                  inst={inst}
                  ticket={ticket}
                  version={version}
                  onTap={(symbol, side, price) => orders.submit(symbol, side, price)}
                  onReset={(symbol) => orders.reset(symbol)}
                />
              );
            })
          ) : (
            <Skeleton state={state} rows={SKELETON_ROWS} />
          )}
        </main>
        <TelemetryPanel />
      </div>
      <Toasts />
    </div>
  );
}
