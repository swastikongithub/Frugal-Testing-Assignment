import { test, expect } from './framework/fixtures';
import { CHAOS_PROFILE } from './framework/fault-injection/FaultProfile';
import { throttleCpu } from './framework/fault-injection/cpuThrottle';

/** Renderer main thread slowed 4x for the whole chaos window (event-loop starvation). */
const CPU_THROTTLE_RATE = 4;
/** How late a Node timer may deliver on top of the scheduled jitter. Reported, never hidden. */
const TIMER_TOLERANCE_MS = 50;

test('a: chaos - drop every 4th WebSocket frame + 2000-7000 ms jitter under 4x CPU throttle', async ({
  page,
  terminal,
  chaos,
  guardian,
  evidence,
}) => {
  const log = evidence.logger('a');
  await terminal.open();
  await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'initial sync' });
  const before = await terminal.frameStats();

  log(`seed ${chaos.seed}  (replay this exact schedule with CHAOS_SEED=${chaos.seed})`);
  const cpu = await throttleCpu(page, CPU_THROTTLE_RATE);
  const run = chaos.start(CHAOS_PROFILE);
  await run.windowClosed;
  await run.drained;
  await cpu.release();
  const after = await terminal.frameStats();
  const summary = chaos.summary();
  const delayed = chaos.ledger.filter((e) => e.phase === 'chaos' && e.action === 'DELAY');

  // 1. The fault layer did exactly what the profile says.
  expect(summary.windowFrames).toBe(CHAOS_PROFILE.windowFrames);
  expect(summary.dropped).toBe(CHAOS_PROFILE.windowFrames / CHAOS_PROFILE.dropEveryNth);
  expect(summary.dropRatio).toBe(0.25);
  expect(summary.droppedIndices).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
  expect(summary.undelivered).toBe(0);
  for (const entry of delayed) {
    const label = `frame #${entry.index} seq ${entry.seq}`;
    expect(entry.scheduledDelayMs!, `${label} scheduled delay`).toBeGreaterThanOrEqual(CHAOS_PROFILE.latencyMs.min);
    expect(entry.scheduledDelayMs!, `${label} scheduled delay`).toBeLessThanOrEqual(CHAOS_PROFILE.latencyMs.max);
    expect(entry.actualDelayMs!, `${label} never delivered early`).toBeGreaterThanOrEqual(entry.scheduledDelayMs!);
    expect(entry.actualDelayMs!, `${label} timer lateness`).toBeLessThanOrEqual(entry.scheduledDelayMs! + TIMER_TOLERANCE_MS);
  }

  // 2. The client actually felt it.
  const gaps = after.gaps - before.gaps;
  const outOfOrder = after.outOfOrder - before.outOfOrder;
  expect(gaps, 'sequence gaps detected by the client').toBeGreaterThan(0);
  expect(outOfOrder, 'out-of-order frames detected by the client').toBeGreaterThan(0);
  expect(after.maxAgeMs, 'oldest frame the client received (ms)').toBeGreaterThanOrEqual(CHAOS_PROFILE.latencyMs.min);

  // 3. ...and recovered once the network calmed down.
  const healed = await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'after chaos' });
  const drift = await guardian.verifyNoDrift();
  expect(drift.drifted, 'prices that differ from the server at the same seq').toEqual([]);

  log(
    `dropped ${summary.dropped}/${summary.windowFrames} (${(summary.dropRatio * 100).toFixed(1)}%) at ${summary.droppedIndices.join(',')}; ` +
      `scheduled ${summary.scheduledMinMs}-${summary.scheduledMaxMs} ms, delivered ${summary.actualMinMs.toFixed(1)}-${summary.actualMaxMs.toFixed(1)} ms`,
  );
  log(`client: gaps ${gaps}, out-of-order ${outOfOrder}, stale discarded ${after.staleDiscarded - before.staleDiscarded}, max frame age ${after.maxAgeMs} ms, long tasks ${after.longTasks}`);
  log(`healed at seq ${healed.appliedSeq}; drift check at seq ${drift.seq}: ${drift.drifted.length} of ${drift.compared} prices differ`);

  evidence.metric('seed', summary.seed);
  evidence.metric('dropped', `${summary.dropped}/${summary.windowFrames} (${(summary.dropRatio * 100).toFixed(1)}%)`);
  evidence.metric('scheduled delay', `${summary.scheduledMinMs}-${summary.scheduledMaxMs} ms`);
  evidence.metric('delivered delay', `${summary.actualMinMs.toFixed(0)}-${summary.actualMaxMs.toFixed(0)} ms`);
  evidence.metric('max timer lateness', `${summary.maxTimerLatenessMs.toFixed(1)} ms`);
  evidence.metric('client gaps', gaps);
  evidence.metric('out-of-order', outOfOrder);
  evidence.metric('max frame age', `${after.maxAgeMs} ms`);
  evidence.metric('long tasks', after.longTasks);
  evidence.metric('drift after heal', drift.drifted.length);
  evidence.detail('frameLedger', chaos.ledger);
  evidence.detail('summary', summary);
});
