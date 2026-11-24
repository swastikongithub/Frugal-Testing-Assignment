import type { MarketSnapshot, StateAtSeq, TickFrame } from '../shared/protocol';
import { HISTORY_POINTS } from '../shared/protocol';

interface Instrument {
  symbol: string;
  decimals: number;
  price: number;
  /** Per-tick volatility used by the random walk. */
  vol: number;
  history: number[];
}

const SEED_INSTRUMENTS: Array<Omit<Instrument, 'history'>> = [
  { symbol: 'BTC-USD', decimals: 2, price: 64250.0, vol: 0.0009 },
  { symbol: 'ETH-USD', decimals: 2, price: 3120.5, vol: 0.0012 },
  { symbol: 'SOL-USD', decimals: 2, price: 148.2, vol: 0.002 },
  { symbol: 'AVAX-USD', decimals: 2, price: 36.75, vol: 0.0022 },
  { symbol: 'LINK-USD', decimals: 3, price: 14.82, vol: 0.002 },
  { symbol: 'DOGE-USD', decimals: 4, price: 0.1623, vol: 0.003 },
];

/** Keeps the price at every seq for a few minutes so tests can check the client has zero drift. */
const STATE_RING_SIZE = 6000;
const MIN_INTERVAL_MS = 50; // 20 frames/s
const MAX_INTERVAL_MS = 100; // 10 frames/s

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/**
 * A random-walk market that emits one delta frame every 50-100 ms.
 * Sequence numbers start at 1 and increase by exactly 1 per frame.
 */
export class MarketFeed {
  private readonly instruments: Instrument[];
  private readonly stateRing = new Map<number, Record<string, number>>();
  private readonly listeners = new Set<(frame: TickFrame) => void>();
  private timer: NodeJS.Timeout | undefined;
  private seq = 0;

  constructor() {
    this.instruments = SEED_INSTRUMENTS.map((i) => ({
      ...i,
      history: Array.from({ length: HISTORY_POINTS }, () => i.price),
    }));
    this.remember();
  }

  start(): void {
    const loop = () => {
      this.tick();
      const nextIn = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      this.timer = setTimeout(loop, nextIn);
    };
    this.timer = setTimeout(loop, MIN_INTERVAL_MS);
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  onFrame(listener: (frame: TickFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  head(): number {
    return this.seq;
  }

  snapshot(): MarketSnapshot {
    return {
      seq: this.seq,
      ts: Date.now(),
      instruments: this.instruments.map((i) => ({
        symbol: i.symbol,
        decimals: i.decimals,
        price: i.price,
        history: [...i.history],
      })),
    };
  }

  stateAt(seq: number): StateAtSeq | undefined {
    const prices = this.stateRing.get(seq);
    return prices ? { seq, prices: { ...prices } } : undefined;
  }

  private tick(): void {
    this.seq += 1;
    // Move 1-3 instruments; the rest are unchanged and not sent (delta frame).
    const moves = 1 + Math.floor(Math.random() * 3);
    const moved = new Set<Instrument>();
    while (moved.size < moves) {
      moved.add(this.instruments[Math.floor(Math.random() * this.instruments.length)]!);
    }
    for (const inst of moved) {
      const drift = (Math.random() - 0.5) * 2 * inst.vol;
      inst.price = round(Math.max(inst.price * (1 + drift), 10 ** -inst.decimals), inst.decimals);
    }
    for (const inst of this.instruments) {
      inst.history.push(inst.price);
      if (inst.history.length > HISTORY_POINTS) inst.history.shift();
    }
    this.remember();

    const frame: TickFrame = {
      type: 'tick',
      seq: this.seq,
      ts: Date.now(),
      changes: [...moved].map((i) => ({ symbol: i.symbol, price: i.price })),
    };
    for (const listener of this.listeners) listener(frame);
  }

  private remember(): void {
    this.stateRing.set(
      this.seq,
      Object.fromEntries(this.instruments.map((i) => [i.symbol, i.price])),
    );
    this.stateRing.delete(this.seq - STATE_RING_SIZE);
  }
}
