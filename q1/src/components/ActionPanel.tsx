import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { telemetry } from '../lib/telemetry';
import { COLORS, prepareCanvas } from './canvas';

interface Props {
  symbol: string;
  quantity: string;
  onTap: (side: 'BUY' | 'SELL') => void;
}

/**
 * Canvas order pad: left half BUY, right half SELL. Because it is a canvas, the
 * browser cannot tell which "button" was hit; the app does its own hit test
 * and reports it to telemetry, which is how the tests detect coordinate mismatches.
 */
export function ActionPanel({ symbol, quantity, onTap }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { ctx, width, height } = prepareCanvas(canvas);
    const half = width / 2;
    const zones: Array<['BUY' | 'SELL', number, string]> = [
      ['BUY', 0, COLORS.up],
      ['SELL', half, COLORS.down],
    ];
    for (const [label, left, color] of zones) {
      ctx.fillStyle = label === 'BUY' ? 'rgba(46, 230, 166, 0.14)' : 'rgba(255, 92, 122, 0.14)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left + 3, 3, half - 6, height - 6, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '600 14px "JetBrains Mono", "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left + half / 2, height / 2 - 7);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px "JetBrains Mono", "Cascadia Code", Consolas, monospace';
      ctx.fillText(`QTY ${quantity}`, left + half / 2, height / 2 + 10);
    }
  }, [quantity]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const side = event.clientX - rect.left < rect.width / 2 ? 'BUY' : 'SELL';
    telemetry.annotateTap(event.nativeEvent, symbol, side);
    onTap(side);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'b') onTap('BUY');
    if (event.key === 's') onTap('SELL');
  };

  return (
    <canvas
      ref={ref}
      className="action-panel"
      data-testid="action-panel"
      data-zone={`action-panel:${symbol}`}
      role="application"
      aria-roledescription="order pad"
      aria-label={`${symbol} action panel`}
      aria-keyshortcuts="B S"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}
