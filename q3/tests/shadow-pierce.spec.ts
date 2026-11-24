import { readFileSync } from 'node:fs';
import { expect, test, type ElementHandle, type Page } from '@playwright/test';
import { CdpPierce } from '../src/cdpPierce';
import { Evidence } from './framework/evidence';
import {
  installPierce, loadDemo, MIN_HOOK, MIN_QUERY, pierceAll, pierceOne, README, RELOADS, sameNode, type RoleQuery,
} from './framework/pierce';

/** Facts about one load, read in the page next to the "Confirm transfer" button found by the deep query. */
interface LoadFacts {
  shellTag: string;
  vaultTag: string;
  controlsIdref: string;
  buttonClass: string;
  chain: string[];
  shellRootMode: string | null;
  vaultShadowRoot: 'null' | 'exposed';
  hostRefs: string[];
  globalRefs: string[];
  absolutePath: string;
  landmarks: string;
  xpathHits: number;
  queryMs: number;
  roots: { open: number; closed: number };
}

const distinct = (values: string[]): number => new Set(values).size;

test.describe('Q3 - vanilla JS deep query through an unlinked closed shadow root', () => {
  test(`reaches the closed root nested in the open shell and drives its form on ${RELOADS} reloads`, async ({ page }, testInfo) => {
    const evidence = new Evidence(testInfo);
    const log = evidence.logger('deep-query');
    await installPierce(page);
    const loads: (LoadFacts & { status: string; playwrightHits: number })[] = [];

    for (let load = 1; load <= RELOADS; load++) {
      await loadDemo(page);
      const button = await pierceOne(page, { role: 'button', name: 'Confirm transfer' });
      const facts: LoadFacts = await button.evaluate((el) => {
        const P = window.__shadowPierce;
        const vault = (el.getRootNode() as ShadowRoot).host;
        const shell = (vault.getRootNode() as ShadowRoot).host;
        // "Unlinked": nothing on the host (own or inherited) and nothing on window holds the closed root.
        const bag = vault as unknown as Record<PropertyKey, unknown>;
        const hostRefs: string[] = [];
        for (const key of [...Object.getOwnPropertyNames(vault), ...Object.getOwnPropertySymbols(vault)]) {
          if (bag[key] instanceof ShadowRoot) hostRefs.push(String(key));
        }
        for (const key in vault) {
          try { if (bag[key] instanceof ShadowRoot) hostRefs.push(key); } catch { /* getter threw: not a reference */ }
        }
        const win = window as unknown as Record<string, unknown>;
        const globalRefs = Object.getOwnPropertyNames(window).filter((key) => {
          try { return win[key] instanceof ShadowRoot; } catch { return false; }
        });
        const started = performance.now();
        P.queryAll({ role: 'button', name: 'Confirm transfer' });
        const queryMs = performance.now() - started;
        return {
          shellTag: shell.localName,
          vaultTag: vault.localName,
          controlsIdref: el.getAttribute('aria-controls') ?? '',
          buttonClass: el.className,
          chain: P.scopeOf(el).chain.map((c) => c.mode),
          shellRootMode: shell.shadowRoot?.mode ?? null,
          vaultShadowRoot: vault.shadowRoot === null ? 'null' : 'exposed',
          hostRefs,
          globalRefs,
          absolutePath: P.absolutePath(el),
          landmarks: P.landmarksOf(el).map((l) => (l.name ? `${l.role} "${l.name}"` : l.role)).join(' > '),
          xpathHits: document.evaluate("//button[normalize-space()='Confirm transfer']", document, null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength,
          queryMs,
          roots: P.stats(),
        };
      });

      expect(facts.chain, 'button sits in a closed root, inside an open root').toEqual(['closed', 'open']);
      expect(facts.shellRootMode).toBe('open');
      expect(facts.vaultShadowRoot, 'closed root is not exposed on host.shadowRoot').toBe('null');
      expect(facts.hostRefs, 'no host property references the closed root').toEqual([]);
      expect(facts.globalRefs, 'no global references the closed root').toEqual([]);
      expect(facts.xpathHits, 'XPath cannot see into shadow roots').toBe(0);
      expect(facts.roots).toEqual({ open: 1, closed: 1 });
      const playwrightHits = await page.getByRole('button', { name: 'Confirm transfer', exact: true }).count();
      expect(playwrightHits, 'Playwright getByRole stops at the closed boundary').toBe(0);

      // Drive the form inside the closed root through the handles the deep query returned.
      const amount = (load * 125.25).toFixed(2);
      const account = load % 2 ? 'Holiday fund 1093' : 'Savings 4821';
      await (await pierceOne(page, { role: 'textbox', name: 'Amount' })).fill(amount);
      await (await pierceOne(page, { role: 'combobox', name: 'To account' })).selectOption({ label: account });
      await button.click();
      const statusEl = await pierceOne(page, { role: 'status' });
      const expected = `Transfer of ${amount} to ${account} scheduled.`;
      await expect.poll(() => statusEl.evaluate((el) => window.__shadowPierce.text(el))).toBe(expected);

      loads.push({ ...facts, status: expected, playwrightHits });
      log(`load ${load}: <${facts.shellTag}> (open) > <${facts.vaultTag}> (closed)  aria-controls=${facts.controlsIdref}  -> "${expected}"`);
      log(`        absolute path: ${facts.absolutePath}`);
    }

    const masked = loads.map((l) => l.absolutePath.replace(/mf-[a-z0-9]+-[a-z0-9]+/g, '<tag>'));
    expect(distinct(loads.map((l) => l.shellTag)), 'shell tag regenerated every load').toBe(RELOADS);
    expect(distinct(loads.map((l) => l.vaultTag)), 'vault tag regenerated every load').toBe(RELOADS);
    expect(distinct(loads.map((l) => l.controlsIdref)), 'ids (and so IDREFs) regenerated every load').toBe(RELOADS);
    expect(distinct(loads.map((l) => l.buttonClass)), 'classes regenerated every load').toBe(RELOADS);
    expect(distinct(loads.map((l) => l.absolutePath)), 'absolute paths differ every load').toBe(RELOADS);
    expect(distinct(loads.map((l) => l.landmarks)), 'the accessibility path is the same on every load').toBe(1);

    evidence.metric('reloads', RELOADS);
    evidence.metric('closed root reached', `${loads.length}/${RELOADS}`);
    evidence.metric('nesting', 'document > open > closed');
    evidence.metric('distinct shell/vault tags', `${distinct(loads.map((l) => l.shellTag))}/${distinct(loads.map((l) => l.vaultTag))}`);
    evidence.metric('distinct IDREFs', distinct(loads.map((l) => l.controlsIdref)));
    evidence.metric('distinct classes', distinct(loads.map((l) => l.buttonClass)));
    evidence.metric('distinct absolute XPaths', distinct(loads.map((l) => l.absolutePath)));
    evidence.metric('distinct shapes (tags masked)', distinct(masked));
    evidence.metric('vault.shadowRoot null', `${loads.filter((l) => l.vaultShadowRoot === 'null').length}/${RELOADS}`);
    evidence.metric('refs to closed root on host/window', loads.reduce((n, l) => n + l.hostRefs.length + l.globalRefs.length, 0));
    evidence.metric('getByRole/XPath hits in closed root', loads.reduce((n, l) => n + l.playwrightHits + l.xpathHits, 0));
    evidence.metric('transfers verified via deep query', `${loads.length}/${RELOADS}`);
    evidence.metric('max deep query ms', Math.max(...loads.map((l) => l.queryMs)).toFixed(2));
    evidence.metric('a11y path', loads[0]?.landmarks ?? '');
    evidence.detail('loads', loads);
    await evidence.flush();
  });

  test('agrees with getByRole where Playwright can see, and with Chrome\'s AX tree inside the closed root', async ({ page }, testInfo) => {
    const evidence = new Evidence(testInfo);
    const log = evidence.logger('agreement');
    await installPierce(page);
    await loadDemo(page);

    const compareWithPlaywright = async (queries: RoleQuery[]): Promise<number> => {
      let same = 0;
      for (const q of queries) {
        const locator = q.name === undefined ? page.getByRole(q.role as never) : page.getByRole(q.role as never, { name: q.name, exact: true });
        const pierced = await pierceAll(page, q);
        expect(await locator.count(), `getByRole ${JSON.stringify(q)}`).toBe(1);
        expect(pierced, `deep query ${JSON.stringify(q)}`).toHaveLength(1);
        const native = (await locator.elementHandle()) as ElementHandle<Element>;
        expect(await sameNode(page, native, pierced[0] as ElementHandle<Element>), `same node for ${JSON.stringify(q)}`).toBe(true);
        same++;
      }
      return same;
    };

    const visible: RoleQuery[] = [
      { role: 'banner' }, { role: 'main' }, { role: 'contentinfo' }, { role: 'heading', name: 'Your accounts' },
      { role: 'navigation', name: 'Account sections' }, { role: 'link', name: 'Overview' }, { role: 'link', name: 'Statements' },
      { role: 'link', name: 'Settings' }, { role: 'region', name: 'Account settings' }, { role: 'region', name: 'Transfer funds' },
      { role: 'heading', name: 'Account settings' }, { role: 'heading', name: 'Transfer funds' },
      { role: 'tablist', name: 'Settings sections' }, { role: 'tab', name: 'Profile' }, { role: 'tab', name: 'Security' },
      { role: 'tabpanel', name: 'Profile' }, { role: 'textbox', name: 'Display name' },
    ];
    let compared = await compareWithPlaywright(visible);

    // Hidden content: both engines leave the inactive tabpanel out, and both see it once it is shown.
    const twoFactor: RoleQuery = { role: 'button', name: 'Enable two-factor authentication' };
    expect(await page.getByRole('button', { name: twoFactor.name, exact: true }).count()).toBe(0);
    expect(await pierceAll(page, twoFactor)).toHaveLength(0);
    await (await pierceOne(page, { role: 'tab', name: 'Security' })).click();
    compared += await compareWithPlaywright([{ role: 'tabpanel', name: 'Security' }, twoFactor]);
    log(`${compared} document/open-root elements: deep query and getByRole returned the same node`);

    // Inside the closed root Playwright sees nothing, so compare (role, name) with Chrome's own accessibility tree.
    const roles = ['form', 'heading', 'textbox', 'combobox', 'button', 'status'];
    const engine = await page.evaluate((list) => list.flatMap((role) => window.__shadowPierce.queryAll({ role })
      .filter((el) => window.__shadowPierce.scopeOf(el).mode === 'closed')
      .map((el) => `${role} "${window.__shadowPierce.nameOf(el)}"`)), roles);
    const cdp = await CdpPierce.attach(page);
    const chrome: string[] = [];
    for (const role of roles) {
      for (const m of await cdp.queryAll(role)) if (m.shadowChain.at(-1) === 'closed') chrome.push(`${m.role} "${m.name}"`);
    }
    await cdp.detach();
    log(`closed root, deep query : ${engine.join(', ')}`);
    log(`closed root, Chrome AX  : ${chrome.join(', ')}`);
    expect(engine.sort()).toEqual(chrome.sort());

    evidence.metric('getByRole comparisons (same node)', `${compared}/${visible.length + 2}`);
    evidence.metric('hidden tabpanel content', 'excluded by both until shown');
    evidence.metric('closed-root (role, name) vs Chrome AX tree', `${engine.length}/${chrome.length} equal`);
    evidence.detail('closedRoot', { engine, chrome });
    await evidence.flush();
  });

  test('the compact copy-paste strings work alone and match the full engine', async ({ page, context }, testInfo) => {
    const evidence = new Evidence(testInfo);
    const log = evidence.logger('compact');
    const minQuery = async (target: Page, role: string, name?: string): Promise<ElementHandle<Element> | null> =>
      (await target.evaluateHandle(`(${MIN_QUERY})(${JSON.stringify(role)}, ${JSON.stringify(name ?? null)})`)).asElement() as ElementHandle<Element> | null;

    // A: only the one-line hook + the one-line query, no full engine on the page.
    await page.addInitScript({ content: MIN_HOOK });
    let driven = 0;
    for (let load = 1; load <= RELOADS; load++) {
      await loadDemo(page);
      expect(await page.evaluate(() => typeof window.__shadowPierce)).toBe('undefined');
      const amountBox = await minQuery(page, 'textbox', 'Amount');
      const button = await minQuery(page, 'button', 'Confirm transfer');
      expect(amountBox && button, 'compact query finds the closed-root controls').toBeTruthy();
      expect(await button!.evaluate((el) => (el.getRootNode() as ShadowRoot).mode)).toBe('closed');
      const amount = (load * 10.5).toFixed(2);
      await amountBox!.fill(amount);
      await button!.click();
      const status = await minQuery(page, 'status');
      await expect.poll(() => status!.evaluate((el) => el.textContent)).toBe(`Transfer of ${amount} to Savings 4821 scheduled.`);
      driven++;
    }
    log(`compact hook + query alone drove the closed-root form on ${driven}/${RELOADS} loads`);

    // B: compact hook + full engine on one page (they share the root map); results must be the same nodes.
    const both = await context.newPage();
    await both.addInitScript({ content: MIN_HOOK });
    await installPierce(both);
    await loadDemo(both);
    const targets: RoleQuery[] = [
      { role: 'button', name: 'Confirm transfer' }, { role: 'textbox', name: 'Amount' }, { role: 'combobox', name: 'To account' },
      { role: 'form', name: 'New transfer' }, { role: 'heading', name: 'New transfer' }, { role: 'status' },
      { role: 'tab', name: 'Security' }, { role: 'textbox', name: 'Display name' }, { role: 'link', name: 'Statements' },
      { role: 'region', name: 'Transfer funds' }, { role: 'navigation', name: 'Account sections' },
    ];
    let same = 0;
    for (const q of targets) {
      const compact = await minQuery(both, q.role, q.name);
      const full = await pierceOne(both, q);
      expect(compact, `compact query ${JSON.stringify(q)}`).not.toBeNull();
      expect(await sameNode(both, compact!, full), `same node for ${JSON.stringify(q)}`).toBe(true);
      same++;
    }
    log(`${same}/${targets.length} targets: compact query and full engine returned the same node`);
    await both.close();

    evidence.metric('compact strings', `hook ${MIN_HOOK.length} chars, query ${MIN_QUERY.length} chars`);
    evidence.metric('closed-root transfers via compact query', `${driven}/${RELOADS}`);
    evidence.metric('same node as full engine', `${same}/${targets.length}`);
    await evidence.flush();
  });

  test('README carries the exact compact strings', async ({}, testInfo) => {
    const evidence = new Evidence(testInfo);
    const readme = readFileSync(README, 'utf8');
    expect(readme.includes(MIN_HOOK), 'README embeds src/pierce-hook.min.js verbatim').toBe(true);
    expect(readme.includes(MIN_QUERY), 'README embeds src/pierce-query.min.js verbatim').toBe(true);
    evidence.metric('README embeds hook + query verbatim', 'yes');
    await evidence.flush();
  });
});
