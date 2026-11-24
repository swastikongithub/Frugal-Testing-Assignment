import type { TestInfo } from '@playwright/test';

export type MetricValue = string | number | boolean;

/**
 * Collects the numbers a test produced and attaches them as JSON ("evidence").
 * The custom reporter reads these attachments to print the end-of-run summary,
 * so every number in the summary comes from the run itself.
 */
export class Evidence {
  readonly metrics: Record<string, MetricValue> = {};
  readonly details: Record<string, unknown> = {};

  constructor(private readonly testInfo: TestInfo) {}

  metric(key: string, value: MetricValue): void {
    this.metrics[key] = value;
  }

  detail(key: string, value: unknown): void {
    this.details[key] = value;
  }

  logger(scope: string): (line: string) => void {
    return (line) => console.log(`  [${scope}] ${line}`);
  }

  async flush(): Promise<void> {
    await this.testInfo.attach('evidence', {
      contentType: 'application/json',
      body: JSON.stringify({ title: this.testInfo.title, metrics: this.metrics, details: this.details }, null, 2),
    });
  }
}
