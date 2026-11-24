import type { Ticket } from '../orders/OrderStore';
import { formatQuantity } from '../lib/format';
import { parseLenientQuantity, parseStrictQuantity } from '../lib/strictNumber';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  ticket: Ticket;
  mode: 'strict' | 'unsafe';
  onReset: () => void;
}

/**
 * The strip that appears above the action panel once a ticket exists. It is
 * inserted into the layout, so the action panel moves down when it appears.
 */
export function OrderSlot({ ticket, mode, onReset }: Props) {
  return (
    <div
      className={`order-slot state-${ticket.state}`}
      data-testid="order-slot"
      data-ticket-state={ticket.state}
      data-zone={`order-strip:${ticket.symbol}`}
    >
      <ErrorBoundary symbol={ticket.symbol}>
        {ticket.state === 'validation' && (
          <div data-testid="order-strip" role="status">
            VALIDATING {ticket.side} {ticket.quantity} · key {ticket.idempotencyKey.slice(0, 8)}
            {ticket.submits > 1 ? ` · resubmit #${ticket.submits}` : ''}
          </div>
        )}
        {ticket.state === 'confirmed' && <Receipt ticket={ticket} mode={mode} onReset={onReset} />}
        {ticket.state === 'rejected' && (
          <div data-testid="order-rejected" role="status">
            REJECTED · {ticket.error}{' '}
            <button type="button" className="link" onClick={onReset}>
              dismiss
            </button>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}

function Receipt({ ticket, mode, onReset }: Props) {
  const raw = ticket.confirmation?.quantity;
  // Parsed during render on purpose: in strict mode a bad value throws here and
  // the ErrorBoundary takes over, so a wrong quantity can never reach the screen.
  const quantity = mode === 'strict' ? parseStrictQuantity(raw) : parseLenientQuantity(raw);
  return (
    <div data-testid="order-receipt" role="status" data-quantity={String(quantity)}>
      FILLED {ticket.side} <b>{formatQuantity(quantity)}</b> @ {String(ticket.confirmation?.limitPrice)} ·{' '}
      {ticket.confirmation?.orderId}
      {ticket.confirmation?.duplicate ? ' · dedup' : ''}{' '}
      <button type="button" className="link" onClick={onReset}>
        new order
      </button>
    </div>
  );
}
