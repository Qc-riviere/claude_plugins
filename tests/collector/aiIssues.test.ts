import { expect, test } from "bun:test";
import { parseAiIssues } from "../../src/collector/aiIssues";

const SAMPLE = `# AI 问题追踪

| # | Date | Context | Problem | Fix | Status |
|---|------|---------|---------|-----|--------|
| 1 | 2026-01-01 | ctx | Wrong path used | corrected | ✅ closed |
| 2 | 2026-01-02 | ctx | Race condition | - | open |
| 3 | 2026-01-03 | ctx | Blocked on infra | - | ❌ blocked |

## 前车之鉴
1. 有清单先核对
`;

test("parses AI-ISSUES table, mapping Status column", () => {
  const tasks = parseAiIssues(SAMPLE, "/proj");
  expect(tasks.length).toBe(3);
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t.status]));
  expect(byTitle["Wrong path used"]).toBe("done");
  expect(byTitle["Race condition"]).toBe("pending");
  expect(byTitle["Blocked on infra"]).toBe("blocked");
  expect(tasks[0].source).toBe("AI-ISSUES.md");
});

test("returns empty when no issues table", () => {
  expect(parseAiIssues("# just prose", "/proj")).toEqual([]);
});
