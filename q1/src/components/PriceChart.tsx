import { useEffect, useRef } from 'react';
import { COLORS, prepareCanvas } from './canvas';

interface Props {
  symbol: string;
  history: number[];
  /** The history array is updated in place, so the engine version tells us when to redraw. */
  version: number;
}

/** Line chart of the last 120 ticks, redrawn in place on every applied frame. */
export function PriceChart({ symbol, history, version }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || history.length < 2) return;
    const { ctx, width, height } = prepareCanvas(canvas);
    const min = Math.min(...history);
    const max = Math.max(...history);
    const span = max - min || 1;
    const x = (i: number) => (i / (history.length - 1)) * width;
    const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
    const rising = history[history.length - 1]! >= history[0]!;
    const color = rising ? COLORS.up : COLORS.down;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(0, (height / 4) * g);
      ctx.lineTo(width, (height / 4) * g);
      ctx.stroke();
    }

    ctx.beginPath();
    history.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, rising ? 'rgba(46, 230, 166, 0.22)' : 'rgba(255, 92, 122, 0.22)');
    fill.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fill;
    ctx.fill();

    const last = history[history.length - 1]!;
    ctx.beginPath();
    ctx.arc(width - 3, y(last), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [history, version]);

  return <canvas ref={ref} className="price-chart" role="img" aria-label={`${symbol} price chart`} />;
}
