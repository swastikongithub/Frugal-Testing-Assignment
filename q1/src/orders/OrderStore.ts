import type { OrderConfirmation, OrderRequestBody } from '../../shared/protocol';
import type { Telemetry } from '../lib/telemetry';
import { logCapped } from '../lib/telemetry';
import { toasts } from '../lib/toastBus';

/** validation = submitted and waiting for the gateway; the row shows a "VALIDATING" strip. */
export type TicketState = 'validation' | 'confirmed' | 'rejected';

export interface Ticket {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  /** Stays the same for every resubmission of this ticket, so the server can dedupe double taps. */
  idempotencyKey: string;
  state: TicketState;
  submits: number;
  /** Bumped on every state change; part of the row key, so the row re-mounts on order data. */
  revision: number;
  confirmation?: OrderConfirmation;
  error?: string;
}

export class OrderStore {
  private readonly tickets = new Map<string, Ticket>();
  private readonly listeners = new Set<() => void>();
  version = 0;

  constructor(
    private readonly session: string,
    private readonly defaultQuantity: string,
    private readonly telemetry: Telemetry,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  get(symbol: string): Ticket | undefined {
    return this.tickets.get(symbol);
  }

  /** A tap on BUY/SELL. Tapping the same side again resubmits the same ticket (same key). */
  submit(symbol: string, side: 'BUY' | 'SELL', limitPrice: string): void {
    const existing = this.tickets.get(symbol);
    if (existing && existing.side !== side) {
      this.event(symbol, 'ignored', `open ${existing.side} ticket; ${side} tap ignored`);
      return;
    }
    const ticket: Ticket = {
      symbol,
      side,
      quantity: existing?.quantity ?? this.defaultQuantity,
      idempotencyKey: existing?.idempotencyKey ?? crypto.randomUUID(),
      state: 'validation',
      submits: (existing?.submits ?? 0) + 1,
      revision: (existing?.revision ?? 0) + 1,
    };
    this.tickets.set(symbol, ticket);
    this.event(symbol, 'submit', `#${ticket.submits} key=${ticket.idempotencyKey.slice(0, 8)}`);
    this.emit();

    const body: OrderRequestBody = {
      sessionId: this.session,
      symbol,
      side,
      quantity: ticket.quantity,
      limitPrice,
    };
    fetch(`/api/orders?session=${encodeURIComponent(this.session)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': ticket.idempotencyKey },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) {
          this.settle(symbol, ticket.idempotencyKey, { state: 'confirmed', confirmation: json as unknown as OrderConfirmation });
        } else {
          this.reject(symbol, ticket.idempotencyKey, `HTTP ${res.status} ${String(json.error ?? 'ERROR')}`);
        }
      })
      .catch((err: unknown) => this.reject(symbol, ticket.idempotencyKey, String(err)));
  }

  reset(symbol: string): void {
    this.tickets.delete(symbol);
    this.event(symbol, 'reset');
    this.emit();
  }

  private reject(symbol: string, key: string, error: string): void {
    console.error(`[order-integrity] gateway rejected ${symbol} order: ${error}`);
    toasts.push('Order rejected by gateway', `${symbol}: ${error}. Nothing was filled.`);
    this.settle(symbol, key, { state: 'rejected', error });
  }

  private settle(symbol: string, key: string, patch: Partial<Ticket>): void {
    const ticket = this.tickets.get(symbol);
    if (!ticket || ticket.idempotencyKey !== key) return;
    this.tickets.set(symbol, { ...ticket, ...patch, revision: ticket.revision + 1 });
    this.event(symbol, patch.state ?? 'update', patch.error);
    this.emit();
  }

  private event(symbol: string, event: string, detail?: string) {
    logCapped(this.telemetry.orderEvents, { at: performance.now(), symbol, event, detail });
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
