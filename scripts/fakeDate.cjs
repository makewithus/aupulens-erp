"use strict";

/**
 * Chunk 10a addendum, Part 1.2 — pins wall-clock time for an entire test run (every forked worker
 * process, since NODE_OPTIONS is inherited by every `pool: forks` child), without touching any
 * test file. Loaded via `--require` before anything else in the process, so every `new Date()`/
 * `Date.now()` call anywhere in the codebase (application code, Mongoose's own timestamps, test
 * fixtures) sees the pinned instant plus real elapsed time since the process started — time still
 * "flows" for duration measurements, it just starts from a chosen date instead of the real one.
 *
 * A plain subclass (`class FakeDate extends Date`) breaks Mongoose: schema definitions write
 * `{ type: Date }` literally, and Mongoose's own SchemaType resolution switches on the
 * constructor's `.name`, which a subclass changes to "FakeDate" — every `{ type: Date }` field in
 * every model then fails schema construction. A Proxy wrapping the real Date constructor instead
 * forwards `.name`, `.prototype`, and every static property untouched, so `type: Date` (which now
 * refers to this same Proxy, since this script's `--require` load order puts it ahead of Mongoose)
 * resolves exactly as Mongoose expects; only `construct` (the zero-arg case) and `now` are
 * intercepted.
 *
 * Usage: FAKE_DATE_TARGET_ISO="2026-02-01T00:00:00.000Z" NODE_OPTIONS="--require ./scripts/fakeDate.cjs" npx vitest run
 * Explicit `new Date(arg)` calls are never touched — only the "what time is it right now" forms.
 */
const targetIso = process.env.FAKE_DATE_TARGET_ISO;
if (targetIso) {
  const RealDate = Date;
  const offsetMs = new RealDate(targetIso).getTime() - RealDate.now();

  const FakeDate = new Proxy(RealDate, {
    construct(target, args) {
      if (args.length === 0) return new target(target.now() + offsetMs);
      return new target(...args);
    },
    apply(target, _thisArg, args) {
      return target(...args); // Date() called without `new` — real "now" string form, rarely used
    },
    get(target, prop, receiver) {
      if (prop === "now") return () => target.now() + offsetMs;
      return Reflect.get(target, prop, receiver);
    },
  });

  globalThis.Date = FakeDate;
}
