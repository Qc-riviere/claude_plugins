import { expect, test } from "bun:test";
import { computeNextRun } from "../../src/schedule/nextRun";

test("computes next run for a daily cron", () => {
  const from = new Date("2026-06-16T08:00:00Z");
  const next = computeNextRun("0 9 * * *", from); // 09:00 UTC daily
  expect(next).toBe(new Date("2026-06-16T09:00:00Z").toISOString());
});

test("invalid cron returns null", () => {
  expect(computeNextRun("not a cron", new Date())).toBeNull();
});
