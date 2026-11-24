/** Sizes a canvas backing store for the device pixel ratio and returns a context in CSS pixels. */
export function prepareCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pxW = Math.max(1, Math.round(width * dpr));
  const pxH = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export const COLORS = {
  up: '#2ee6a6',
  down: '#ff5c7a',
  grid: 'rgba(148, 163, 184, 0.08)',
  text: '#d7e1ec',
  muted: '#6b7b8f',
  accent: '#5cc8ff',
};
