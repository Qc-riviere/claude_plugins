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
  writeFileSync(join(dir, "STATUS.md"),
    "| Phase | Implementation | Smoke gate |\n|---|---|---|\n| **1 — C** | ✅ | ✅ |\n");
  writeFileSync(join(dir, "AI-ISSUES.md"),
    "| # | Problem | Status |\n|---|---|---|\n| 1 | D | open |\n");
  return dir;
}

test("collects from RESUME.md, TODO.md, STATUS.md and AI-ISSUES.md", async () => {
  const dir = makeProject();
  const tasks = await collectTasks(dir);
  const titles = tasks.map((t) => t.title).sort();
  expect(titles).toEqual(["1 — C", "A", "B", "D"]);
  expect(tasks.every((t) => t.project === dir)).toBe(true);
  const sources = new Set(tasks.map((t) => t.source));
  expect(sources).toEqual(new Set(["RESUME.md", "TODO.md", "STATUS.md", "AI-ISSUES.md"]));
});

test("missing files yield empty, no throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-empty-"));
  expect(await collectTasks(dir)).toEqual([]);
});
