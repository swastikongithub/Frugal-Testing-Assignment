import { performance } from 'node:perf_hooks';
import type { Page, WebSocketRoute } from '@playwright/test';
import type { FaultProfile } from './FaultProfile';
import { decideFrame } from './FaultProfile';
import { mulberry32 } from './seededRng';

export interface LedgerEntry {
  /** 1-based position inside the chaos window (null for frames dropped by dropNext). */
  index: number | null;
  seq: number | null;
  phase: 'chaos' | 'armed-drop';
  action: 'DROP' | 'DELAY';
  receivedAt: number;
  scheduledDelayMs?: number;
  deliveredAt?: number;
  actualDelayMs?: number;
}

export interface ChaosRun {
  /** Resolves when the last frame of the window has been dropped or scheduled. */
  windowClosed: Promise<void>;
  /** Resolves when every delayed frame from the window has been delivered. */
  drained: Promise<void>;
}

/**
 * Sits between the page and the real server via page.routeWebSocket and decides
 * the fate of every server-to-client frame. Client-to-server traffic is not touched.
 *
 * The delay timer below is the injected fault itself (holding a packet), not a
 * wait in the test. It is the only timer the suite allows, and lint-no-sleep
 * enforces that it stays inside this folder.
 */
export class WebSocketChaos {
  readonly ledger: LedgerEntry[] = [];
  readonly seed: number;
  passedThrough = 0;

  private readonly rng: () => number;
  private readonly log: (line: string) => void;
  private readonly timers = new Set<NodeJS.Timeout>();
  private profile: FaultProfile | null = null;
  private windowIndex = 0;
  private pendingDeliveries = 0;
  private armedDrops = 0;
  private disposed = false;
  private resolveWindowClosed: () => void = () => {};
  private resolveDrained: () => void = () => {};

  constructor(
    private readonly page: Page,
    options: { seed: number; log: (line: string) => void },
  ) {
    this.seed = options.seed;
    this.rng = mulberry32(options.seed);
    this.log = options.log;
  }

  async install(url: RegExp = /\/stream$/): Promise<void> {
    await this.page.routeWebSocket(url, (pageSide) => {
      const serverSide = pageSide.connectToServer();
      // Handling server messages ourselves switches off Playwright's automatic forwarding.
      serverSide.onMessage((message) => this.onServerFrame(message, pageSide));
    });
  }

  /** Drop the next n frames (used to trigger exactly one resync on demand). */
  dropNext(n = 1): void {
    this.armedDrops += n;
  }

  start(profile: FaultProfile): ChaosRun {
    this.profile = profile;
    this.windowIndex = 0;
    const windowClosed = new Promise<void>((resolve) => (this.resolveWindowClosed = resolve));
    const drained = new Promise<void>((resolve) => (this.resolveDrained = resolve));
    this.log(`profile "${profile.name}", window ${profile.windowFrames} frames, seed ${this.seed}`);
    return { windowClosed, drained };
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private onServerFrame(message: string | Buffer, pageSide: WebSocketRoute): void {
    const receivedAt = performance.now();
    const seq = parseSeq(message);

    if (this.armedDrops > 0) {
      this.armedDrops -= 1;
      this.ledger.push({ index: null, seq, phase: 'armed-drop', action: 'DROP', receivedAt });
      this.log(`seq=${seq} DROP (armed single drop)`);
      return;
    }

    const profile = this.profile;
    if (!profile || this.windowIndex >= profile.windowFrames) {
      this.passedThrough += 1;
      this.safeSend(pageSide, message);
      return;
    }

    const index = ++this.windowIndex;
    const decision = decideFrame(profile, index, this.rng);
    const entry: LedgerEntry = { index, seq, phase: 'chaos', action: decision.action, receivedAt };
    this.ledger.push(entry);

    if (decision.action === 'DROP') {
      this.log(`#${pad(index)} seq=${seq} DROP  (every ${profile.dropEveryNth}th frame)`);
    } else {
      entry.scheduledDelayMs = decision.delayMs;
      this.pendingDeliveries += 1;
      this.log(`#${pad(index)} seq=${seq} DELAY ${decision.delayMs} ms`);
      this.deliverLater(entry, message, pageSide, receivedAt + decision.delayMs);
    }

    if (index === profile.windowFrames) {
      this.log(`window closed after ${index} frames; live frames pass through untouched again`);
      this.resolveWindowClosed();
      this.checkDrained();
    }
  }

  private deliverLater(entry: LedgerEntry, message: string | Buffer, pageSide: WebSocketRoute, dueAt: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.disposed) return;
      const now = performance.now();
      // Node timers can fire a fraction of a millisecond early; never deliver before the scheduled time.
      if (now < dueAt) {
        this.deliverLater(entry, message, pageSide, dueAt);
        return;
      }
      this.safeSend(pageSide, message);
      entry.deliveredAt = now;
      entry.actualDelayMs = now - entry.receivedAt;
      this.pendingDeliveries -= 1;
      this.log(`#${pad(entry.index ?? 0)} seq=${entry.seq} delivered after ${entry.actualDelayMs.toFixed(1)} ms`);
      this.checkDrained();
    }, Math.max(0, dueAt - performance.now()));
    this.timers.add(timer);
  }

  private checkDrained(): void {
    if (this.profile && this.windowIndex >= this.profile.windowFrames && this.pendingDeliveries === 0) {
      this.resolveDrained();
    }
  }

  private safeSend(pageSide: WebSocketRoute, message: string | Buffer): void {
    try {
      pageSide.send(message);
    } catch {
      // Page already closed; nothing to deliver to.
    }
  }

  summary() {
    const chaos = this.ledger.filter((e) => e.phase === 'chaos');
    const dropped = chaos.filter((e) => e.action === 'DROP');
    const delayed = chaos.filter((e) => e.action === 'DELAY');
    const scheduled = delayed.map((e) => e.scheduledDelayMs ?? NaN);
    const actual = delayed.map((e) => e.actualDelayMs ?? NaN);
    return {
      seed: this.seed,
      profile: this.profile?.name ?? null,
      windowFrames: chaos.length,
      dropped: dropped.length,
      droppedIndices: dropped.map((e) => e.index),
      delayed: delayed.length,
      dropRatio: chaos.length ? dropped.length / chaos.length : 0,
      scheduledMinMs: Math.min(...scheduled),
      scheduledMaxMs: Math.max(...scheduled),
      actualMinMs: Math.min(...actual),
      actualMaxMs: Math.max(...actual),
      maxTimerLatenessMs: Math.max(...delayed.map((e) => (e.actualDelayMs ?? 0) - (e.scheduledDelayMs ?? 0))),
      undelivered: delayed.filter((e) => e.deliveredAt === undefined).length,
    };
  }
}

function parseSeq(message: string | Buffer): number | null {
  try {
    const parsed = JSON.parse(message.toString()) as { seq?: unknown };
    return typeof parsed.seq === 'number' ? parsed.seq : null;
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
