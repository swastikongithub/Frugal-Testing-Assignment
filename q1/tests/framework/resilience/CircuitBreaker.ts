import { CircuitOpenError, errorKind } from './errors';

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerOptions {
  name: string;
  /** Consecutive failures that trip CLOSED -> OPEN. */
  failureThreshold: number;
  /** Trial attempts per execute() call before giving up with CircuitOpenError. */
  maxAttempts: number;
  /** Backoff = base * 2^(openings - 1) + jitter, in rendered frames, capped at max. */
  baseBackoffFrames: number;
  maxBackoffFrames: number;
  rng: () => number;
  waitFrames: (frames: number) => Promise<number>;
  isRetryable: (err: unknown) => boolean;
  log: (line: string) => void;
}

export interface BreakerAttempt {
  label: string;
  attempt: number;
  stateBefore: BreakerState;
  backoffFrames: number;
  waitedMs: number;
  outcome: 'success' | 'failure' | 'recorded-failure';
  error?: string;
  stateAfter: BreakerState;
}

/**
 * CLOSED: calls go straight through.
 * OPEN: the next call first backs off (exponentially, with jitter), then goes HALF_OPEN.
 * HALF_OPEN: one trial call; success closes the circuit, failure re-opens it with a longer backoff.
 */
export class CircuitBreaker {
  state: BreakerState = 'CLOSED';
  readonly attempts: BreakerAttempt[] = [];
  private consecutiveFailures = 0;
  /** OPEN episodes since the last success; drives the exponent. */
  private openings = 0;

  constructor(private readonly options: BreakerOptions) {}

  /** Feed in a failure that happened outside execute() (e.g. a tap that already missed). */
  recordFailure(label: string, err: unknown): void {
    const before = this.state;
    this.onFailure();
    this.push({ label, attempt: 0, stateBefore: before, backoffFrames: 0, waitedMs: 0, outcome: 'recorded-failure', error: describe(err), stateAfter: this.state });
  }

  async execute<T>(label: string, operation: (attempt: number) => Promise<T>): Promise<T> {
    const { maxAttempts, isRetryable, waitFrames } = this.options;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let backoffFrames = 0;
      let waitedMs = 0;
      if (this.state === 'OPEN') {
        backoffFrames = this.nextBackoffFrames();
        waitedMs = await waitFrames(backoffFrames);
        this.state = 'HALF_OPEN';
      }
      const before = this.state;
      try {
        const result = await operation(attempt);
        this.consecutiveFailures = 0;
        this.openings = 0;
        this.state = 'CLOSED';
        this.push({ label, attempt, stateBefore: before, backoffFrames, waitedMs, outcome: 'success', stateAfter: this.state });
        return result;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        lastError = err;
        this.onFailure();
        this.push({ label, attempt, stateBefore: before, backoffFrames, waitedMs, outcome: 'failure', error: describe(err), stateAfter: this.state });
      }
    }
    throw new CircuitOpenError(this.options.name, maxAttempts, lastError);
  }

  /** Exposed for the self-check test: the exponential part grows 1x, 2x, 4x, 8x ... of base. */
  nextBackoffFrames(): number {
    const { baseBackoffFrames, maxBackoffFrames, rng } = this.options;
    const exponential = baseBackoffFrames * 2 ** Math.max(0, this.openings - 1);
    const jitter = Math.floor(rng() * baseBackoffFrames);
    return Math.min(maxBackoffFrames, exponential + jitter);
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.openings += 1;
      this.state = 'OPEN';
    }
  }

  private push(entry: BreakerAttempt): void {
    this.attempts.push(entry);
    const wait = entry.backoffFrames ? ` after backoff ${entry.backoffFrames} frames (${entry.waitedMs.toFixed(1)} ms)` : '';
    const result = entry.outcome === 'success' ? 'OK' : `FAIL ${entry.error}`;
    const step = entry.outcome === 'recorded-failure' ? 'observed miss' : `attempt ${entry.attempt}/${this.options.maxAttempts}`;
    this.options.log(`${this.options.name} ${entry.label} ${step}${wait}: ${entry.stateBefore} -> ${entry.stateAfter} ${result}`);
  }
}

function describe(err: unknown): string {
  const message = err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
  return `[${errorKind(err)}] ${message}`;
}
