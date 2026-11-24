import type { MarketSnapshot, TickFrame } from '../../shared/protocol';
import { HISTORY_POINTS } from '../../shared/protocol';
import type { SyncState, Telemetry } from '../lib/telemetry';
import { logCapped } from '../lib/telemetry';

export interface InstrumentView {
  symbol: string;
  decimals: number;
  price: number;
  history: number[];
}

/** Contiguous live frames that must follow a snapshot before we call the book synchronized. */
const CONFIRM_FRAMES = 2;
/** At most one snapshot request per 250 ms while frames keep failing to line up. */
const REFETCH_MIN_GAP_MS = 250;
/** If syncing makes no progress for this long, ask for a fresh snapshot anyway. */
const SYNC_WATCHDOG_MS = 1000;
const BUFFER_CAP = 500;

/**
 * Sequence-checked resync state machine (the same idea as an exchange's
 * "local order book" recipe):
 *
 *   synchronized --gap--> false --UI painted it--> syncing --snapshot + 2 contiguous frames--> synchronized
 *
 * - seq == applied + 1  -> apply
 * - seq <= applied      -> stale / out of order, ignore
 * - seq >  applied + 1  -> gap: frames were lost, our prices are now wrong
 */
export class SyncEngine {
  state: SyncState = 'false';
  appliedSeq = 0;
  /** Increments on every applied snapshot; rows use it in their key so they re-mount on fresh data. */
  epoch = 0;
  version = 0;
  readonly instruments = new Map<string, InstrumentView>();

  private readonly buffer = new Map<number, TickFrame>();
  private readonly listeners = new Set<() => void>();
  private baseReady = false;
  private confirmRun = 0;
  private maxSeenSeq = 0;
  private lastFetchAt = Number.NEGATIVE_INFINITY;
  private fetchInFlight = false;
  private watchdog: number | undefined;

  constructor(
    private readonly fetchSnapshot: () => Promise<MarketSnapshot>,
    private readonly telemetry: Telemetry,
  ) {
    telemetry.stateAt = () => ({
      seq: this.appliedSeq,
      prices: Object.fromEntries([...this.instruments.values()].map((i) => [i.symbol, i.price])),
    });
    this.recordTransition(null, 'false', 'boot: no data yet');
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  onFrame(frame: TickFrame): void {
    const stats = this.telemetry.frames;
    stats.received += 1;
    stats.lastAgeMs = Date.now() - frame.ts;
    stats.maxAgeMs = Math.max(stats.maxAgeMs, stats.lastAgeMs);
    if (frame.seq < this.maxSeenSeq) stats.outOfOrder += 1;
    this.maxSeenSeq = Math.max(this.maxSeenSeq, frame.seq);

    if (this.state === 'synchronized') {
      if (frame.seq <= this.appliedSeq) {
        stats.staleDiscarded += 1;
        return;
      }
      if (frame.seq === this.appliedSeq + 1) {
        this.apply(frame);
        this.emit();
        return;
      }
      stats.gaps += 1;
      logCapped(this.telemetry.gapsLog, { expected: this.appliedSeq + 1, got: frame.seq, at: performance.now() });
      this.bufferFrame(frame);
      this.transition('false', `gap: expected seq ${this.appliedSeq + 1}, got ${frame.seq}`);
      this.emit();
      return;
    }

    if (this.baseReady && frame.seq <= this.appliedSeq) {
      stats.staleDiscarded += 1;
      return;
    }
    this.bufferFrame(frame);
    if (this.state === 'syncing' && this.baseReady) this.drain(true);
  }

  /** Called by the UI once the "false" state has been committed, so the desync is always visible. */
  beginSync(): void {
    if (this.state !== 'false') return;
    this.transition('syncing', 'requesting REST snapshot');
    this.baseReady = false;
    this.confirmRun = 0;
    this.requestSnapshot();
    this.emit();
  }

  private requestSnapshot(): void {
    if (this.fetchInFlight || this.state !== 'syncing') return;
    const sinceLast = performance.now() - this.lastFetchAt;
    if (sinceLast < REFETCH_MIN_GAP_MS) {
      this.armWatchdog(REFETCH_MIN_GAP_MS - sinceLast);
      return;
    }
    this.fetchInFlight = true;
    this.lastFetchAt = performance.now();
    this.telemetry.snapshots.requested += 1;
    this.armWatchdog(SYNC_WATCHDOG_MS);
    this.fetchSnapshot()
      .then((snapshot) => {
        this.fetchInFlight = false;
        if (this.state === 'syncing') this.applySnapshot(snapshot);
      })
      .catch(() => {
        this.fetchInFlight = false;
      });
  }

  private applySnapshot(snapshot: MarketSnapshot): void {
    for (const inst of snapshot.instruments) {
      this.instruments.set(inst.symbol, { ...inst, history: [...inst.history] });
    }
    this.appliedSeq = snapshot.seq;
    this.telemetry.appliedSeq = snapshot.seq;
    this.baseReady = true;
    this.confirmRun = 0;
    this.epoch += 1;
    this.telemetry.snapshots.applied += 1;
    for (const seq of [...this.buffer.keys()]) {
      if (seq <= snapshot.seq) {
        this.buffer.delete(seq);
        this.telemetry.frames.staleDiscarded += 1;
      }
    }
    this.drain(false);
  }

  /**
   * Apply buffered frames that continue the snapshot, then decide whether we are synchronized.
   * Only frames that arrive live after the snapshot count as confirmation (`live`), so
   * "synchronized" always means the stream itself is flowing contiguously again.
   */
  private drain(live: boolean): void {
    for (let next = this.buffer.get(this.appliedSeq + 1); next; next = this.buffer.get(this.appliedSeq + 1)) {
      this.buffer.delete(next.seq);
      this.apply(next);
      if (live) this.confirmRun += 1;
    }
    if (this.confirmRun >= CONFIRM_FRAMES) {
      this.buffer.clear();
      window.clearTimeout(this.watchdog);
      this.transition('synchronized', `snapshot + ${this.confirmRun} contiguous frames`);
    } else if (this.buffer.size > 0) {
      // Frames beyond a hole: the missing one was dropped or is badly late. Re-anchor.
      this.requestSnapshot();
    }
    this.emit();
  }

  private apply(frame: TickFrame): void {
    for (const change of frame.changes) {
      const inst = this.instruments.get(change.symbol);
      if (inst) inst.price = change.price;
    }
    for (const inst of this.instruments.values()) {
      inst.history.push(inst.price);
      if (inst.history.length > HISTORY_POINTS) inst.history.shift();
    }
    this.appliedSeq = frame.seq;
    this.telemetry.appliedSeq = frame.seq;
    this.telemetry.frames.applied += 1;
  }

  private bufferFrame(frame: TickFrame): void {
    this.buffer.set(frame.seq, frame);
    if (this.buffer.size > BUFFER_CAP) {
      this.buffer.delete(Math.min(...this.buffer.keys()));
    }
  }

  private armWatchdog(ms: number): void {
    window.clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => {
      if (this.state === 'syncing' && !this.fetchInFlight) this.requestSnapshot();
    }, ms);
  }

  private transition(to: SyncState, reason: string): void {
    const from = this.state;
    this.state = to;
    this.recordTransition(from, to, reason);
  }

  private recordTransition(from: SyncState | null, to: SyncState, reason: string): void {
    if (to === 'false') this.telemetry.loaderFrame = 0;
    logCapped(this.telemetry.transitions, {
      from,
      to,
      at: performance.now(),
      seq: this.appliedSeq,
      loaderFrame: this.telemetry.loaderFrame,
      reason,
    });
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
