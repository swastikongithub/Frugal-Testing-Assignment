import { expect, test } from '@playwright/test';
import { CdpPierce } from '../src/cdpPierce';
import { Evidence } from './framework/evidence';
import { loadDemo, RELOADS } from './framework/pierce';

test.describe('Q3 - CDP alternative (no script injected into the page)', () => {
  test(`DOM.getDocument(pierce) + Accessibility.queryAXTree drive the closed root and its nested iframe on ${RELOADS} reloads`, async ({ page }, testInfo) => {
    const evidence = new Evidence(testInfo);
    const log = evidence.logger('cdp');
    const hosts: string[] = [];
    let verified = 0;

    for (let load = 1; load <= RELOADS; load++) {
      await loadDemo(page);
      // Nothing was injected: no attachShadow hook, no deep-query API.
      expect(await page.evaluate(() => [typeof window.__shadowPierce, Symbol.for('shadow-pierce.roots') in window]))
        .toEqual(['undefined', false]);

      const cdp = await CdpPierce.attach(page);
      const boundaries = await cdp.boundaries();
      expect(boundaries.map((b) => ({ mode: b.mode, enclosedBy: b.enclosedBy })), 'open root > closed root > iframe document')
        .toEqual([{ mode: 'open', enclosedBy: [] }, { mode: 'closed', enclosedBy: ['open'] }, { mode: 'frame', enclosedBy: ['open', 'closed'] }]);
      const shadowHosts = boundaries.filter((b) => b.mode !== 'frame').map((b) => b.hostName);
      hosts.push(...shadowHosts);

      const amountBox = await cdp.queryOne('textbox', 'Amount');
      const accountBox = await cdp.queryOne('combobox', 'To account');
      const button = await cdp.queryOne('button', 'Confirm Transaction');
      for (const match of [amountBox, accountBox]) expect(match.chain).toEqual(['open', 'closed']);
      expect(button.chain, 'the button is in the iframe nested in the closed root').toEqual(['open', 'closed', 'frame']);
      expect(await page.getByRole('button', { name: 'Confirm Transaction', exact: true }).count()).toBe(0);

      const amount = (load * 40.4).toFixed(2);
      const account = load % 2 ? 'Savings 4821' : 'Holiday fund 1093';
      await cdp.type(amountBox, amount); // CDP DOM.focus + real key events
      // <select> is set on its remote object (CDP Runtime.callFunctionOn), then the app's change path runs.
      const selected = await cdp.callOn<string>(accountBox, `function (label) {
        const option = [...this.options].find((o) => o.label === label);
        this.value = option.value;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return this.selectedOptions[0].label;
      }`, account);
      expect(selected).toBe(account);
      await cdp.click(button); // DOM.getContentQuads (page coordinates, also inside the iframe) + real mouse click

      const expected = `Transfer of ${amount} to ${account} scheduled.`;
      const status = await cdp.queryOne('status');
      expect(status.chain).toEqual(['open', 'closed', 'frame']);
      await expect.poll(() => cdp.text(status)).toBe(expected);
      verified++;
      log(`load ${load}: <${shadowHosts[0]}> open > <${shadowHosts[1]}> closed > iframe; button backendNodeId=${button.backendNodeId} -> "${expected}"`);
      await cdp.detach();
    }

    expect(new Set(hosts).size, 'host tags regenerated every load').toBe(RELOADS * 2);
    evidence.metric('reloads', RELOADS);
    evidence.metric('page hook injected', 'no');
    evidence.metric('boundaries per load', 'open > closed > iframe');
    evidence.metric('AX queries per load', 'one per document (top + iframe)');
    evidence.metric('distinct host tags', `${new Set(hosts).size}/${RELOADS * 2}`);
    evidence.metric('transfers verified via CDP', `${verified}/${RELOADS}`);
    await evidence.flush();
  });
});
