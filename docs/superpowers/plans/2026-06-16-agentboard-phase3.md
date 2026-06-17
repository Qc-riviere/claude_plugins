# AgentBoard Phase 3 Implementation Plan — Live session todo overlay

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Show the active Claude Code session's *current* todos (TodoWrite) as a "正在执行" overlay strip, distinct from the file-based board.

**Architecture:** New collector reads the project's most-recent Claude transcript JSONL, extracts the last `TodoWrite` tool call's `todos` array → normalized live todos. New `GET /api/live?project=` serves them. Dashboard renders a strip above the board. Refreshes on the existing SSE/poll cycle.

**Tech Stack:** Bun, TypeScript, `bun test`, `node:fs`.

**Scope:** Claude side only. **Codex explicitly excluded** — rollouts are date-partitioned (not project-associated) and contain no `update_plan` data in practice; documented as not feasible now.

**Grounded facts:**
- TodoWrite item shape (from real transcripts): `{ "content": string, "status": "pending"|"in_progress"|"completed", "activeForm": string }`.
- Transcripts live at `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, where `encoded-cwd = cwd.replace(/[^a-zA-Z0-9]/g, "-")` (verified: `D:\File VS code\plugins_claude` → `D--File-VS-code-plugins-claude`).
- Current todos = the LAST line containing a TodoWrite `input.todos` in the most-recently-modified transcript.

**Data model:**
```ts
export interface LiveTodo { content: string; status: "pending" | "in_progress" | "done"; }
```

---

### Task 1: Encode cwd + locate transcript

**Files:**
- Create: `src/collector/liveTodos.ts` (encode + dir helpers)
- Test: `tests/collector/liveTodos.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { expect, test } from "bun:test";
import { encodeCwd } from "../../src/collector/liveTodos";

test("encodes cwd to Claude project dir name", () => {
  expect(encodeCwd("D:\\File VS code\\plugins_claude")).toBe("D--File-VS-code-plugins-claude");
  expect(encodeCwd("D:/File VS code/plugins_claude")).toBe("D--File-VS-code-plugins-claude");
});
```

- [ ] **Step 2: Run → fail** (`bun test tests/collector/liveTodos.test.ts`).

- [ ] **Step 3: Implement encodeCwd in `src/collector/liveTodos.ts`**

```ts
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat: encode cwd to Claude transcript dir name"`

---

### Task 2: Extract last TodoWrite from transcript text

**Files:**
- Modify: `src/collector/liveTodos.ts`
- Test: `tests/collector/liveTodos.test.ts`

- [ ] **Step 1: Add failing test**

```ts
import { extractLastTodos } from "../../src/collector/liveTodos";

const JSONL = [
  JSON.stringify({ type: "x" }),
  JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
    input: { todos: [{ content: "old", status: "completed", activeForm: "o" }] } }] } }),
  JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
    input: { todos: [
      { content: "do A", status: "in_progress", activeForm: "doing A" },
      { content: "do B", status: "pending", activeForm: "doing B" },
    ] } }] } }),
].join("\n");

test("returns the LAST TodoWrite todos, mapping completed->done", () => {
  const todos = extractLastTodos(JSONL);
  expect(todos.length).toBe(2);
  expect(todos[0]).toEqual({ content: "do A", status: "in_progress" });
  expect(todos[1]).toEqual({ content: "do B", status: "pending" });
});

test("empty when no TodoWrite present", () => {
  expect(extractLastTodos('{"type":"x"}')).toEqual([]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** (append to `liveTodos.ts`)

```ts
import type { LiveTodo } from "./liveTypes";

interface RawTodo { content: string; status: string; activeForm?: string; }

function findTodosInLine(line: string): RawTodo[] | null {
  let obj: any;
  try { obj = JSON.parse(line); } catch { return null; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type === "tool_use" && block?.name === "TodoWrite" &&
        Array.isArray(block?.input?.todos)) {
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
    status: t.status === "completed" ? "done"
      : t.status === "in_progress" ? "in_progress" : "pending",
  }));
}
```

Create `src/collector/liveTypes.ts`:
```ts
export interface LiveTodo { content: string; status: "pending" | "in_progress" | "done"; }
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat: extract latest TodoWrite todos from transcript"`

---

### Task 3: collectLiveTodos(projectDir)

**Files:**
- Modify: `src/collector/liveTodos.ts`
- Test: `tests/collector/liveTodos.test.ts`

