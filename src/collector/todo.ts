import type { Task } from "./types";

const CHECKBOX = /^[-*]\s+\[([ xX])\]\s+(.*)$/;

export function parseTodoChecklist(md: string, project: string): Task[] {
  const tasks: Task[] = [];
  let idx = 0;
  for (const raw of md.split("\n")) {
    const m = raw.trim().match(CHECKBOX);
    if (!m) continue;
    tasks.push({
      id: `todo:${idx++}`,
      title: m[2].trim(),
      status: m[1] === " " ? "pending" : "done",
      source: "TODO.md",
      project,
    });
  }
  return tasks;
}
