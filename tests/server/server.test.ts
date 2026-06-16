import { expect, test, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { makeServer } from "../../src/server/server";

// project with one resume task
const dir = mkdtempSync(join(tmpdir(), "ab-srv-"));
mkdirSync(join(dir, ".claude"));
writeFileSync(join(dir, ".claude", "RESUME.md"),
  "| Task | Status | Commit |\n|---|---|---|\n| Hello | 🔄 | - |\n");
const projectsFile = join(dir, "projects.json");
writeFileSync(projectsFile, JSON.stringify([{ path: dir, tool: "claude", addedAt: "x" }]));
const scheduleFile = join(dir, "schedule.json");
writeFileSync(scheduleFile, JSON.stringify(
  [{ name: "d", cron_expr: "0 9 * * *", command: "echo", enabled: true, project: dir }]));

const server = makeServer({ port: 0, projectsFile, scheduleFile });
const base = `http://localhost:${server.port}`;
afterAll(() => server.stop(true));

test("GET /api/projects returns registered projects", async () => {
  const r = await fetch(`${base}/api/projects`);
  const json = await r.json();
  expect(json[0].path).toBe(dir);
});

test("GET /api/tasks?project= returns tasks", async () => {
  const r = await fetch(`${base}/api/tasks?project=${encodeURIComponent(dir)}`);
  const json = await r.json();
  expect(json[0].title).toBe("Hello");
  expect(json[0].status).toBe("in_progress");
});

test("GET /api/schedules adds next_run", async () => {
  const r = await fetch(`${base}/api/schedules?project=${encodeURIComponent(dir)}`);
  const json = await r.json();
  expect(json[0].name).toBe("d");
  expect(typeof json[0].next_run).toBe("string");
});
