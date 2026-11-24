/**
 * Precision mutations applied to the raw order body text in flight. Each one
 * rewrites only the quantity token and refuses to run if that token is not
 * present exactly once, so a mutation can never silently do nothing.
 */
export interface PrecisionMutation {
  id: string;
  label: string;
  /** Rewrites the canonical quantity token, e.g. `"quantity":"500"`. */
  rewrite: (digits: string) => string;
}

const QUANTITY_TOKEN = /"quantity":"(\d+)"/g;

export const MUTATIONS: PrecisionMutation[] = [
  {
    id: 'none',
    label: 'control: body forwarded unchanged',
    rewrite: (digits) => `"quantity":"${digits}"`,
  },
  {
    id: 'hex-string',
    label: 'integer -> hex string "0x1F4" (still valid JSON)',
    rewrite: (digits) => `"quantity":"0x${Number(digits).toString(16).toUpperCase()}"`,
  },
  {
    id: 'float-string',
    label: 'integer -> float string "500.000001"',
    rewrite: (digits) => `"quantity":"${digits}.000001"`,
  },
  {
    id: 'raw-hex-literal',
    label: 'integer -> unquoted hex literal 0x1F4 (invalid JSON)',
    rewrite: (digits) => `"quantity":0x${Number(digits).toString(16).toUpperCase()}`,
  },
];

export interface MutationResult {
  original: string;
  mutated: string;
  originalToken: string;
  injectedToken: string;
}

export function applyMutation(mutation: PrecisionMutation, body: string): MutationResult {
  const matches = [...body.matchAll(QUANTITY_TOKEN)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one canonical quantity token in the body, found ${matches.length}: ${body}`);
  }
  const [originalToken, digits] = matches[0]! as unknown as [string, string];
  const injectedToken = mutation.rewrite(digits);
  return { original: body, mutated: body.replace(originalToken, injectedToken), originalToken, injectedToken };
}
