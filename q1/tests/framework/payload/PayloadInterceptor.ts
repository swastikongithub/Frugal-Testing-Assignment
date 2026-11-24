import type { Page, Request, Route } from '@playwright/test';
import type { MutationResult, PrecisionMutation } from './mutations';
import { applyMutation } from './mutations';

export interface InterceptRecord extends MutationResult {
  url: string;
  method: string;
  idempotencyKey: string | null;
  /** What the UI showed while the request was held (asserted by onHold). */
  uiStateWhileHeld: string;
  heldMs: number;
}

/**
 * Proxies POST /api/orders with page.route. The request is held while onHold
 * runs (the test proves the item is in its validation state), then the raw body
 * text is rewritten and forwarded to the real server.
 */
export class PayloadInterceptor {
  readonly records: InterceptRecord[] = [];
  private resolveFirst: (record: InterceptRecord) => void = () => {};
  readonly firstIntercept = new Promise<InterceptRecord>((resolve) => (this.resolveFirst = resolve));

  constructor(
    private readonly page: Page,
    private readonly mutation: PrecisionMutation,
    private readonly onHold: () => Promise<string>,
  ) {}

  async install(): Promise<void> {
    await this.page.route(
      (url) => url.pathname === '/api/orders',
      (route, request) => this.handle(route, request),
    );
  }

  private async handle(route: Route, request: Request): Promise<void> {
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const heldAt = Date.now();
    const uiStateWhileHeld = await this.onHold();
    const result = applyMutation(this.mutation, request.postData() ?? '');
    const record: InterceptRecord = {
      ...result,
      url: request.url(),
      method: request.method(),
      idempotencyKey: (await request.allHeaders())['idempotency-key'] ?? null,
      uiStateWhileHeld,
      heldMs: Date.now() - heldAt,
    };
    this.records.push(record);
    await route.continue({ postData: result.mutated });
    this.resolveFirst(record);
  }
}
