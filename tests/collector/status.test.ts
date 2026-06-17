import { expect, test } from "bun:test";
import { parseStatusMd } from "../../src/collector/status";

const SAMPLE = `# Demo Execution Status

## Phase ledger
| Phase | Plan | Execution record(s) | Implementation | Smoke gate | Notes |
|-------|------|---------------------|----------------|------------|-------|
| **1 — Setup** | [plan](x) | [rec](y) | ✅ done (3 commits) | ✅ **validated 2026-01-01** | foo |
| **2 — API** | [plan](x) | – | ⏸ impl done | ⏳ planned | bar |
| **3 — UI** | _not yet written_ | – | ⏳ | ⏳ | baz |
| **4 — Deploy** | – | – | ❌ blocked | – | blocked on X |

## Programmatic-check status
| Check | Result |
|-------|--------|
| build | ✅ |

## Open items rolling forward
### Carried since phase 2
| # | Item | Phase to fix | Risk |
|---|------|--------------|------|
| P2-1 | Fix flaky test | 3 | Med |
| ~~P2-2~~ | ~~Old thing~~ ✅ closed phase-3 | – | Low |
`;

test("parses phase ledger with status priority", () => {
  const tasks = parseStatusMd(SAMPLE, "/proj");
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t.status]));
  expect(byTitle["1 — Setup"]).toBe("done");
  expect(byTitle["2 — API"]).toBe("in_progress"); // ⏸ wins over ⏳
  expect(byTitle["3 — UI"]).toBe("pending");
  expect(byTitle["4 — Deploy"]).toBe("blocked");
});

test("parses open items, closed -> done", () => {
  const tasks = parseStatusMd(SAMPLE, "/proj");
  const open = tasks.filter((t) => t.source === "STATUS.md" && t.id.startsWith("status-item:"));
  const flaky = open.find((t) => t.title.includes("Fix flaky test"));
  const closed = open.find((t) => t.title.includes("Old thing"));
  expect(flaky?.status).toBe("pending");
  expect(closed?.status).toBe("done");
});

test("ignores unrelated tables (programmatic-check)", () => {
  const tasks = parseStatusMd(SAMPLE, "/proj");
  expect(tasks.some((t) => t.title === "build")).toBe(false);
});
