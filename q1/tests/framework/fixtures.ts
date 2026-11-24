import { randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';
import { Evidence } from './evidence';
import { WebSocketChaos } from './fault-injection/WebSocketChaos';
import { resolveSeed } from './fault-injection/seededRng';
import { StateGuardian } from './guardian/StateGuardian';
import { Terminal } from './terminal';

interface Fixtures {
  evidence: Evidence;
  terminal: Terminal;
  chaos: WebSocketChaos;
  guardian: StateGuardian;
}

/**
 * Every test gets: its own server session, the WebSocket fault layer and the
 * StateGuardian installed *before* the first navigation, and an evidence sink.
 */
export const test = base.extend<Fixtures>({
  evidence: async ({}, use, testInfo) => {
    const evidence = new Evidence(testInfo);
    await use(evidence);
    await evidence.flush();
  },

  terminal: async ({ page }, use) => {
    await use(new Terminal(page, randomUUID()));
  },

  chaos: async ({ page, evidence }, use) => {
    const chaos = new WebSocketChaos(page, { seed: resolveSeed(), log: evidence.logger('chaos') });
    await chaos.install();
    await use(chaos);
    chaos.dispose();
  },

  guardian: async ({ page }, use) => {
    const guardian = new StateGuardian(page);
    await guardian.install();
    await use(guardian);
  },
});

export { expect } from '@playwright/test';
