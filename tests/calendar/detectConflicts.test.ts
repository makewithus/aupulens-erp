/**
 * Smart Enterprise Calendar conflict detection (6.5).
 *
 * detectConflicts is the deterministic core (also the AI fallback). It flags
 * crowded deadline days and deadlines that collide with team leave/absence.
 */
import { describe, it, expect, vi } from "vitest";

// aggregateEvents imports models at load; mock the DB so the pure detector imports.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

import { detectConflicts, type UnifiedEvent } from "@/lib/calendar/aggregateEvents";

const ev = (id: string, source: UnifiedEvent["source"], start: string): UnifiedEvent => ({ id, source, type: source, title: id, start, allDay: true });

describe("detectConflicts", () => {
  it("flags a crowded deadline day (>= threshold task deadlines)", () => {
    const day = "2026-08-10T00:00:00.000Z";
    const events = [ev("t1", "task", day), ev("t2", "task", day), ev("t3", "task", day), ev("t4", "task", day)];
    const conflicts = detectConflicts(events);
    expect(conflicts.some((c) => c.date === "2026-08-10" && /deadlines fall on the same day/.test(c.reason))).toBe(true);
  });

  it("does NOT flag a day below the crowd threshold", () => {
    const day = "2026-08-11T00:00:00.000Z";
    expect(detectConflicts([ev("t1", "task", day), ev("t2", "task", day)])).toHaveLength(0);
  });

  it("flags deadlines colliding with team leave as high severity", () => {
    const day = "2026-08-12T09:00:00.000Z";
    const conflicts = detectConflicts([ev("t1", "task", day), ev("l1", "leave", day)]);
    const collision = conflicts.find((c) => /team absence/.test(c.reason));
    expect(collision?.severity).toBe("high");
    expect(collision?.eventIds).toEqual(expect.arrayContaining(["t1", "l1"]));
  });

  it("also treats attendance absences as collisions", () => {
    const day = "2026-08-13T00:00:00.000Z";
    const conflicts = detectConflicts([ev("t1", "task", day), ev("a1", "attendance", day)]);
    expect(conflicts.some((c) => /absence/.test(c.reason))).toBe(true);
  });

  it("returns nothing for a clean, spread-out schedule", () => {
    expect(detectConflicts([ev("t1", "task", "2026-08-01T00:00:00Z"), ev("p1", "payment", "2026-08-05T00:00:00Z")])).toHaveLength(0);
  });

  it("respects a custom crowd threshold", () => {
    const day = "2026-08-14T00:00:00.000Z";
    const events = [ev("t1", "task", day), ev("t2", "task", day)];
    expect(detectConflicts(events, { taskCrowdThreshold: 2 })).toHaveLength(1);
  });
});
