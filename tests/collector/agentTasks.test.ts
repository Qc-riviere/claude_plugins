import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { collectAgentTasks } from "../../src/collector/agentTasks";

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "ab-tasks-"));
  // transcript so latestSessionId resolves to "sessA"
  const tdir = join(home, "projects", "D--proj-demo");
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, "sessA.jsonl"), "{}");
  // task files for that session
  const taskDir = join(home, "tasks", "sessA");
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "1.json"), JSON.stringify(
    { id: "1", subject: "做 A", status: "in_progress", blocks: [], blockedBy: [] }));
  writeFileSync(join(taskDir, "2.json"), JSON.stringify(
    { id: "2", subject: "做 B", status: "pending", blocks: [], blockedBy: ["1"] }));
  writeFileSync(join(taskDir, "3.json"), JSON.stringify(
    { id: "3", subject: "做 C", status: "completed", blocks: [], blockedBy: [] }));
  return home;
}

test("collectAgentTasks maps session tasks with status (blockedBy -> blocked)", async () => {
  const home = makeHome();
  const tasks = await collectAgentTasks("D:\\proj\\demo", home);
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t.status]));
  expect(byTitle["做 A"]).toBe("in_progress");
  expect(byTitle["做 B"]).toBe("blocked");   // pending but blockedBy non-empty
  expect(byTitle["做 C"]).toBe("done");
  expect(tasks[0].source).toBe("Task");
});

test("collectAgentTasks returns [] when no session/tasks", async () => {
  expect(await collectAgentTasks("D:\\nope", mkdtempSync(join(tmpdir(), "ab-t2-")))).toEqual([]);
});
