# AgentBoard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file Bun exe that serves a local web dashboard visualizing project todos (from `.claude/RESUME.md` + `TODO.md`) and scheduled tasks (from `schedule.json`), auto-launched alongside Claude Code.

**Architecture:** Four isolated TypeScript modules — `collector` (parse project files → normalized `Task[]`), `schedule` (read `schedule.json`, compute next-run), `server` (`Bun.serve` REST API + embedded static dashboard), `registry` (track projects, probe port, detached launch). A thin `cli` dispatches `serve` / `register` / `version`. Compiled to `agentboard.exe` via `bun build --compile`.

**Tech Stack:** Bun 1.3.14, TypeScript, `bun test`, `cron-parser@^4` for next-run computation. No other runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-16-agentboard-design.md`

**Data model (used everywhere — keep consistent):**
```ts
export type Status = "pending" | "in_progress" | "blocked" | "done";
export interface Task {
  id: string;       // e.g. "resume:0", "todo:2"
  title: string;
  status: Status;
  source: string;   // "RESUME.md" | "TODO.md"
  project: string;  // absolute project root
}
export interface Schedule {
  name: string;
  cron_expr: string;
  command: string;
  enabled: boolean;
  last_run?: string;   // ISO
  project?: string;    // absolute project root
}
```

**Status emoji mapping (RESUME.md):** `⬜`→pending, `🔄`→in_progress, `⏸️`→blocked, `✅`→done.

## File Structure

```
package.json
tsconfig.json
src/
  index.ts                 # entry → cli
  cli.ts                   # arg dispatch: serve | register | version
  paths.ts                 # ~/.agentboard dir + file paths
  collector/
    types.ts               # Status, Task
    resume.ts              # parseResumeTable
    todo.ts                # parseTodoChecklist
    collect.ts             # collectTasks(projectDir) -> Task[]
  schedule/
    types.ts               # Schedule
    nextRun.ts             # computeNextRun
    store.ts               # readSchedules
  registry/
    registry.ts            # readProjects, addProject
  server/
    server.ts              # makeServer(opts) -> Bun.serve handler
    static/
      index.html           # dashboard markup
      app.js               # fetch + render
      style.css            # layout
tests/
  collector/resume.test.ts
  collector/todo.test.ts
  collector/collect.test.ts
  schedule/nextRun.test.ts
  schedule/store.test.ts
  registry/registry.test.ts
  server/server.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: Init git + project**

```bash
cd "D:/File VS code/plugins_claude"
git init
bun init -y
bun add cron-parser@^4
```

- [ ] **Step 2: Write `package.json`** (replace generated one)

```json
{
  "name": "agentboard",
  "module": "src/index.ts",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "build": "bun build --compile --outfile agentboard.exe ./src/index.ts"
  },
  "dependencies": {
    "cron-parser": "^4.9.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun-types"],
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
agentboard.exe
*.log
```

- [ ] **Step 5: Verify Bun runs and commit**

Run: `bun test` (no tests yet) then commit.
Expected: `bun test` exits 0 with "0 tests".

```bash
git add -A && git commit -m "chore: scaffold agentboard bun project"
```

---

### Task 2: Collector types + RESUME.md parser

**Files:**
- Create: `src/collector/types.ts`, `src/collector/resume.ts`
- Test: `tests/collector/resume.test.ts`

- [ ] **Step 1: Write `src/collector/types.ts`**

```ts
export type Status = "pending" | "in_progress" | "blocked" | "done";

export interface Task {
  id: string;
  title: string;
  status: Status;
  source: string;
  project: string;
}

export function statusFromEmoji(cell: string): Status {
  if (cell.includes("✅")) return "done";
  if (cell.includes("🔄")) return "in_progress";
  if (cell.includes("⏸")) return "blocked";
  return "pending"; // ⬜ or anything else
}
```

