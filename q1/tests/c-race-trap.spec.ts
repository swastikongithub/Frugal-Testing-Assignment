import { randomUUID } from 'node:crypto';
import type { TapRecord } from '../src/lib/telemetry';
import { test, expect } from './framework/fixtures';
import { mulberry32 } from './framework/fault-injection/seededRng';
import type { GestureName, GestureResult } from './framework/race/gestures';
import { fireGesture, redeliverTap } from './framework/race/gestures';
import type { GateInfo } from './framework/race/raceWindow';
import { assertTapHit, readGateAndTaps, waitForRaceWindow } from './framework/race/raceWindow';
import { CircuitBreaker } from './framework/resilience/CircuitBreaker';
import {
  CanvasCoordinateMismatchError,
  CircuitOpenError,
  StaleElementError,
  errorKind,
  isRecoverable,
  toTypedError,
} from './framework/resilience/errors';
import { waitFrames } from './framework/resilience/frameClock';

/** The brief's execution window, measured from the skeleton's paint-settled flag. */
const RACE_WINDOW = { minMs: 30, maxMs: 120 };
/** Out-of-window runs are retried (fresh session each), never passed. */
const MAX_SCENARIO_ATTEMPTS = 3;
const GESTURES: GestureName[] = ['triple-click', 'interrupted-tap'];

interface Landed {
  symbol: string;
  gate: GateInfo;
  taps: TapRecord[];
  fired: GestureResult;
  deltaMs: number;
  sinceDomRemovalMs: number;
}

for (const gesture of GESTURES) {
  test(`c: race trap - ${gesture} 30-120 ms after the skeleton disappears`, async ({ page, terminal, chaos, guardian, evidence }) => {
    const log = evidence.logger('c');
    const attempts: Array<Record<string, unknown>> = [];
    let landed: Landed | undefined;

    for (let attempt = 1; attempt <= MAX_SCENARIO_ATTEMPTS && !landed; attempt++) {
      // Fresh server session per attempt, so a discarded attempt cannot leave an order behind.
      await terminal.open({ session: randomUUID() });
      await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'initial sync' });
      const symbol = await terminal.firstSymbol();
      const cycles = await terminal.skeletonCycles();

      // Lose one frame -> gap -> skeleton -> resync -> skeleton disappears. Then strike.
      chaos.dropNext(1);
      const canvas = await waitForRaceWindow(page, { afterCycle: cycles, symbol, minDelayMs: RACE_WINDOW.minMs });
      const fired = await fireGesture(gesture, page, canvas);
      const { gate, taps } = await readGateAndTaps(page, fired.dispatched);

      const deltaMs = taps[0]!.at - gate.paintSettledAt;
      const sinceDomRemovalMs = taps[0]!.at - gate.hiddenAt;
      const inWindow = deltaMs >= RACE_WINDOW.minMs && deltaMs <= RACE_WINDOW.maxMs;
      attempts.push({ attempt, session: terminal.session, deltaMs, sinceDomRemovalMs, inWindow });
      log(
        `attempt ${attempt}: first tap landed ${deltaMs.toFixed(1)} ms after paint-settled ` +
          `(${sinceDomRemovalMs.toFixed(1)} ms after the skeleton left the DOM) -> ${inWindow ? 'IN WINDOW' : 'OUT_OF_WINDOW, retrying'}`,
      );
      if (inWindow) landed = { symbol, gate, taps, fired, deltaMs, sinceDomRemovalMs };
    }

    evidence.detail('scenarioAttempts', attempts);
    expect(landed, `first tap never landed inside ${RACE_WINDOW.minMs}-${RACE_WINDOW.maxMs} ms: ${JSON.stringify(attempts)}`).toBeDefined();
    const { symbol, taps, fired, deltaMs, sinceDomRemovalMs } = landed!;
    expect(deltaMs).toBeGreaterThanOrEqual(RACE_WINDOW.minMs);
    expect(deltaMs).toBeLessThanOrEqual(RACE_WINDOW.maxMs);

    // 1. Catch: check every tap of the burst against the app's own hit report.
    const misses: Array<{ tap: number; error: Error }> = [];
    let firstPassHits = 0;
    taps.forEach((tap, i) => {
      try {
        assertTapHit(tap, symbol, 'BUY');
        firstPassHits += 1;
        log(`tap ${i + 1}: hit ${symbol}/BUY`);
      } catch (err) {
        misses.push({ tap: i + 1, error: err as Error });
        log(`tap ${i + 1}: ${errorKind(err)} - ${(err as Error).message}`);
      }
    });
    fired.errors.forEach((error, i) => {
      misses.push({ tap: fired.dispatched + i + 1, error });
      log(`tap ${fired.dispatched + i + 1}: ${errorKind(error)} - ${error.message.split(' - ')[0]}`);
    });

    const expectedType = gesture === 'triple-click' ? CanvasCoordinateMismatchError : StaleElementError;
    expect(misses.length, 'the race trap must actually spring').toBeGreaterThan(0);
    expect(misses.every((m) => m.error instanceof expectedType), `every miss is a ${expectedType.name}`).toBe(true);

    // 2. Resolve: an exponential-backoff circuit breaker re-delivers each missed tap
    //    to a freshly resolved target.
    const breaker = new CircuitBreaker({
      name: 'tap-recovery',
      failureThreshold: 1,
      maxAttempts: 5,
      baseBackoffFrames: 2,
      maxBackoffFrames: 32,
      rng: mulberry32(chaos.seed),
      waitFrames: (n) => waitFrames(page, n),
      isRetryable: isRecoverable,
      log: evidence.logger('breaker'),
    });
    for (const miss of misses) {
      breaker.recordFailure(`tap ${miss.tap}`, miss.error);
      await breaker.execute(`tap ${miss.tap}`, () => redeliverTap(gesture, page, terminal, symbol));
    }
    expect(breaker.state).toBe('CLOSED');

    // 3. Three taps reached BUY, but the server must have recorded exactly one transaction.
    const deliveredTaps = firstPassHits + misses.length;
    await expect.poll(async () => (await terminal.ledger()).received, { message: 'order requests received' }).toBe(deliveredTaps);
    await expect(terminal.orderSlot(symbol)).toHaveAttribute('data-ticket-state', 'confirmed');
    const ledger = await terminal.ledger();
    expect(deliveredTaps).toBe(3);
    expect(ledger.recorded, 'transactions recorded by the server').toBe(1);
    expect(new Set(ledger.requests.map((r) => r.idempotencyKey)).size, 'all requests share one idempotency key').toBe(1);
    log(`server: received ${ledger.received} requests, recorded ${ledger.recorded} transaction (${ledger.requests.map((r) => r.outcome).join(', ')})`);

    const recoveryAttempts = breaker.attempts.filter((a) => a.attempt > 0);
    evidence.metric('first tap after paint-settled', `${deltaMs.toFixed(1)} ms`);
    evidence.metric('after DOM removal', `${sinceDomRemovalMs.toFixed(1)} ms`);
    evidence.metric('scenario attempts', attempts.length);
    evidence.metric('misses', misses.map((m) => errorKind(m.error)).join(', '));
    evidence.metric('breaker trials', recoveryAttempts.length);
    evidence.metric('backoff frames', recoveryAttempts.map((a) => a.backoffFrames).join('/'));
    evidence.metric('server received/recorded', `${ledger.received}/${ledger.recorded}`);
    evidence.detail('taps', taps);
    evidence.detail('breaker', breaker.attempts);
    evidence.detail('ledger', ledger);
  });
}

