/**
 * Playwright has no StaleElementReferenceException (that is Selenium). Its
 * equivalent is an ElementHandle action failing with "Element is not attached
 * to the DOM". We map that into a typed error so the retry policy can treat it
 * like the Selenium exception the brief names.
 */
export class StaleElementError extends Error {
  readonly kind = 'STALE_ELEMENT' as const;

  constructor(readonly action: string, cause: unknown) {
    super(`${action}: element reference is stale (detached from the DOM) - ${firstLine(cause)}`, { cause });
    this.name = 'StaleElementError';
  }
}

/** The pointer landed, but not on the canvas zone we aimed at (the app's own hit test says so). */
export class CanvasCoordinateMismatchError extends Error {
  readonly kind = 'CANVAS_COORDINATE_MISMATCH' as const;

  constructor(
    readonly expected: string,
    readonly actual: string,
    readonly point: { x: number; y: number },
  ) {
    super(`tap at (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) hit "${actual}", expected "${expected}"`);
    this.name = 'CanvasCoordinateMismatchError';
  }
}

export class CircuitOpenError extends Error {
  readonly kind = 'CIRCUIT_OPEN' as const;

  constructor(breaker: string, attempts: number, cause: unknown) {
    super(`circuit "${breaker}" gave up after ${attempts} attempts: ${firstLine(cause)}`, { cause });
    this.name = 'CircuitOpenError';
  }
}

const STALE_MESSAGE = /not attached to the DOM|element is detached|detached from the DOM|node is detached/i;

/** Convert a raw Playwright error into a typed one where we know what it means. */
export function toTypedError(action: string, err: unknown): Error {
  if (err instanceof Error && STALE_MESSAGE.test(err.message)) return new StaleElementError(action, err);
  return err instanceof Error ? err : new Error(String(err));
}

export const isRecoverable = (err: unknown): boolean =>
  err instanceof StaleElementError || err instanceof CanvasCoordinateMismatchError;

export function errorKind(err: unknown): string {
  if (err instanceof StaleElementError || err instanceof CanvasCoordinateMismatchError || err instanceof CircuitOpenError) {
    return err.kind;
  }
  return err instanceof Error ? err.name : 'UNKNOWN';
}

function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n')[0] ?? text;
}
