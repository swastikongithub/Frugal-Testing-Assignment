import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Row {
  title: string;
  status: TestResult['status'];
  durationMs: number;
  metrics: Record<string, string | number | boolean>;
}

const WIDTH = 104;
const INDENT = '          ';

/**
 * Prints one block per test at the end of the run, built only from the
 * "evidence" JSON each test attached. Nothing here is computed or hard-coded.
 */
export default class EvidenceSummaryReporter implements Reporter {
  private readonly rows = new Map<string, Row>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((a) => a.name === 'evidence' && a.body);
    let metrics: Row['metrics'] = {};
    if (attachment?.body) {
      try {
        metrics = (JSON.parse(attachment.body.toString('utf8')) as { metrics?: Row['metrics'] }).metrics ?? {};
      } catch {
        metrics = { evidence: 'unreadable' };
      }
    }
    if (result.status === 'skipped') {
      // Show why (e.g. the pasted-LLM-answer slot still holds its placeholder).
      const reason = [...result.annotations, ...test.annotations].find((a) => a.type === 'skip')?.description;
      metrics = { reason: reason ?? 'skipped' };
    }
    this.rows.set(test.id, { title: test.title, status: result.status, durationMs: result.duration, metrics });
  }

  onEnd(result: FullResult): void {
    const out: string[] = ['', '='.repeat(WIDTH), ' Q3 EVIDENCE SUMMARY - closed shadow DOM piercing + ARIA-only locator strategies (all values measured in this run)', '='.repeat(WIDTH)];
    for (const row of this.rows.values()) {
      const status = row.status === 'passed' ? 'PASS' : row.status.toUpperCase();
      out.push(` ${status.padEnd(8)} ${row.title}  (${(row.durationMs / 1000).toFixed(1)} s)`);
      let line = INDENT;
      for (const [key, value] of Object.entries(row.metrics)) {
        const part = `${key}: ${value}`;
        if (line.length > INDENT.length && line.length + part.length + 3 > WIDTH) {
          out.push(line);
          line = INDENT;
        }
        line += (line.length > INDENT.length ? ' | ' : '') + part;
      }
      if (line.length > INDENT.length) out.push(line);
    }
    const count = (status: TestResult['status']): number => [...this.rows.values()].filter((r) => r.status === status).length;
    const failed = this.rows.size - count('passed') - count('skipped');
    out.push(
      '-'.repeat(WIDTH),
      ` ${count('passed')} passed, ${count('skipped')} skipped, ${failed} failed (of ${this.rows.size}), overall ${result.status.toUpperCase()}`,
      '='.repeat(WIDTH),
      '',
    );
    console.log(out.join('\n'));
  }

  printsToStdio(): boolean {
    return true;
  }
}
