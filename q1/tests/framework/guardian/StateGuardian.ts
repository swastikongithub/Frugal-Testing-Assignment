import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { StateAtSeq } from '../../../shared/protocol';
import { installSyncObserver } from './observerScript';

const BINDING = '__guardianReport';

export interface GuardianEvent {
  type: 'state';
  cycle: number;
  from: string | null;
  to: string;
  at: number;
  loaderFramesInPrevious: number;
}

export interface Conditions {
  stateSynchronized: boolean;
  skeletonGone: boolean;
  loaderAdvancedWhileSyncing: boolean;
  seqCaughtUp: boolean;
  newCycleObserved: boolean;
}

export interface SyncedResult {
  resolvedAt: number;
  appliedSeq: number;
  cycle: number;
  conditions: Conditions;
  conditionLog: Array<Conditions & { at: number }>;
}

export interface ObservedPath {
  cycle: number;
  states: string[];
  timestamps: number[];
  loaderFramesWhileSyncing: number;
  falseToSyncingMs: number;
  syncingToSynchronizedMs: number;
}

export class GuardianTimeoutError extends Error {
  constructor(label: string, lastCheck: unknown, cause: unknown) {
    super(`StateGuardian "${label}" did not settle. Last condition check: ${JSON.stringify(lastCheck)}`, { cause });
    this.name = 'GuardianTimeoutError';
  }
}

/**
 * Waits for the terminal to be *really* synchronized: several independent
 * conditions must hold in the same animation frame. No sleeps: the condition
 * is re-checked once per rendered frame (polling: 'raf'), and the timeout is
 * only a failure deadline.
 */
export class StateGuardian {
  /** State changes pushed from the page's MutationObserver via exposeBinding. */
  readonly events: GuardianEvent[] = [];

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.exposeBinding(BINDING, (_source, event: GuardianEvent) => {
      this.events.push(event);
    });
    await this.page.addInitScript(installSyncObserver, BINDING);
  }

  /** Number of desync cycles seen so far on the current page. */
  async cycleCount(): Promise<number> {
    return this.page.evaluate(() => window.__guardian.cycles.length);
  }

  async waitForSynchronized(options: { minSeq: number; minCycle?: number; label: string; timeoutMs?: number }): Promise<SyncedResult> {
    const { minSeq, minCycle = 0, label, timeoutMs = 60_000 } = options;
    try {
      const handle = await this.page.waitForFunction(
        ({ minSeq, minCycle }) => {
          const g = window.__guardian;
          const t = window.__telemetry;
          if (!g || !t) return false;
          const cycle = g.cycles[g.cycles.length - 1];
          const conditions = {
            stateSynchronized: document.querySelector('[data-state-sync]')?.getAttribute('data-state-sync') === 'synchronized',
            skeletonGone: document.querySelector('[data-testid="loading-skeleton"]') === null,
            loaderAdvancedWhileSyncing: (cycle?.framesByState['syncing'] ?? 0) > 0,
            seqCaughtUp: t.appliedSeq >= minSeq,
            newCycleObserved: (cycle?.index ?? -1) >= minCycle,
          };
          const previous = g.conditionLog[g.conditionLog.length - 1] as Record<string, unknown> | undefined;
          if (!previous || Object.keys(conditions).some((k) => previous[k] !== conditions[k as keyof typeof conditions])) {
            g.conditionLog.push({ ...conditions, at: performance.now() });
          }
          g.lastCheck = { ...conditions, appliedSeq: t.appliedSeq, minSeq, cycle: cycle?.index };
          if (!Object.values(conditions).every(Boolean)) return false;
          return {
            resolvedAt: performance.now(),
            appliedSeq: t.appliedSeq,
            cycle: cycle!.index,
            conditions,
            conditionLog: g.conditionLog.splice(0),
          };
        },
        { minSeq, minCycle },
        { polling: 'raf', timeout: timeoutMs },
      );
      return (await handle.jsonValue()) as SyncedResult;
    } catch (err) {
      const last = await this.page.evaluate(() => window.__guardian?.lastCheck).catch(() => null);
      throw new GuardianTimeoutError(label, last, err);
    }
  }

  /**
   * The latest cycle must read false -> syncing -> synchronized with strictly
   * increasing timestamps, the loader must have animated while syncing, and the
   * page observer, the Node-side binding and the app's own telemetry must agree.
   */
  async assertTransitionPath(): Promise<ObservedPath> {
    const { cycle, appTransitions } = await this.page.evaluate(() => ({
      cycle: window.__guardian.cycles[window.__guardian.cycles.length - 1]!,
      appTransitions: window.__telemetry.transitions.slice(-3).map((t) => t.to),
    }));
    const states = cycle.path.map((p) => p.state);
    const timestamps = cycle.path.map((p) => p.at);

    expect(states, 'observed path of the latest cycle').toEqual(['false', 'syncing', 'synchronized']);
    expect(timestamps[1]!, 'syncing after false').toBeGreaterThan(timestamps[0]!);
    expect(timestamps[2]!, 'synchronized after syncing').toBeGreaterThan(timestamps[1]!);
    expect(cycle.framesByState['syncing'] ?? 0, 'loader frames while syncing').toBeGreaterThan(0);
    expect(appTransitions, 'app telemetry agrees with the observer').toEqual(['false', 'syncing', 'synchronized']);

    // The binding is asynchronous; retry until Node has received this cycle's three events.
    await expect
      .poll(() => this.events.filter((e) => e.cycle === cycle.index).map((e) => e.to), {
        message: 'exposeBinding stream agrees with the in-page observer',
      })
      .toEqual(['false', 'syncing', 'synchronized']);

    return {
      cycle: cycle.index,
      states,
      timestamps,
      loaderFramesWhileSyncing: cycle.framesByState['syncing'] ?? 0,
      falseToSyncingMs: timestamps[1]! - timestamps[0]!,
      syncingToSynchronizedMs: timestamps[2]! - timestamps[1]!,
    };
  }

  /** Compare the client's prices at its applied seq with the server's record for that seq. */
  async verifyNoDrift(): Promise<{ seq: number; compared: number; drifted: string[] }> {
    const client = await this.page.evaluate(() => window.__telemetry.stateAt());
    const res = await this.page.request.get(`/api/state/${client.seq}`);
    expect(res.ok(), `server still has state for seq ${client.seq}`).toBeTruthy();
    const server = (await res.json()) as StateAtSeq;
    const symbols = Object.keys({ ...server.prices, ...client.prices });
    const drifted = symbols.filter((s) => server.prices[s] !== client.prices[s]);
    return { seq: client.seq, compared: symbols.length, drifted };
  }
}

declare global {
  interface Window {
    __guardian: {
      cycles: Array<{ index: number; path: Array<{ state: string; at: number }>; framesByState: Record<string, number> }>;
      current: string | null;
      loaderMutations: number;
      lastCheck: unknown;
      conditionLog: unknown[];
    };
  }
}
