/**
 * Order quantities are whole lots, sent as decimal integer strings ("500").
 * The confirmation echoes the value back from the server, so the client must
 * re-validate it before showing the user what they just bought.
 */
export class PrecisionParseError extends Error {
  override readonly name = 'PrecisionParseError';

  constructor(
    readonly field: string,
    readonly raw: unknown,
    reason: string,
  ) {
    super(`${field} ${JSON.stringify(raw)} ${reason}`);
  }
}

const CANONICAL_INTEGER = /^(0|[1-9]\d*)$/;

/** Strict mode: anything except a canonical base-10 integer string throws. */
export function parseStrictQuantity(raw: unknown): number {
  if (typeof raw !== 'string') {
    throw new PrecisionParseError('quantity', raw, 'is not a decimal string');
  }
  if (!CANONICAL_INTEGER.test(raw)) {
    throw new PrecisionParseError('quantity', raw, 'is not a canonical base-10 integer');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new PrecisionParseError('quantity', raw, 'exceeds the safe integer range');
  }
  return value;
}

/**
 * Unsafe mode (?unsafe=1), the negative control. Number() is the classic bug:
 * Number("0x1F4") === 500 and Number("500.000001") === 500.000001, both without any error.
 */
export function parseLenientQuantity(raw: unknown): number {
  return Number(raw);
}
