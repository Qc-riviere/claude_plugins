import type { Status, Task } from "./types";
import { parseMarkdownTables, cleanCell, type MdTable } from "./table";

// STATUS.md emoji semantics differ from RESUME.md: ⏸ = impl done / gate open
// (≈ in_progress), not blocked. Priority: blocked > in_progress > done > pending
// so a gate-open phase shows in_progress even though impl cells say ✅.
function phaseStatus(rowText: string): Status {
  if (rowText.includes("❌")) return "blocked";
  if (/[⏸⚠🔄]/.test(rowText)) return "in_progress";
  if (rowText.includes("✅")) return "done";
  return "pending";
}

function isPhaseLedger(t: MdTable): boolean {
  const h = t.header.map((c) => c.toLowerCase());
  return h.some((c) => c.includes("phase")) &&
    h.some((c) => c.includes("smoke") || c.includes("implementation"));
}

function isOpenItems(t: MdTable): boolean {
  const h = t.header.map((c) => c.toLowerCase());
  return h.some((c) => c.includes("item")) && h.some((c) => c.includes("risk"));
}

export function parseStatusMd(md: string, project: string): Task[] {
  const tasks: Task[] = [];
  let pIdx = 0;
  let iIdx = 0;

  for (const table of parseMarkdownTables(md)) {
    if (isPhaseLedger(table)) {
      for (const row of table.rows) {
        const title = cleanCell(row[0] ?? "");
        if (!title) continue;
        tasks.push({
          id: `status-phase:${pIdx++}`,
          title,
          status: phaseStatus(row.join(" ")),
          source: "STATUS.md",
          project,
        });
      }
    } else if (isOpenItems(table)) {
      const itemCol = table.header.findIndex((c) => c.toLowerCase().includes("item"));
      for (const row of table.rows) {
        const cell = row[itemCol] ?? row[1] ?? "";
        const title = cleanCell(cell);
        if (!title) continue;
        const closed = cell.includes("~~") || /✅|closed/i.test(cell);
        tasks.push({
          id: `status-item:${iIdx++}`,
          title,
          status: closed ? "done" : "pending",
          source: "STATUS.md",
          project,
        });
      }
    }
  }
  return tasks;
}
