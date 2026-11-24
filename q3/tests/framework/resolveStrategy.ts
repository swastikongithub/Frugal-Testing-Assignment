import type { ElementHandle, Locator, Page } from '@playwright/test';
import type { NodeRef, RelationLocator, Target } from '../../scripts/validate-locators';
import { pierceAll } from './pierce';

type AriaRole = Parameters<Page['getByRole']>[0];

export interface Resolution {
  tier: 1 | 2 | 3;
  /** Which engine resolved it, for the evidence log. */
  engine: string;
  handles: ElementHandle<Element>[];
}

export interface ResolvedTarget {
  tier1: Resolution;
  tier2?: Resolution;
  tier3: Resolution;
}

const byRole = (scope: Page | Locator, step: NodeRef): Locator =>
  step.name === undefined
    ? scope.getByRole(step.role as AriaRole)
    : scope.getByRole(step.role as AriaRole, { name: step.name, exact: true });

async function handlesOf(locator: Locator): Promise<ElementHandle<Element>[]> {
  const handles: (ElementHandle<Element> | null)[] = await Promise.all((await locator.all()).map((l) => l.elementHandle()));
  return handles.filter((h): h is ElementHandle<Element> => h !== null);
}

async function relationHandles(page: Page, tier2: RelationLocator): Promise<ElementHandle<Element>[]> {
  const list = await page.evaluateHandle((q) => window.__shadowPierce.queryRelation(q), tier2);
  const handles = [...(await list.getProperties()).values()].map((h) => h.asElement()).filter((h): h is ElementHandle<Element> => h !== null);
  await list.dispose();
  return handles;
}

/**
 * Resolves the three tiers of one target on the live page, using only roles, names, ARIA relations and paths:
 *  - document / open-shadow targets: Playwright's own getByRole (tier 1) and chained getByRole (tier 3),
 *    which pierce open roots;
 *  - closed-shadow targets: the shadow-pierce deep query, because getByRole stops at the closed boundary;
 *  - tier 2 (any scope): the deep query's ARIA IDREF resolution, scoped like the browser scopes IDREFs.
 */
export async function resolveTarget(page: Page, target: Target): Promise<ResolvedTarget> {
  const closed = target.scope === 'closed-shadow';
  const tier1: Resolution = closed
    ? { tier: 1, engine: 'shadow-pierce role+name', handles: await pierceAll(page, { role: target.tier1.role, name: target.tier1.name }) }
    : { tier: 1, engine: 'playwright getByRole', handles: await handlesOf(byRole(page, target.tier1)) };

  let tier3: Resolution;
  if (closed) {
    const list = await page.evaluateHandle((steps) => window.__shadowPierce.queryPath(steps), target.tier3.path);
    const handles = [...(await list.getProperties()).values()].map((h) => h.asElement()).filter((h): h is ElementHandle<Element> => h !== null);
    await list.dispose();
    tier3 = { tier: 3, engine: 'shadow-pierce a11y path', handles };
  } else {
    const [first, ...rest] = target.tier3.path as [NodeRef, ...NodeRef[]];
    let locator = byRole(page, first);
    for (const step of rest) locator = byRole(locator, step);
    tier3 = { tier: 3, engine: 'playwright chained getByRole', handles: await handlesOf(locator) };
  }

  const tier2: Resolution | undefined = 'relation' in target.tier2
    ? { tier: 2, engine: `shadow-pierce ${target.tier2.relation}`, handles: await relationHandles(page, target.tier2) }
    : undefined;

  return { tier1, tier2, tier3 };
}
