import { readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Status, Task } from "./types";
import { latestSessionId } from "./liveTodos";

interface RawTask {
  id: string;
  subject: string;
  status: string;
  blockedBy?: string[];
}

function taskStatus(t: RawTask): Status {
  if (t.status === "completed") return "done";
  if (t.status === "in_progress") return "in_progress";
  if (t.blockedBy && t.blockedBy.length > 0) return "blocked";
  return "pending";
}

// Read the current session's Claude Code Task list (~/.claude/tasks/<session>/*.json)
// for a project, mapped to board tasks. Session-scoped; uses the latest transcript.
export async function collectAgentTasks(
  projectDir: string,
  claudeHome: string = join(homedir(), ".claude"),
): Promise<Task[]> {
  const sid = latestSessionId(projectDir, claudeHome);
  if (!sid) return [];
  const dir = join(claudeHome, "tasks", sid);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const tasks: Task[] = [];
  for (const f of files) {
    let raw: RawTask;
    try {
      raw = JSON.parse(await Bun.file(join(dir, f)).text());
    } catch {
      continue;
    }
    tasks.push({
      id: `task:${raw.id}`,
      title: raw.subject,
      status: taskStatus(raw),
      source: "Task",
      project: projectDir,
    });
  }
  return tasks;
}