- [ ] **Step 1: Add failing test** (uses a fake claude home via param)

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { collectLiveTodos } from "../../src/collector/liveTodos";

test("collectLiveTodos reads latest transcript for the project", async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-home-"));
  const projectDir = "D:\\proj\\demo";
  const tdir = join(home, "projects", "D--proj-demo");
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, "old.jsonl"),
    JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
      input: { todos: [{ content: "X", status: "pending" }] } }] } }));
  // newer file (write second so mtime is later)
  await new Promise((r) => setTimeout(r, 10));
  writeFileSync(join(tdir, "new.jsonl"),
    JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
      input: { todos: [{ content: "Y", status: "in_progress" }] } }] } }));
  const todos = await collectLiveTodos(projectDir, home);
  expect(todos).toEqual([{ content: "Y", status: "in_progress" }]);
});

test("collectLiveTodos returns [] when no transcript dir", async () => {
  expect(await collectLiveTodos("D:\\nope", mkdtempSync(join(tmpdir(), "ab-h2-")))).toEqual([]);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** (append)

```ts
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat: collectLiveTodos from latest project transcript"`

---

### Task 4: API endpoint + dashboard strip

**Files:**
- Modify: `src/server/server.ts` (add `/api/live`)
- Modify: `src/server/static/index.html`, `app.js`, `style.css`

- [ ] **Step 1: Add `/api/live` route in `server.ts`**

Add import: `import { collectLiveTodos } from "../collector/liveTodos";`

In `fetch`, after `/api/schedules`:
```ts
      if (url.pathname === "/api/live") {
        const projects = project
          ? [project]
          : (await readProjects(opts.projectsFile)).map((p) => p.path);
        const all = (await Promise.all(projects.map((p) => collectLiveTodos(p)))).flat();
        return json(all);
      }
```

- [ ] **Step 2: Add the strip to `index.html`** (after `<div id="bar">...</div>`, before `<section id="todo">`)

```html
  <section id="live-strip"><h2>🔴 当前会话执行中</h2><div id="live-list"></div></section>
```

- [ ] **Step 3: Render it in `app.js`** — inside `refresh()`, after the schedules block:

```js
  const live = await (await fetch("/api/live" + q())).json();
  const ll = document.getElementById("live-list");
  ll.innerHTML = live.length
    ? live.map((t) => `<span class="live-item ${t.status}">${t.content}</span>`).join("")
    : '<small>无活跃会话 todo</small>';
```

- [ ] **Step 4: Style in `style.css`**

```css
#live-strip { margin: 1rem 0; }
.live-item { display:inline-block; margin:.2rem .3rem .2rem 0; padding:.25rem .5rem; border-radius:6px; font-size:.85rem; background:#21262d; }
.live-item.in_progress { background:#1f6feb; color:#fff; }
.live-item.done { opacity:.5; text-decoration:line-through; }
```

- [ ] **Step 5: Manual verify (browser)** — rebuild+serve; the strip shows the current session's todos; in_progress highlighted blue, done struck through.

- [ ] **Step 6: Commit** — `git commit -m "feat: live session todo overlay strip"`

---

### Task 5: Rebuild, install, e2e, finalize

- [ ] **Step 1:** `bun test` — all green (Phase 1/2 22 + liveTodos 5 = 27).
- [ ] **Step 2:** `bun build --compile ...`; kill old exe; install to `~/.local/bin`.
- [ ] **Step 3:** Launch detached, open dashboard, confirm the live strip reflects this session's todos (or "无活跃会话 todo" if none).
- [ ] **Step 4:** Update `STATUS.md` phase ledger (Phase 3 done, Claude-only); commit.

---

## Self-Review
- **Spec coverage:** live overlay (Claude) → Tasks 1-4 ✓. Codex side documented as excluded ✓.
- **Placeholders:** none; all code complete.
- **Type consistency:** `LiveTodo` in `liveTypes.ts` reused; `encodeCwd`, `extractLastTodos`, `collectLiveTodos(projectDir, claudeHome?)` signatures consistent across tasks and server.

## Open risks
- Live strip refreshes on the existing SSE/30s-poll cycle; the transcript dir is NOT in the file watcher, so updates lag up to 30s (acceptable; documented). Could add transcript-dir watching later.
- Transcript JSON shape may vary by Claude Code version; parser tolerates missing fields and returns [] rather than throwing.
