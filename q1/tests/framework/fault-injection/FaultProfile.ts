import { uniformInt } from './seededRng';

export interface FaultProfile {
  name: string;
  /** Every Nth frame inside the chaos window is dropped (N = 4 -> frames 4, 8, 12, ...). */
  dropEveryNth: number;
  /** Every frame that is not dropped is held for a random time in this range (inclusive). */
  latencyMs: { min: number; max: number };
  /** Number of server frames the chaos window covers. A multiple of dropEveryNth keeps the ratio exact. */
  windowFrames: number;
}

/** The profile from the brief: drop every 4th packet, add 2000-7000 ms latency jitter. */
export const CHAOS_PROFILE: FaultProfile = {
  name: 'drop every 4th frame + 2000-7000 ms latency jitter',
  dropEveryNth: 4,
  latencyMs: { min: 2000, max: 7000 },
  windowFrames: 40,
};

export type FrameDecision = { action: 'DROP' } | { action: 'DELAY'; delayMs: number };

/** Pure function: the same seed and index always give the same decision. */
export function decideFrame(profile: FaultProfile, indexInWindow: number, rng: () => number): FrameDecision {
  if (indexInWindow % profile.dropEveryNth === 0) return { action: 'DROP' };
  return { action: 'DELAY', delayMs: uniformInt(rng, profile.latencyMs.min, profile.latencyMs.max) };
}
