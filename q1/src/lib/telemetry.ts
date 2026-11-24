import type { StateAtSeq } from '../../shared/protocol';

export type SyncState = 'false' | 'syncing' | 'synchronized';

export interface Transition {
  from: SyncState | null;
  to: SyncState;
  /** performance.now() when the engine changed state. */
  at: number;
  /** Last applied sequence at the moment of the transition. */
  seq: number;
  /** Loader canvas frame counter at the moment of the transition. */
  loaderFrame: number;
  reason: string;
}

export interface SkeletonCycle {
  cycle: number;
  shownAt: number;
  /** Taken in the skeleton's layout-effect cleanup, i.e. in the commit that removes it from the DOM. */
  hiddenAt: number | null;
  /** Two animation frames after hiddenAt: the frame without the skeleton has been painted. */
  paintSettledAt: number | null;
}

export interface TapRecord {
  id: number;
  /** event.timeStamp, same clock as performance.now(). */
  at: number;
  x: number;
  y: number;
  /** data-zone of the element under the pointer, e.g. "action-panel:BTC-USD" or "order-strip:BTC-USD". */
  target: string;
  /** Filled in by the action-panel canvas itself when the tap lands on it. */
  hitSymbol?: string;
  hitZone?: 'BUY' | 'SELL';
}

export interface Telemetry {
  transitions: Transition[];
  skeleton: SkeletonCycle[];
  paintSettledAt: number | null;
  frames: {
    received: number;
    applied: number;
    gaps: number;
    outOfOrder: number;
    staleDiscarded: number;
    malformed: number;
    lastAgeMs: number;
    maxAgeMs: number;
  };
  gapsLog: Array<{ expected: number; got: number; at: number }>;
  snapshots: { requested: number; applied: number };
  appliedSeq: number;
  loaderFrame: number;
  taps: TapRecord[];
  boundaryErrors: Array<{ at: number; symbol: string; name: string; message: string }>;
  orderEvents: Array<{ at: number; symbol: string; event: string; detail?: string }>;
  longTasks: Array<{ start: number; duration: number }>;
  stateAt: () => StateAtSeq;
  skeletonShown: () => SkeletonCycle;
  skeletonHidden: (cycle: SkeletonCycle) => void;
  annotateTap: (event: Event, symbol: string, zone: 'BUY' | 'SELL') => void;
}

declare global {
  interface Window {
    __telemetry: Telemetry;
  }
}

const LOG_CAP = 1000;
const capped = <T>(list: T[], item: T) => {
  list.push(item);
  if (list.length > LOG_CAP) list.shift();
};

function createTelemetry(): Telemetry {
  let tapId = 0;
  let lastTapEvent: Event | null = null;
  let lastTap: TapRecord | null = null;

  const t: Telemetry = {
    transitions: [],
    skeleton: [],
    paintSettledAt: null,
    frames: { received: 0, applied: 0, gaps: 0, outOfOrder: 0, staleDiscarded: 0, malformed: 0, lastAgeMs: 0, maxAgeMs: 0 },
    gapsLog: [],
    snapshots: { requested: 0, applied: 0 },
    appliedSeq: 0,
    loaderFrame: 0,
    taps: [],
    boundaryErrors: [],
    orderEvents: [],
    longTasks: [],
    stateAt: () => ({ seq: 0, prices: {} }),

    skeletonShown() {
      const cycle: SkeletonCycle = { cycle: t.skeleton.length, shownAt: performance.now(), hiddenAt: null, paintSettledAt: null };
      t.skeleton.push(cycle);
      return cycle;
    },

    skeletonHidden(cycle) {
      cycle.hiddenAt = performance.now();
      // rAF #1 runs before the frame that no longer contains the skeleton is painted,
      // rAF #2 runs after it, so by then the removal is on screen.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          cycle.paintSettledAt = performance.now();
          t.paintSettledAt = cycle.paintSettledAt;
        }),
      );
    },

    annotateTap(event, symbol, zone) {
      if (event === lastTapEvent && lastTap) {
        lastTap.hitSymbol = symbol;
        lastTap.hitZone = zone;
      }
    },
  };

  // Capture phase: every tap is logged with what was under the pointer, before any
  // component handler runs. Tests read this to detect canvas coordinate mismatches.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const el = event.target instanceof Element ? event.target : null;
      const zone = el?.closest('[data-zone]')?.getAttribute('data-zone') ?? el?.tagName.toLowerCase() ?? 'unknown';
      lastTapEvent = event;
      lastTap = { id: ++tapId, at: event.timeStamp, x: event.clientX, y: event.clientY, target: zone };
      capped(t.taps, lastTap);
    },
    true,
  );

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) capped(t.longTasks, { start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long-task timing is a Chromium feature; other browsers just report none.
  }

  return t;
}

export const telemetry: Telemetry = createTelemetry();
window.__telemetry = telemetry;

export const logCapped = capped;
