import { join } from "path";
import type { Task } from "./types";
import { parseResumeTable } from "./resume";
import { parseTodoChecklist } from "./todo";

async function readIfExists(path: string): Promise<string | null> {
  const f = Bun.file(path);
  return (await f.exists()) ? await f.text() : null;
}

export async function collectTasks(projectDir: string): Promise<Task[]> {
  const tasks: Task[] = [];
  const resume = await readIfExists(join(projectDir, ".claude", "RESUME.md"));
  if (resume) tasks.push(...parseResumeTable(resume, projectDir));
  const todo = await readIfExists(join(projectDir, "TODO.md"));
  if (todo) tasks.push(...parseTodoChecklist(todo, projectDir));
  return tasks;
}
