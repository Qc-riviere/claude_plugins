import type { Status, Task } from "./types";
import { parseMarkdownTables, cleanCell, type MdTable } from "./table";

function issueStatus(cell: string): Status {
  const c = cell.toLowerCase();
  if (cell.includes("❌") || c.includes("blocked")) return "blocked";
  if (cell.includes("🔄") || c.includes("progress")) return "in_progress";
  if (cell.includes("✅") || /closed|fixed|done|resolved/.test(c)) return "done";
  return "pending"; // open / empty
}

function isIssuesTable(t: MdTable): boolean {
  const h = t.header.map((c) => c.toLowerCase());
  return h.some((c) => c.includes("problem")) && h.some((c) => c.includes("status"));
}

export function parseAiIssues(md: string, project: string): Task[] {
  const tasks: Task[] = [];
  let idx = 0;
  for (const table of parseMarkdownTables(md)) {
    if (!isIssuesTable(table)) continue;
    const probCol = table.header.findIndex((c) => c.toLowerCase().includes("problem"));
    const statCol = table.header.findIndex((c) => c.toLowerCase().includes("status"));
    for (const row of table.rows) {
      const title = cleanCell(row[probCol] ?? "");
      if (!title) continue;
      tasks.push({
        id: `ai-issue:${idx++}`,
        title,
        status: issueStatus(row[statCol] ?? ""),
        source: "AI-ISSUES.md",
        project,
      });
    }
  }
  return tasks;
}
