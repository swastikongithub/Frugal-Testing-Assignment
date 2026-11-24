import { useEffect, useRef } from 'react';
import { telemetry } from '../lib/telemetry';
import { COLORS, prepareCanvas } from './canvas';

/**
 * requestAnimationFrame spinner. Each painted frame bumps data-frame directly on
 * the element (not through React state), so an observer can prove the loader
 * was actually animating while the app was syncing.
 */
export function LoaderCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    let handle = 0;
    telemetry.loaderFrame = 0;

    const draw = () => {
      frame += 1;
      canvas.setAttribute('data-frame', String(frame));
      telemetry.loaderFrame = frame;

      const { ctx, width, height } = prepareCanvas(canvas);
      const r = Math.min(width, height) / 2 - 3;
      const start = (frame * 0.16) % (Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(92, 200, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = COLORS.accent;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, start, start + Math.PI * 1.2);
      ctx.stroke();

      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, []);

  return <canvas ref={ref} className="sync-loader" data-testid="sync-loader" data-frame="0" aria-hidden="true" />;
}
