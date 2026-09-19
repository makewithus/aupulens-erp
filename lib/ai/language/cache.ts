/** Tiny per-process TTL/LRU cache. Keyed per tenant so one tenant's text never serves another. */
export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private max = 500, private ttlMs = 10 * 60_000) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, hit); // LRU touch
    return hit.v;
  }
  set(key: string, v: V): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
  }
  clear(): void { this.map.clear(); }
}
