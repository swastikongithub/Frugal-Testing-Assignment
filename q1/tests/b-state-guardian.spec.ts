import { test, expect } from './framework/fixtures';
import { CHAOS_PROFILE } from './framework/fault-injection/FaultProfile';
import type { ObservedPath, SyncedResult } from './framework/guardian/StateGuardian';
import type { Evidence } from './framework/evidence';

test('b1: guardian - one dropped frame heals through false -> syncing -> synchronized', async ({
  terminal,
  chaos,
  guardian,
  evidence,
}) => {
  await terminal.open();
  await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'initial sync' });
  const cycles = await guardian.cycleCount();
  const headBefore = await terminal.serverHead();

  chaos.dropNext(1);
  const synced = await guardian.waitForSynchronized({ minSeq: headBefore + 1, minCycle: cycles, label: 'heal after one lost frame' });
  const path = await guardian.assertTransitionPath();
  const drift = await guardian.verifyNoDrift();
  expect(drift.drifted, 'prices that differ from the server at the same seq').toEqual([]);

  report(evidence, synced, path, drift);
});

test('b2: guardian - heals after the full chaos profile', async ({ terminal, chaos, guardian, evidence }) => {
  await terminal.open();
  await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'initial sync' });
  const cycles = await guardian.cycleCount();

  const run = chaos.start(CHAOS_PROFILE);
  await run.windowClosed;
  await run.drained;

  const synced = await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), minCycle: cycles, label: 'heal after chaos' });
  const path = await guardian.assertTransitionPath();
  const drift = await guardian.verifyNoDrift();
  expect(drift.drifted, 'prices that differ from the server at the same seq').toEqual([]);
  evidence.metric('desync cycles during chaos', synced.cycle - cycles + 1);

  report(evidence, synced, path, drift);
});

function report(
  evidence: Evidence,
  synced: SyncedResult,
  path: ObservedPath,
  drift: { seq: number; compared: number; drifted: string[] },
) {
  const log = evidence.logger('guardian');
  const t0 = path.timestamps[0]!;
  log(`path (cycle ${path.cycle}): ${path.states.map((s, i) => `${s}@+${(path.timestamps[i]! - t0).toFixed(1)}ms`).join(' -> ')}`);
  log(`loader canvas advanced ${path.loaderFramesWhileSyncing} frames while syncing`);
  for (const step of synced.conditionLog) {
    const met = Object.entries(step)
      .filter(([k, v]) => k !== 'at' && v === true)
      .map(([k]) => k);
    log(`  conditions at ${step.at.toFixed(1)}: ${met.join(', ') || '(none)'}`);
  }
  log(`all conditions held at ${synced.resolvedAt.toFixed(1)} (seq ${synced.appliedSeq}); drift check seq ${drift.seq}: ${drift.drifted.length}/${drift.compared} prices differ`);

  evidence.metric('path', path.states.join(' -> '));
  evidence.metric('false->syncing', `${path.falseToSyncingMs.toFixed(1)} ms`);
  evidence.metric('syncing->synchronized', `${path.syncingToSynchronizedMs.toFixed(1)} ms`);
  evidence.metric('loader frames while syncing', path.loaderFramesWhileSyncing);
  evidence.metric('drift', `${drift.drifted.length}/${drift.compared}`);
  evidence.detail('path', path);
  evidence.detail('conditionLog', synced.conditionLog);
}
