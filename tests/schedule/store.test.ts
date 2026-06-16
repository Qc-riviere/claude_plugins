import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readSchedules } from "../../src/schedule/store";

test("reads schedules from json file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-sched-"));
  const file = join(dir, "schedule.json");
  writeFileSync(file, JSON.stringify([
    { name: "daily", cron_expr: "0 9 * * *", command: "echo hi", enabled: true },
  ]));
  const list = await readSchedules(file);
  expect(list.length).toBe(1);
  expect(list[0].name).toBe("daily");
});

test("missing file returns empty array", async () => {
  expect(await readSchedules(join(tmpdir(), "nope-schedule.json"))).toEqual([]);
});
