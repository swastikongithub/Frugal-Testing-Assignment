import { test, expect } from './framework/fixtures';
import { MUTATIONS } from './framework/payload/mutations';
import { PayloadInterceptor } from './framework/payload/PayloadInterceptor';
import type { OutcomeSignals, Verdict } from './framework/payload/outcomeClassifier';
import { classifyOutcome } from './framework/payload/outcomeClassifier';
import { waitFrames } from './framework/resilience/frameClock';

type ParserMode = 'strict' | 'unsafe';

/**
 * What each attack should produce. The classifier never sees this table: it
 * decides from UI signals only, and the test then compares.
 * raw-hex-literal is invalid JSON, so the gateway rejects it before either parser runs.
 */
const EXPECTED: Record<string, Record<ParserMode, Verdict>> = {
  none: { strict: 'CLEAN', unsafe: 'CLEAN' },
  'hex-string': { strict: 'SECURE_FALLBACK', unsafe: 'SILENT_FAILURE' },
  'float-string': { strict: 'SECURE_FALLBACK', unsafe: 'SILENT_FAILURE' },
  'raw-hex-literal': { strict: 'SECURE_FALLBACK', unsafe: 'SECURE_FALLBACK' },
};

const INTEGRITY_TAG = '[order-integrity]';

for (const mutation of MUTATIONS) {
  for (const mode of ['strict', 'unsafe'] as const) {
    test(`d: ${mutation.id} vs ${mode} parser`, async ({ page, terminal, guardian, evidence }) => {
      const log = evidence.logger('d');
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await terminal.open({ unsafe: mode === 'unsafe' });
      await guardian.waitForSynchronized({ minSeq: await terminal.serverHead(), label: 'initial sync' });
      const symbol = await terminal.firstSymbol();
      const row = terminal.row(symbol);
      const slot = terminal.orderSlot(symbol);

      // The request is held inside the proxy until the UI shows the item in its validation state.
      const interceptor = new PayloadInterceptor(page, mutation, async () => {
        await expect(slot).toHaveAttribute('data-ticket-state', 'validation');
        return 'validation';
      });
      await interceptor.install();

      const box = await terminal.actionPanel(symbol).boundingBox();
      await page.mouse.click(box!.x + box!.width / 4, box!.y + box!.height / 2);
      const intercept = await interceptor.firstIntercept;

      const boundary = row.getByTestId('error-boundary');
      const receipt = row.getByTestId('order-receipt');
      const rejected = row.getByTestId('order-rejected');
      await expect(boundary.or(receipt).or(rejected)).toBeVisible();
      // Two rendered frames so side effects of the same commit (toast, console) have landed.
      await waitFrames(page, 2);

      const ledger = await terminal.ledger();
      const serverSaw = ledger.requests[0]!;

      // Interception accuracy: exactly one token changed, and the server got exactly those bytes.
      expect(intercept.uiStateWhileHeld).toBe('validation');
      expect(intercept.originalToken).toBe('"quantity":"500"');
      expect(intercept.mutated).toBe(intercept.original.replace(intercept.originalToken, intercept.injectedToken));
      expect(ledger.received, 'requests that reached the server').toBe(1);
      expect(serverSaw.rawBody, 'server received byte-identical mutated body').toBe(intercept.mutated);

      const receiptRendered = await receipt.isVisible();
      const taggedErrors = consoleErrors.filter((t) => t.includes(INTEGRITY_TAG));
      const signals: OutcomeSignals = {
        tampered: intercept.mutated !== intercept.original,
        boundaryMounted: await boundary.isVisible(),
        toastShown: await page.getByTestId('validation-toast').first().isVisible(),
        errorLogged: taggedErrors.length > 0 || pageErrors.length > 0,
        receiptRendered,
        displayedQuantity: receiptRendered ? await receipt.getAttribute('data-quantity') : null,
        intendedQuantity: '500',
      };
      const outcome = classifyOutcome(signals);

      log(`original : ${intercept.original}`);
      log(`sent     : ${intercept.mutated}`);
      const stored = serverSaw.outcome === 'REJECTED' ? 'nothing stored' : `quantity stored as ${JSON.stringify(serverSaw.quantityRaw)}`;
      log(`server   : ${serverSaw.outcome}${serverSaw.error ? ` ${serverSaw.error}` : ''}, ${stored}`);
      log(
        `ui       : boundary=${signals.boundaryMounted} toast=${signals.toastShown} tagged console errors=${taggedErrors.length} ` +
          `page errors=${pageErrors.length} receipt=${receiptRendered}${receiptRendered ? ` showing ${signals.displayedQuantity}` : ''}`,
      );
      log(`verdict  : ${outcome.verdict} (${outcome.reasons.join('; ')})`);

      expect(outcome.verdict, outcome.reasons.join('; ')).toBe(EXPECTED[mutation.id]![mode]);

      // The safe path is asserted signal by signal, not just through the verdict.
      if (mode === 'strict' && (mutation.id === 'hex-string' || mutation.id === 'float-string')) {
        await expect(boundary).toBeVisible();
        await expect(boundary).toContainText('not a canonical base-10 integer');
        await expect(page.getByTestId('validation-toast').first()).toContainText('Order integrity check failed');
        expect(taggedErrors.some((t) => t.includes('PrecisionParseError'))).toBe(true);
      }

      evidence.metric('verdict', outcome.verdict);
      evidence.metric('sent quantity', intercept.injectedToken.replace('"quantity":', ''));
      evidence.metric('server', serverSaw.outcome === 'REJECTED' ? `REJECTED ${serverSaw.error}` : `${serverSaw.outcome} ${JSON.stringify(serverSaw.quantityRaw)}`);
      evidence.metric('boundary/toast/log', `${+signals.boundaryMounted}/${+signals.toastShown}/${+signals.errorLogged}`);
      evidence.metric('receipt shows', signals.displayedQuantity ?? '-');
      evidence.detail('intercept', intercept);
      evidence.detail('serverReceived', serverSaw);
      evidence.detail('signals', signals);
      evidence.detail('consoleErrors', consoleErrors);
      evidence.detail('pageErrors', pageErrors);
      evidence.detail('classification', outcome);
    });
  }
}
