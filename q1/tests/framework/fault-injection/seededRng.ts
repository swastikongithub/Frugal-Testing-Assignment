/** mulberry32: tiny, fast, good enough for reproducible fault schedules. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** CHAOS_SEED=<n> replays an exact fault schedule; otherwise a fresh seed is drawn and printed. */
export function resolveSeed(): number {
  const fromEnv = process.env.CHAOS_SEED;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv) >>> 0;
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/** Uniform integer in [min, max], both ends inclusive. */
export function uniformInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
