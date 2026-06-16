import { expect, test } from "bun:test";
import { parseResumeTable } from "../../src/collector/resume";

const SAMPLE = `# Resume Pointer
## 任务进度表
| Task | Status | Commit |
|---|---|---|
| 搭脚手架 | ✅ | abc123 |
| 写解析器 | 🔄 | - |
| 等评审 | ⏸️ | - |
| 还没做 | ⬜ | - |
`;

test("parses resume table rows into tasks, skipping header/separator", () => {
  const tasks = parseResumeTable(SAMPLE, "/proj");
  expect(tasks.length).toBe(4);
  expect(tasks[0]).toEqual({
    id: "resume:0", title: "搭脚手架", status: "done",
    source: "RESUME.md", project: "/proj",
  });
  expect(tasks[1].status).toBe("in_progress");
  expect(tasks[2].status).toBe("blocked");
  expect(tasks[3].status).toBe("pending");
});

test("returns empty for content without a table", () => {
  expect(parseResumeTable("# no table here", "/proj")).toEqual([]);
});