- [ ] **Step 2: Write the failing test `tests/collector/resume.test.ts`**

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/collector/resume.test.ts`
Expected: FAIL — cannot find module `resume`.

- [ ] **Step 4: Write `src/collector/resume.ts`**

```ts
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
    if (/^-+$/.test(cells[0]) || cells[0] === "" && cells[1] === "") continue;
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/collector/resume.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: parse RESUME.md task table"
```

---

### Task 3: TODO.md checklist parser

**Files:**
- Create: `src/collector/todo.ts`
- Test: `tests/collector/todo.test.ts`

- [ ] **Step 1: Write the failing test `tests/collector/todo.test.ts`**

```ts
import { expect, test } from "bun:test";
import { parseTodoChecklist } from "../../src/collector/todo";

const SAMPLE = `# TODO
- [ ] 第一件事
- [x] 已完成的事
- [X] 大写也算完成
- 普通列表项不算
* [ ] 星号复选框
`;

test("parses checkbox items, mapping x->done and space->pending", () => {
  const tasks = parseTodoChecklist(SAMPLE, "/proj");
  expect(tasks.length).toBe(4);
  expect(tasks[0]).toEqual({
    id: "todo:0", title: "第一件事", status: "pending",
    source: "TODO.md", project: "/proj",
  });
  expect(tasks[1].status).toBe("done");
  expect(tasks[2].status).toBe("done");
  expect(tasks[3].title).toBe("星号复选框");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/collector/todo.test.ts`
Expected: FAIL — cannot find module `todo`.

- [ ] **Step 3: Write `src/collector/todo.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/collector/todo.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: parse TODO.md checklist"
```

---

### Task 4: collectTasks aggregator

**Files:**
- Create: `src/collector/collect.ts`
- Test: `tests/collector/collect.test.ts`

- [ ] **Step 1: Write the failing test `tests/collector/collect.test.ts`**

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { collectTasks } from "../../src/collector/collect";

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ab-"));
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude", "RESUME.md"),
    "| Task | Status | Commit |\n|---|---|---|\n| A | ✅ | x |\n");
  writeFileSync(join(dir, "TODO.md"), "- [ ] B\n");
  return dir;
}

test("collects from RESUME.md and TODO.md", async () => {
  const dir = makeProject();
  const tasks = await collectTasks(dir);
  const titles = tasks.map((t) => t.title).sort();
  expect(titles).toEqual(["A", "B"]);
  expect(tasks.every((t) => t.project === dir)).toBe(true);
});

test("missing files yield empty, no throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-empty-"));
  expect(await collectTasks(dir)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/collector/collect.test.ts`
Expected: FAIL — cannot find module `collect`.

- [ ] **Step 3: Write `src/collector/collect.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/collector/collect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: aggregate tasks from project files"
```

---

### Task 5: Schedule store

**Files:**
- Create: `src/schedule/types.ts`, `src/schedule/store.ts`
- Test: `tests/schedule/store.test.ts`

- [ ] **Step 1: Write `src/schedule/types.ts`**

```ts
export interface Schedule {
  name: string;
  cron_expr: string;
  command: string;
  enabled: boolean;
  last_run?: string;
  project?: string;
}
```

- [ ] **Step 2: Write the failing test `tests/schedule/store.test.ts`**

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readSchedules } from "../../src/schedule/store";

test("reads schedules from json file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-sched-"));
  const file = join(dir, "schedule.json");
  writeFileSync(file, JSON.stringify([
    { name: "daily", cron_expr: "0 9 * * *", command: "echo hi", enabled: true },
  ]));
  const list = await readSchedules(file);
  expect(list.length).toBe(1);
  expect(list[0].name).toBe("daily");
});

