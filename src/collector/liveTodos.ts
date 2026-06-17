import { readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { LiveTodo } from "./liveTypes";

export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

interface RawTodo { content: string; status: string; activeForm?: string }

function findTodosInLine(line: string): RawTodo[] | null {
  let obj: any;
  try { obj = JSON.parse(line); } catch { return null; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block?.type === "tool_use" &&
      block?.name === "TodoWrite" &&
      Array.isArray(block?.input?.todos)
    ) {
      return block.input.todos as RawTodo[];
    }
  }
  return null;
}

export function extractLastTodos(jsonl: string): LiveTodo[] {
  let last: RawTodo[] | null = null;
  for (const line of jsonl.split("\n")) {
    if (!line.includes("TodoWrite")) continue;
    const todos = findTodosInLine(line);
    if (todos) last = todos;
  }
  if (!last) return [];
  return last.map((t) => ({
    content: t.content,
    status:
      t.status === "completed" ? "done"
      : t.status === "in_progress" ? "in_progress"
      : "pending",
  }));
}

export async function collectLiveTodos(
  projectDir: string,
  claudeHome: string = join(homedir(), ".claude"),
): Promise<LiveTodo[]> {
  const dir = join(claudeHome, "projects", encodeCwd(projectDir));
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  if (files.length === 0) return [];
  let latest = "";
  let latestMs = -1;
  for (const f of files) {
    const ms = statSync(join(dir, f)).mtimeMs;
    if (ms > latestMs) { latestMs = ms; latest = f; }
  }
  const text = await Bun.file(join(dir, latest)).text();
  return extractLastTodos(text);
}