test('c0: circuit breaker self-check - exponential backoff, half-open trials, give-up', async ({ page, evidence }) => {
  await page.setContent('<main>frame clock</main>');
  const log = evidence.logger('breaker');
  const options = {
    name: 'self-check',
    failureThreshold: 1,
    maxAttempts: 5,
    baseBackoffFrames: 2,
    maxBackoffFrames: 64,
    rng: mulberry32(7),
    waitFrames: (n: number) => waitFrames(page, n),
    isRetryable: isRecoverable,
    log,
  };

  // Fails three times, then succeeds: CLOSED->OPEN, HALF_OPEN->OPEN x2, HALF_OPEN->CLOSED.
  const flaky = new CircuitBreaker(options);
  let calls = 0;
  await flaky.execute('flaky tap', async () => {
    calls += 1;
    if (calls <= 3) throw new CanvasCoordinateMismatchError('action-panel:X/BUY', 'order-strip:X', { x: 1, y: 1 });
  });
  const backoffs = flaky.attempts.map((a) => a.backoffFrames);
  expect(flaky.attempts.map((a) => `${a.stateBefore}->${a.stateAfter}`)).toEqual([
    'CLOSED->OPEN',
    'HALF_OPEN->OPEN',
    'HALF_OPEN->OPEN',
    'HALF_OPEN->CLOSED',
  ]);
  // Exponential part is 2, 4, 8 frames; jitter adds 0..1 frame.
  expect(backoffs[0]).toBe(0);
  expect(backoffs[1]).toBeGreaterThanOrEqual(2);
  expect(backoffs[1]).toBeLessThanOrEqual(3);
  expect(backoffs[2]).toBeGreaterThanOrEqual(4);
  expect(backoffs[2]).toBeLessThanOrEqual(5);
  expect(backoffs[3]).toBeGreaterThanOrEqual(8);
  expect(backoffs[3]).toBeLessThanOrEqual(9);

  // Never recovers: gives up after maxAttempts with a typed CircuitOpenError.
  const hopeless = new CircuitBreaker({ ...options, name: 'hopeless', maxAttempts: 3 });
  const gaveUp = await hopeless
    .execute('dead target', async () => {
      throw new StaleElementError('tap', new Error('Element is not attached to the DOM'));
    })
    .catch((e: unknown) => e);
  expect(gaveUp).toBeInstanceOf(CircuitOpenError);
  expect(hopeless.attempts).toHaveLength(3);

  // Unknown errors are not retried.
  const strict = new CircuitBreaker({ ...options, name: 'strict' });
  const boom = await strict.execute('bug', async () => {
    throw new TypeError('not a UI race');
  }).catch((e: unknown) => e);
  expect(boom).toBeInstanceOf(TypeError);
  expect(strict.attempts).toHaveLength(0);

  // The real Playwright error for a detached handle maps to StaleElementError.
  await page.setContent('<button>buy</button>');
  const handle = await page.$('button');
  await page.evaluate(() => document.querySelector('button')!.remove());
  const raw = await handle!.click({ force: true, timeout: 2_000 }).catch((e: unknown) => e);
  log(`raw Playwright error: ${String((raw as Error).message).split('\n')[0]}`);
  expect(toTypedError('tap', raw)).toBeInstanceOf(StaleElementError);

  evidence.metric('backoff frames', backoffs.slice(1).join(' -> '));
  evidence.metric('give-up after', `${hopeless.attempts.length} attempts`);
  evidence.metric('detached handle maps to', 'StaleElementError');
});