test("missing file returns empty array", async () => {
  expect(await readSchedules(join(tmpdir(), "nope-schedule.json"))).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/schedule/store.test.ts`
Expected: FAIL — cannot find module `store`.

- [ ] **Step 4: Write `src/schedule/store.ts`**

```ts
import type { Schedule } from "./types";

export async function readSchedules(path: string): Promise<Schedule[]> {
  const f = Bun.file(path);
  if (!(await f.exists())) return [];
  try {
    const data = JSON.parse(await f.text());
    return Array.isArray(data) ? (data as Schedule[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/schedule/store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: read schedule.json store"
```

---

### Task 6: Next-run computation

**Files:**
- Create: `src/schedule/nextRun.ts`
- Test: `tests/schedule/nextRun.test.ts`

- [ ] **Step 1: Write the failing test `tests/schedule/nextRun.test.ts`**

```ts
import { expect, test } from "bun:test";
import { computeNextRun } from "../../src/schedule/nextRun";

test("computes next run for a daily cron", () => {
  const from = new Date("2026-06-16T08:00:00Z");
  const next = computeNextRun("0 9 * * *", from); // 09:00 UTC daily
  expect(next).toBe(new Date("2026-06-16T09:00:00Z").toISOString());
});

test("invalid cron returns null", () => {
  expect(computeNextRun("not a cron", new Date())).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/schedule/nextRun.test.ts`
Expected: FAIL — cannot find module `nextRun`.

- [ ] **Step 3: Write `src/schedule/nextRun.ts`**

> Note: cron-parser v4 exports a default object with `parseExpression`. If `bun add` pulled a different major, adjust the import per its README before continuing. Verify with `cat node_modules/cron-parser/package.json | grep '"version"'` — expect `4.x`.

```ts
import parser from "cron-parser";

export function computeNextRun(
  cronExpr: string,
  from: Date = new Date(),
): string | null {
  try {
    const it = parser.parseExpression(cronExpr, { currentDate: from, utc: true });
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/schedule/nextRun.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: compute schedule next-run via cron-parser"
```

---

### Task 7: Paths + project registry

**Files:**
- Create: `src/paths.ts`, `src/registry/registry.ts`
- Test: `tests/registry/registry.test.ts`

- [ ] **Step 1: Write `src/paths.ts`**

```ts
import { homedir } from "os";
import { join } from "path";

export const AGENTBOARD_DIR = join(homedir(), ".agentboard");
export const PROJECTS_FILE = join(AGENTBOARD_DIR, "projects.json");
export const SCHEDULE_FILE = join(AGENTBOARD_DIR, "schedule.json");
export const DEFAULT_PORT = 8123;
```

- [ ] **Step 2: Write the failing test `tests/registry/registry.test.ts`**

```ts
import { expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readProjects, addProject } from "../../src/registry/registry";

test("addProject persists and dedupes by path", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "ab-reg-")), "projects.json");
  await addProject("/proj/a", "claude", file);
  await addProject("/proj/a", "codex", file); // duplicate path
  await addProject("/proj/b", "claude", file);
  const list = await readProjects(file);
  expect(list.map((p) => p.path).sort()).toEqual(["/proj/a", "/proj/b"]);
});

test("readProjects on missing file returns empty", async () => {
  expect(await readProjects(join(tmpdir(), "no-projects.json"))).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/registry/registry.test.ts`
Expected: FAIL — cannot find module `registry`.

- [ ] **Step 4: Write `src/registry/registry.ts`**

```ts
import { dirname } from "path";
import { mkdirSync } from "fs";
import { PROJECTS_FILE } from "../paths";

export interface Project {
  path: string;
  tool?: string;
  addedAt: string;
}

export async function readProjects(file: string = PROJECTS_FILE): Promise<Project[]> {
  const f = Bun.file(file);
  if (!(await f.exists())) return [];
  try {
    const data = JSON.parse(await f.text());
    return Array.isArray(data) ? (data as Project[]) : [];
  } catch {
    return [];
  }
}

export async function addProject(
  path: string,
  tool: string | undefined,
  file: string = PROJECTS_FILE,
): Promise<void> {
  const list = await readProjects(file);
  const existing = list.find((p) => p.path === path);
  if (existing) {
    existing.tool = tool ?? existing.tool;
  } else {
    list.push({ path, tool, addedAt: new Date().toISOString() });
  }
  mkdirSync(dirname(file), { recursive: true });
  await Bun.write(file, JSON.stringify(list, null, 2));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/registry/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: project registry + paths"
```

---

### Task 8: HTTP server + API

**Files:**
- Create: `src/server/server.ts`
- Test: `tests/server/server.test.ts`

- [ ] **Step 1: Write the failing test `tests/server/server.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server/server.test.ts`
Expected: FAIL — cannot find module `server`.

- [ ] **Step 3: Write `src/server/server.ts`**

```ts
import { collectTasks } from "../collector/collect";
import { readProjects } from "../registry/registry";
import { readSchedules } from "../schedule/store";
import { computeNextRun } from "../schedule/nextRun";

export interface ServerOpts {
  port: number;
  projectsFile?: string;
  scheduleFile?: string;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

export function makeServer(opts: ServerOpts) {
  return Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const project = url.searchParams.get("project") ?? undefined;

      if (url.pathname === "/api/projects") {
        return json(await readProjects(opts.projectsFile));
      }
      if (url.pathname === "/api/tasks") {
        const projects = project
          ? [project]
          : (await readProjects(opts.projectsFile)).map((p) => p.path);
        const all = (await Promise.all(projects.map(collectTasks))).flat();
        return json(all);
      }
      if (url.pathname === "/api/schedules") {
        const all = await readSchedules(opts.scheduleFile);
        const filtered = project ? all.filter((s) => s.project === project) : all;
        return json(filtered.map((s) => ({ ...s, next_run: computeNextRun(s.cron_expr) })));
      }
      return new Response("not found", { status: 404 });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server/server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: HTTP API server"
```

---

### Task 9: Dashboard static assets + serving

**Files:**
- Create: `src/server/static/index.html`, `src/server/static/style.css`, `src/server/static/app.js`
- Modify: `src/server/server.ts` (serve static files; embed via import)

> Static UI is verified manually (Step 5), not unit-tested.

- [ ] **Step 1: Write `src/server/static/index.html`**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>AgentBoard</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <h1>AgentBoard</h1>
  <section id="todo"><h2>Todo</h2><div id="cols"></div></section>
  <section id="sched"><h2>定时任务</h2><ul id="sched-list"></ul></section>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/server/static/style.css`**

```css
body { font-family: system-ui, sans-serif; margin: 2rem; background:#0d1117; color:#e6edf3; }
h1 { margin-top: 0; }
#cols { display: flex; gap: 1rem; }
.col { flex: 1; background:#161b22; border-radius:8px; padding:.75rem; }
.col h3 { margin:.2rem 0 .6rem; font-size:.9rem; text-transform:uppercase; opacity:.7; }
.card { background:#21262d; border-radius:6px; padding:.5rem .6rem; margin-bottom:.5rem; font-size:.9rem; }
.card small { opacity:.5; }
#sched-list { list-style:none; padding:0; }
#sched-list li { background:#161b22; border-radius:6px; padding:.5rem .6rem; margin-bottom:.5rem; }
```

- [ ] **Step 3: Write `src/server/static/app.js`**

```js
const COLS = [
  ["pending", "待办"], ["in_progress", "进行中"],
  ["blocked", "阻塞"], ["done", "完成"],
];

async function refresh() {
  const tasks = await (await fetch("/api/tasks")).json();
  const cols = document.getElementById("cols");
  cols.innerHTML = "";
  for (const [status, label] of COLS) {
    const div = document.createElement("div");
    div.className = "col";
    const items = tasks.filter((t) => t.status === status);
    div.innerHTML = `<h3>${label} (${items.length})</h3>` + items.map((t) =>
      `<div class="card">${t.title}<br><small>${t.source}</small></div>`).join("");
    cols.appendChild(div);
  }

  const scheds = await (await fetch("/api/schedules")).json();
  document.getElementById("sched-list").innerHTML = scheds.map((s) =>
    `<li><b>${s.name}</b> — ${s.cron_expr}<br><small>下次: ${s.next_run ?? "无效表达式"}</small></li>`
  ).join("") || "<li><small>暂无定时任务</small></li>";
}

refresh();
setInterval(refresh, 4000);
```

- [ ] **Step 4: Modify `src/server/server.ts` to serve static files**

Add these imports at top:

```ts
import indexHtml from "./static/index.html" with { type: "text" };
import appJs from "./static/app.js" with { type: "text" };
import styleCss from "./static/style.css" with { type: "text" };
```

Inside `fetch`, before the final 404, add:

```ts
      if (url.pathname === "/" || url.pathname === "/index.html")
        return new Response(indexHtml, { headers: { "content-type": "text/html" } });
      if (url.pathname === "/app.js")
        return new Response(appJs, { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/style.css")
        return new Response(styleCss, { headers: { "content-type": "text/css" } });
```

> If Bun's text import attribute errors at runtime, fall back to `await Bun.file(new URL("./static/index.html", import.meta.url)).text()` — but the `with { type: "text" }` form is what `bun build --compile` embeds into the exe, so prefer it.

- [ ] **Step 5: Manual verify**

Run: `bun run src/index.ts serve --port 8123` (after Task 10 adds CLI; if doing out of order, temporarily call `makeServer({port:8123})` from a scratch file).
Open `http://127.0.0.1:8123` → see four todo columns + 定时任务 section.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: dashboard UI + static serving"
```

---

### Task 10: CLI dispatch + auto-launch

**Files:**
- Create: `src/index.ts`, `src/cli.ts`

- [ ] **Step 1: Write `src/cli.ts`**

```ts
import { DEFAULT_PORT, PROJECTS_FILE, SCHEDULE_FILE } from "./paths";
import { addProject } from "./registry/registry";
import { makeServer } from "./server/server";

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function portOpen(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/projects`);
    return true;
  } catch {
    return false;
  }
}

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...args] = argv;
  const port = Number(getFlag(args, "--port") ?? DEFAULT_PORT);

  if (cmd === "version") {
    console.log("agentboard 0.1.0");
    return;
  }

  if (cmd === "serve") {
    makeServer({ port, projectsFile: PROJECTS_FILE, scheduleFile: SCHEDULE_FILE });
    console.log(`AgentBoard on http://127.0.0.1:${port}`);
    return;
  }

  if (cmd === "register") {
    const path = args[0];
    if (!path) { console.error("usage: agentboard register <path> [--tool claude|codex]"); process.exit(1); }
    await addProject(path, getFlag(args, "--tool"));
    if (!(await portOpen(port))) {
      Bun.spawn([process.execPath, import.meta.path, "serve", "--port", String(port)], {
        stdio: ["ignore", "ignore", "ignore"],
      }).unref();
    }
    console.log(`registered ${path}`);
    return;
  }

  console.error("usage: agentboard <serve|register|version>");
  process.exit(1);
}
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
import { run } from "./cli";
await run(process.argv.slice(2));
```

- [ ] **Step 3: Manual verify register + serve**

```bash
bun run src/index.ts register "D:/File VS code/plugins_claude"
```
Expected: prints `registered ...`, spawns server. Then `bun run src/index.ts serve` in another shell and open the dashboard; `/api/projects` includes the registered path.

> Note: when compiled, `import.meta.path`/`process.execPath` point at the exe itself, so `register` re-spawns the exe with `serve`. In dev (`bun run`), it spawns bun with the script path. Both work.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: CLI dispatch + detached auto-launch"
```

---

### Task 11: Compile to exe + install

**Files:** none (build artifacts)

- [ ] **Step 1: Build the single-file exe**

Run: `bun build --compile --outfile agentboard.exe ./src/index.ts`
Expected: produces `agentboard.exe` in project root.

- [ ] **Step 2: Smoke-test the exe**

```bash
./agentboard.exe version
./agentboard.exe register "D:/File VS code/plugins_claude"
```
Expected: prints version; registers and launches server; `http://127.0.0.1:8123` shows the dashboard with this project's tasks (it has RESUME-style files under docs, but no `.claude/RESUME.md` yet — add one or a `TODO.md` to see cards).

- [ ] **Step 3: Install to ~/.local/bin**

```bash
cp agentboard.exe "C:/Users/FU Qianchen/.local/bin/agentboard.exe"
"C:/Users/FU Qianchen/.local/bin/agentboard.exe" version
```
Expected: version prints from installed location.

> No commit needed (exe is gitignored). If a build script change was made, commit that.

---

### Task 12: Claude Code SessionStart auto-launch hook

**Files:**
- Modify: `C:/Users/FU Qianchen/.claude/settings.json` (append one hook to existing `SessionStart` array — DO NOT overwrite existing entries)

> ⚠️ The user's `settings.json` already has multiple `SessionStart` hooks (clawd, auto-start). Append, never replace. Read the file first, add one object to the `hooks.SessionStart[0].hooks` array (or a new matcher block), keep all existing entries.

- [ ] **Step 1: Read current settings.json SessionStart block**

Run: inspect `hooks.SessionStart` to confirm structure before editing.

- [ ] **Step 2: Append AgentBoard hook**

Add this object to the existing `SessionStart` hooks list:

```json
{
  "type": "command",
  "command": "& \"C:\\Users\\FU Qianchen\\.local\\bin\\agentboard.exe\" register \"$env:CLAUDE_PROJECT_DIR\" --tool claude",
  "shell": "powershell",
  "timeout": 10,
  "async": true
}
```

> Verify the env var name Claude Code exposes for project dir (`CLAUDE_PROJECT_DIR`). If unset in this version, fall back to using cwd inside a tiny wrapper, or `(Get-Location).Path`.

- [ ] **Step 3: Manual e2e verify**

Start a NEW Claude Code session in a test project that has a `TODO.md`. Then:
```bash
"C:/Users/FU Qianchen/.local/bin/agentboard.exe" register --help  # sanity
```
Open `http://127.0.0.1:8123` → confirm the new session's project appears in `/api/projects` and its todos render.

- [ ] **Step 4: Commit (project repo only)**

settings.json is outside the repo; no repo commit. Note the change in `.claude/RESUME.md` if maintaining one.

---

## Self-Review

**Spec coverage:**
- Collector (RESUME+TODO) → Tasks 2,3,4 ✓ (STATUS.md is Phase 2, correctly excluded)
- Schedule store + next_run → Tasks 5,6 ✓
- Server + API (projects/tasks/schedules) → Task 8 ✓
- Dashboard two panels → Task 9 ✓
- Registry + port-probe auto-launch → Tasks 7,10 ✓
- Claude SessionStart hook (append) → Task 12 ✓
- Compile to exe + install to ~/.local/bin → Task 11 ✓
- Codex hook, STATUS.md, fsnotify, live overlay → Phase 2 (out of scope) ✓

**Placeholder scan:** No TBD/TODO; all code steps contain full code. Two flagged runtime caveats (cron-parser major, Bun text-import) include concrete fallbacks, not placeholders.

**Type consistency:** `Task`/`Schedule`/`Status`/`Project` defined once and reused; `makeServer(ServerOpts)`, `addProject(path,tool,file)`, `readProjects(file)`, `readSchedules(path)`, `computeNextRun(expr,from)`, `collectTasks(dir)`, `parseResumeTable(md,project)`, `parseTodoChecklist(md,project)` signatures match across tasks. `next_run` (snake) is an API-only field added in Task 8/9, not on the `Schedule` type — consistent.

## Open risks (resolve during execution)
- `cron-parser` major version import shape — verify v4 (Task 6).
- Bun `with { type: "text" }` import embedding under `--compile` — fallback noted (Task 9).
- `CLAUDE_PROJECT_DIR` availability in PowerShell hook — fallback noted (Task 12).
