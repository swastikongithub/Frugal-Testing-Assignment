/**
 * Runs inside the page before any app script (installed with addInitScript).
 * A MutationObserver records every change of data-state-sync and counts the
 * loader canvas's data-frame updates per state. It keeps an in-page copy for
 * waitForFunction and pushes each state change to Node through exposeBinding.
 *
 * Must stay self-contained: Playwright serialises this function into the page.
 */
export function installSyncObserver(bindingName: string): void {
  interface Cycle {
    index: number;
    path: Array<{ state: string; at: number }>;
    framesByState: Record<string, number>;
  }
  const g = {
    cycles: [] as Cycle[],
    current: null as string | null,
    loaderMutations: 0,
    lastCheck: null as unknown,
    conditionLog: [] as unknown[],
  };
  (window as unknown as { __guardian: typeof g }).__guardian = g;

  const report = (event: unknown) => {
    const binding = (window as unknown as Record<string, unknown>)[bindingName];
    if (typeof binding === 'function') void (binding as (e: unknown) => Promise<void>)(event);
  };

  const enter = (state: string, at: number) => {
    if (state === g.current) return;
    if (state === 'false' || g.cycles.length === 0) {
      g.cycles.push({ index: g.cycles.length, path: [], framesByState: {} });
    }
    const cycle = g.cycles[g.cycles.length - 1]!;
    const previous = g.current;
    cycle.path.push({ state, at });
    g.current = state;
    report({
      type: 'state',
      cycle: cycle.index,
      from: previous,
      to: state,
      at,
      loaderFramesInPrevious: previous ? (cycle.framesByState[previous] ?? 0) : 0,
    });
  };

  const observer = new MutationObserver((records) => {
    const at = performance.now();
    const stateRecords = records.filter((r) => r.attributeName === 'data-state-sync');
    for (const record of records) {
      if (record.attributeName === 'data-state-sync') {
        // Several changes can arrive in one batch: the value after this record is the
        // next record's oldValue, or the live attribute for the last one.
        const next = stateRecords[stateRecords.indexOf(record) + 1];
        const value = next ? next.oldValue : (record.target as Element).getAttribute('data-state-sync');
        if (value) enter(value, at);
      } else if (record.attributeName === 'data-frame') {
        g.loaderMutations += 1;
        const cycle = g.cycles[g.cycles.length - 1];
        if (cycle && g.current) cycle.framesByState[g.current] = (cycle.framesByState[g.current] ?? 0) + 1;
      }
    }
    // First render inserts the element with the attribute already set (a childList change).
    const live = document.querySelector('[data-state-sync]')?.getAttribute('data-state-sync');
    if (live && live !== g.current) enter(live, at);
  });

  // Observe the Document node itself: init scripts run before <html> exists,
  // so document.documentElement can still be null at this point.
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['data-state-sync', 'data-frame'],
  });
}
