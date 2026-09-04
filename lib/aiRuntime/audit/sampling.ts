/**
 * AI-18's reproducible sampling (docs/ai/BRIEF-07-BATCH-F.md, AI-18 algorithm step 6 — "an
 * auditor will ask you to re-run it"). A seeded PRNG (mulberry32 — small, deterministic, no
 * external dependency) so the same `{population, method, seed}` always produces the identical
 * sample, verified directly by a test that runs it twice.
 */

export type SampleMethod = "random" | "risk_weighted";

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return h;
}

/** `weightOf` is only consulted for `method === "risk_weighted"` — a higher weight makes an item
 *  more likely (not certain) to be picked, via a cumulative-weight draw against the same PRNG
 *  stream, so the whole draw stays deterministic from `seed` alone. */
export function sampleItems<T>(population: T[], refOf: (item: T) => string, size: number, method: SampleMethod, seed: string, weightOf?: (item: T) => number): T[] {
  if (population.length <= size) return [...population];
  const rng = mulberry32(seedToInt(seed));
  const pool = [...population];
  const picked: T[] = [];

  for (let i = 0; i < size && pool.length > 0; i++) {
    let index: number;
    if (method === "risk_weighted" && weightOf) {
      const weights = pool.map((item) => Math.max(0.0001, weightOf(item)));
      const total = weights.reduce((s, w) => s + w, 0);
      let draw = rng() * total;
      index = weights.length - 1;
      for (let j = 0; j < weights.length; j++) {
        draw -= weights[j];
        if (draw <= 0) {
          index = j;
          break;
        }
      }
    } else {
      index = Math.floor(rng() * pool.length);
    }
    picked.push(pool[index]);
    pool.splice(index, 1);
  }

  return picked.sort((a, b) => refOf(a).localeCompare(refOf(b)));
}
