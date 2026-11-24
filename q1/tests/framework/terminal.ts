import type { Locator, Page } from '@playwright/test';
import type { OrderLedger } from '../../shared/protocol';
import type { Telemetry } from '../../src/lib/telemetry';

/** Page object for the DRIFTDESK terminal. Locators are role/name based where the UI allows it. */
export class Terminal {
  constructor(
    readonly page: Page,
    public session: string,
  ) {}

  async open(options: { unsafe?: boolean; session?: string } = {}): Promise<void> {
    if (options.session) this.session = options.session;
    await this.page.goto(`/?session=${encodeURIComponent(this.session)}${options.unsafe ? '&unsafe=1' : ''}`);
  }

  row(symbol: string): Locator {
    return this.page.getByRole('article', { name: symbol, exact: true });
  }

  actionPanel(symbol: string): Locator {
    return this.page.getByRole('application', { name: `${symbol} action panel` });
  }

  orderSlot(symbol: string): Locator {
    return this.row(symbol).getByTestId('order-slot');
  }

  /** "First chart item" = whichever instrument the terminal renders first. */
  async firstSymbol(): Promise<string> {
    const symbol = await this.page.getByTestId('instrument-row').first().getAttribute('data-symbol');
    if (!symbol) throw new Error('no instrument rows rendered');
    return symbol;
  }

  async serverHead(): Promise<number> {
    const res = await this.page.request.get('/api/head');
    return ((await res.json()) as { seq: number }).seq;
  }

  async ledger(): Promise<OrderLedger> {
    const res = await this.page.request.get(`/api/orders?session=${encodeURIComponent(this.session)}`);
    return (await res.json()) as OrderLedger;
  }

  async frameStats(): Promise<Telemetry['frames'] & { snapshotsRequested: number; longTasks: number }> {
    return this.page.evaluate(() => ({
      ...window.__telemetry.frames,
      snapshotsRequested: window.__telemetry.snapshots.requested,
      longTasks: window.__telemetry.longTasks.length,
    }));
  }

  async skeletonCycles(): Promise<number> {
    return this.page.evaluate(() => window.__telemetry.skeleton.length);
  }
}
