import { type Task, statusFromEmoji } from "./types";

export function parseResumeTable(md: string, project: string): Task[] {
  const tasks: Task[] = [];
  let idx = 0;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    // skip header row and separator row
    if (cells[0].toLowerCase() === "task" || cells[1].toLowerCase() === "status") continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    tasks.push({
      id: `resume:${idx++}`,
      title: cells[0],
      status: statusFromEmoji(cells[1]),
      source: "RESUME.md",
      project,
    });
  }
  return tasks;
}
