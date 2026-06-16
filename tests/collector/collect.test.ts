import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { collectTasks } from "../../src/collector/collect";

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ab-"));
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude", "RESUME.md"),
    "| Task | Status | Commit |\n|---|---|---|\n| A | ✅ | x |\n");
  writeFileSync(join(dir, "TODO.md"), "- [ ] B\n");
  return dir;
}

test("collects from RESUME.md and TODO.md", async () => {
  const dir = makeProject();
  const tasks = await collectTasks(dir);
  const titles = tasks.map((t) => t.title).sort();
  expect(titles).toEqual(["A", "B"]);
  expect(tasks.every((t) => t.project === dir)).toBe(true);
});

test("missing files yield empty, no throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-empty-"));
  expect(await collectTasks(dir)).toEqual([]);
});
