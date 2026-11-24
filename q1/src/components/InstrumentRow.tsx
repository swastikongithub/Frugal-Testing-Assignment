import { useState } from 'react';
import type { InstrumentView } from '../sync/SyncEngine';
import type { Ticket } from '../orders/OrderStore';
import { DEFAULT_QUANTITY, PARSE_MODE } from '../lib/config';
import { formatPct, formatPrice } from '../lib/format';
import { ActionPanel } from './ActionPanel';
import { OrderSlot } from './OrderSlot';
import { PriceChart } from './PriceChart';

let mountCounter = 0;

interface Props {
  inst: InstrumentView;
  ticket: Ticket | undefined;
  version: number;
  onTap: (symbol: string, side: 'BUY' | 'SELL', limitPrice: string) => void;
  onReset: (symbol: string) => void;
}

export function InstrumentRow({ inst, ticket, version, onTap, onReset }: Props) {
  // A new id per mount makes re-mounts visible in the DOM (and in test evidence).
  const [mountId] = useState(() => ++mountCounter);
  const open = inst.history[0] ?? inst.price;
  const change = ((inst.price - open) / open) * 100;

  return (
    <article className="row" data-testid="instrument-row" data-symbol={inst.symbol} data-mount-id={mountId} aria-label={inst.symbol}>
      <div className="row-info">
        <div className="sym">{inst.symbol}</div>
        <div className="px">{formatPrice(inst.price, inst.decimals)}</div>
        <div className={change >= 0 ? 'chg up' : 'chg down'}>{formatPct(change)}</div>
      </div>
      <PriceChart symbol={inst.symbol} history={inst.history} version={version} />
      <div className="row-actions">
        {ticket && <OrderSlot ticket={ticket} mode={PARSE_MODE} onReset={() => onReset(inst.symbol)} />}
        <ActionPanel
          symbol={inst.symbol}
          quantity={DEFAULT_QUANTITY}
          onTap={(side) => onTap(inst.symbol, side, inst.price.toFixed(inst.decimals))}
        />
      </div>
    </article>
  );
}
