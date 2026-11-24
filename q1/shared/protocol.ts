// Wire protocol shared by the mock exchange (server/) and the terminal (src/).
// Frames are deltas: each one only carries the instruments that moved, so a
// missing frame leaves the client with wrong prices until it resynchronises.

export interface PriceChange {
  symbol: string;
  price: number;
}

export interface TickFrame {
  type: 'tick';
  /** Strictly increasing by exactly 1 per frame. A jump means frames were lost. */
  seq: number;
  /** Server wall clock (ms) when the frame was produced. */
  ts: number;
  changes: PriceChange[];
}

export interface InstrumentSnapshot {
  symbol: string;
  decimals: number;
  price: number;
  /** One point per server tick, oldest first. */
  history: number[];
}

export interface MarketSnapshot {
  seq: number;
  ts: number;
  instruments: InstrumentSnapshot[];
}

export interface StateAtSeq {
  seq: number;
  prices: Record<string, number>;
}

export interface OrderRequestBody {
  sessionId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  /** Sent as a decimal integer string, e.g. "500". This is the field test d tampers with. */
  quantity: string;
  limitPrice: string;
}

export interface OrderConfirmation {
  orderId: string;
  status: 'CONFIRMED';
  symbol: string;
  side: 'BUY' | 'SELL';
  /** Echoed back exactly as received, so the client must validate it before rendering. */
  quantity: unknown;
  limitPrice: unknown;
  duplicate: boolean;
}

export interface OrderLedger {
  session: string;
  received: number;
  recorded: number;
  requests: Array<{
    at: number;
    idempotencyKey: string | null;
    rawBody: string;
    quantityRaw: unknown;
    outcome: 'RECORDED' | 'DUPLICATE' | 'REJECTED';
    error?: string;
  }>;
  orders: Array<{ orderId: string; idempotencyKey: string; quantityRaw: unknown; symbol: string; side: string }>;
}

export const HISTORY_POINTS = 120;
