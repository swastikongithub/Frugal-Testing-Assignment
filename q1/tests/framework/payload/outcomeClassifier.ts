export type Verdict = 'CLEAN' | 'SECURE_FALLBACK' | 'SILENT_FAILURE' | 'INCONCLUSIVE';

export interface OutcomeSignals {
  /** Did the bytes the server stored differ from what the client meant to send? */
  tampered: boolean;
  boundaryMounted: boolean;
  toastShown: boolean;
  /** Console error or page error carrying the integrity tag. */
  errorLogged: boolean;
  /** A "FILLED ..." confirmation was rendered as if everything was fine. */
  receiptRendered: boolean;
  displayedQuantity: string | null;
  intendedQuantity: string;
}

export interface Classification {
  verdict: Verdict;
  reasons: string[];
}

/**
 * Decides from observed signals only; it never looks at which mode the app ran in.
 *
 * SECURE_FALLBACK  tampered, no success receipt, the user was told (boundary or toast) AND it was logged.
 * SILENT_FAILURE   tampered, a success receipt was rendered, and nothing was surfaced or logged.
 * CLEAN            not tampered, receipt shows exactly the intended quantity, no alarms.
 * INCONCLUSIVE     anything else (mixed signals): the test fails rather than guess.
 */
export function classifyOutcome(s: OutcomeSignals): Classification {
  const alarms = [s.boundaryMounted && 'error boundary mounted', s.toastShown && 'validation toast shown', s.errorLogged && 'error logged']
    .filter((a): a is string => Boolean(a));
  const visible = s.boundaryMounted || s.toastShown;

  if (!s.tampered) {
    if (s.receiptRendered && s.displayedQuantity === s.intendedQuantity && alarms.length === 0) {
      return { verdict: 'CLEAN', reasons: [`receipt shows ${s.displayedQuantity} as intended`, 'no alarms'] };
    }
    return { verdict: 'INCONCLUSIVE', reasons: ['untampered order did not complete cleanly', ...alarms] };
  }

  if (!s.receiptRendered && visible && s.errorLogged) {
    return { verdict: 'SECURE_FALLBACK', reasons: ['no success receipt rendered', ...alarms] };
  }
  if (s.receiptRendered && alarms.length === 0) {
    return {
      verdict: 'SILENT_FAILURE',
      reasons: [`receipt rendered quantity ${s.displayedQuantity} for a tampered order`, 'no boundary, no toast, nothing logged'],
    };
  }
  return { verdict: 'INCONCLUSIVE', reasons: [`receiptRendered=${s.receiptRendered}`, ...alarms] };
}
