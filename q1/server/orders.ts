import { randomUUID } from 'node:crypto';
import type { OrderConfirmation, OrderLedger } from '../shared/protocol';

type SubmitResult =
  | { ok: true; status: 200 | 201; body: OrderConfirmation }
  | { ok: false; status: 400; body: { error: string; message: string } };

/**
 * Transaction store, partitioned by test session so parallel or repeated runs
 * never see each other's orders.
 *
 * Deliberately lenient: it stores and echoes the quantity exactly as received.
 * That puts the burden of validating the echoed value on the client, which is
 * exactly what test d probes.
 */
export class OrderStore {
  private readonly ledgers = new Map<string, OrderLedger>();

  ledger(session: string): OrderLedger {
    let ledger = this.ledgers.get(session);
    if (!ledger) {
      ledger = { session, received: 0, recorded: 0, requests: [], orders: [] };
      this.ledgers.set(session, ledger);
    }
    return ledger;
  }

  submit(session: string, idempotencyKey: string | null, rawBody: string): SubmitResult {
    const ledger = this.ledger(session);
    ledger.received += 1;
    const entry: OrderLedger['requests'][number] = {
      at: Date.now(),
      idempotencyKey,
      rawBody,
      quantityRaw: undefined,
      outcome: 'REJECTED',
    };
    ledger.requests.push(entry);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch (err) {
      entry.error = 'INVALID_JSON';
      return { ok: false, status: 400, body: { error: 'INVALID_JSON', message: (err as Error).message } };
    }
    entry.quantityRaw = parsed.quantity;

    if (!idempotencyKey) {
      entry.error = 'MISSING_IDEMPOTENCY_KEY';
      return {
        ok: false,
        status: 400,
        body: { error: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required' },
      };
    }

    const existing = ledger.orders.find((o) => o.idempotencyKey === idempotencyKey);
    if (existing) {
      entry.outcome = 'DUPLICATE';
      return { ok: true, status: 200, body: this.confirmation(existing.orderId, parsed, true) };
    }

    const orderId = `ord_${randomUUID().slice(0, 8)}`;
    ledger.orders.push({
      orderId,
      idempotencyKey,
      quantityRaw: parsed.quantity,
      symbol: String(parsed.symbol),
      side: String(parsed.side),
    });
    ledger.recorded += 1;
    entry.outcome = 'RECORDED';
    return { ok: true, status: 201, body: this.confirmation(orderId, parsed, false) };
  }

  private confirmation(orderId: string, parsed: Record<string, unknown>, duplicate: boolean): OrderConfirmation {
    return {
      orderId,
      status: 'CONFIRMED',
      symbol: String(parsed.symbol),
      side: parsed.side === 'SELL' ? 'SELL' : 'BUY',
      quantity: parsed.quantity,
      limitPrice: parsed.limitPrice,
      duplicate,
    };
  }
}
