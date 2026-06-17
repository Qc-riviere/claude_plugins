# AgentBoard Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Make the board cross-tool (Codex auto-launch), live-updating (file-watch + SSE instead of 4s polling), and multi-project aware (group/filter by project).

**Architecture:** Add a Codex SessionStart hook (same wrapper as Claude, reading `cwd` from stdin JSON). Add a file watcher that broadcasts Server-Sent Events to the dashboard, which refreshes on event. Extend the dashboard to group the todo board by project with a project selector.

**Tech Stack:** Bun 1.3.14, TypeScript, `bun test`, `node:fs` watch, SSE via `Bun.serve` ReadableStream.

**Scope:** Codex hook + real-time refresh + multi-project view. **Out of scope (deferred):** in-session live todo overlay (Codex has no `update_plan` data in current rollouts; Claude TodoWrite transcript format unverified/fragile).

**Research facts (grounded):**
- Codex hooks use Claude's event schema, in `~/.codex/config.toml`:
  ```toml
  [[hooks.SessionStart]]
  matcher = "startup|resume"
  [[hooks.SessionStart.hooks]]
  type = "command"
  command = '...'
  command_windows = '...'
  ```
  SessionStart stdin JSON includes `cwd`, `session_id`, `source`. Non-managed command hooks require user trust on first run (hash-recorded).
- Claude SessionStart hooks ALSO receive stdin JSON with `cwd` (confirmed: push-guard.ps1 reads `[Console]::In.ReadToEnd() | ConvertFrom-Json`). So one wrapper reading stdin `cwd` serves both tools.

---

### Task 1: Unified hook wrapper + Codex SessionStart hook

**Files:**
- Modify: `C:/Users/FU Qianchen/.claude/hooks/agentboard-start.ps1` (read stdin cwd + tool param)
- Modify: `C:/Users/FU Qianchen/.claude/settings.json` (pass `claude` arg to wrapper)
- Modify: `C:/Users/FU Qianchen/.codex/config.toml` (add SessionStart hook)

- [ ] **Step 1: Rewrite the wrapper to read stdin cwd and accept a tool arg**

Overwrite `agentboard-start.ps1`:

```powershell
# AgentBoard session-start hook (shared by Claude Code and Codex).
# Reads the project dir from the hook's stdin JSON (`cwd`); falls back to
# CLAUDE_PROJECT_DIR then the process working directory.
param([string]$Tool = "claude")
$dir = $null
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) { $dir = ($raw | ConvertFrom-Json).cwd }
} catch {}
if (-not $dir) {
  $dir = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { (Get-Location).Path }
}
& "C:\Users\FU Qianchen\.local\bin\agentboard.exe" register $dir --tool $Tool *> $null
```

- [ ] **Step 2: Verify the wrapper with a simulated Codex stdin payload**

Run (PowerShell):
```powershell
'{"cwd":"D:/File VS code/plugins_claude","session_id":"x","hook_event_name":"SessionStart"}' |
  & "C:\Users\FU Qianchen\.claude\hooks\agentboard-start.ps1" codex
Start-Sleep 4
(Get-NetTCPConnection -LocalPort 8123 -State Listen -ErrorAction SilentlyContinue) -ne $null
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8123/api/projects).Content
```
Expected: `True` (listening) and projects JSON includes the dir with `"tool":"codex"` (or `claude` if already present — register updates tool).

- [ ] **Step 3: Update the Claude hook to pass the tool arg explicitly**

In `settings.json`, change the agentboard SessionStart hook command from
`& "C:\Users\FU Qianchen\.claude\hooks\agentboard-start.ps1"`
to
`& "C:\Users\FU Qianchen\.claude\hooks\agentboard-start.ps1" claude`

- [ ] **Step 4: Add the Codex SessionStart hook**

Append to `~/.codex/config.toml`:

```toml
[[hooks.SessionStart]]
matcher = "startup|resume"

[[hooks.SessionStart.hooks]]
type = "command"
command = 'pwsh -NoProfile -File "$HOME/.claude/hooks/agentboard-start.ps1" codex'
command_windows = 'powershell -NoProfile -File "C:\Users\FU Qianchen\.claude\hooks\agentboard-start.ps1" codex'
timeout = 10
```

- [ ] **Step 5: Validate config.toml parses**

Run: `bun -e "import {parse} from 'toml'" 2>/dev/null || echo "no toml lib"` — if unavailable, validate by launching Codex once (user) OR `python -c "import tomllib,sys; tomllib.load(open(r'C:/Users/FU Qianchen/.codex/config.toml','rb'))" && echo OK`.
Expected: `OK` (valid TOML).

> Codex requires trusting this hook on first session (it shows the hook hash for review). That is a one-time **user** action — flag it; cannot be automated.

- [ ] **Step 6: Commit (repo has no changes here; hooks/config are outside repo)**

No repo commit. Record in `STATUS.md` phase ledger.

---

### Task 2: Debounce utility + file watcher

**Files:**
- Create: `src/server/watcher.ts`
- Test: `tests/server/watcher.test.ts`

- [ ] **Step 1: Write the failing test `tests/server/watcher.test.ts`**

```ts
import { expect, test } from "bun:test";
import { debounce } from "../../src/server/watcher";

test("debounce collapses rapid calls into one trailing call", async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 50);
  fn(); fn(); fn();
  expect(calls).toBe(0);
  await new Promise((r) => setTimeout(r, 90));
  expect(calls).toBe(1);
});

test("debounce fires again after the quiet window", async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 30);
  fn();
  await new Promise((r) => setTimeout(r, 60));
  fn();
  await new Promise((r) => setTimeout(r, 60));
  expect(calls).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server/watcher.test.ts`
Expected: FAIL — cannot find module `watcher`.

- [ ] **Step 3: Write `src/server/watcher.ts`**

```ts
import { watch, type FSWatcher } from "fs";
import { join } from "path";

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Watch each project root + its .claude dir, plus extra files (schedule/projects).
// Non-recursive; fires onChange (debounced) on any event. Returns a close fn.
export function watchProjects(
  projectDirs: string[],
  extraFiles: string[],
  onChange: () => void,
): () => void {
  const fire = debounce(onChange, 300);
  const watchers: FSWatcher[] = [];
  const targets = [
    ...projectDirs,
    ...projectDirs.map((d) => join(d, ".claude")),
    ...extraFiles,
  ];
  for (const target of targets) {
    try {
      watchers.push(watch(target, { persistent: false }, () => fire()));
    } catch {
      // missing path (e.g. no .claude dir) — skip
    }
  }
  return () => { for (const w of watchers) try { w.close(); } catch {} };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server/watcher.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: debounce util + project file watcher"
```

---

### Task 3: SSE endpoint + wire watcher to broadcast

**Files:**
- Modify: `src/server/server.ts`

- [ ] **Step 1: Add SSE client registry + broadcast at top of `makeServer`**

In `server.ts`, add imports:
```ts
import { watchProjects } from "./watcher";
import { PROJECTS_FILE, SCHEDULE_FILE } from "../paths";
```

Inside `makeServer(opts)`, before `return Bun.serve(...)`:
```ts
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const broadcast = () => {
    for (const c of clients) {
      try { c.enqueue(encoder.encode("data: change\n\n")); } catch {}
    }
  };
  // Watch registered projects + state files; refetch is client-side on event.
  readProjects(opts.projectsFile).then((projects) => {
    watchProjects(
      projects.map((p) => p.path),
      [opts.scheduleFile ?? SCHEDULE_FILE, opts.projectsFile ?? PROJECTS_FILE],
      broadcast,
    );
  });
```

- [ ] **Step 2: Add the `/api/stream` route**

In the `fetch` handler, before the static routes:
```ts
      if (url.pathname === "/api/stream") {
        let self: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            self = controller;
            clients.add(controller);
            controller.enqueue(encoder.encode(": connected\n\n"));
          },
          cancel() { clients.delete(self); },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }
```

- [ ] **Step 3: Manual verify SSE emits on file change**

Start server (Task 5 builds exe; for now dev): `bun run src/index.ts serve --port 8123` detached.
Run:
```bash
curl -N --max-time 6 http://127.0.0.1:8123/api/stream &
sleep 1; echo "- [ ] poke" >> "D:/File VS code/plugins_claude/TODO.md"; sleep 2
```
Expected: curl prints `: connected` then `data: change` after the file edit. (Clean up the TODO.md poke afterward.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: SSE stream + file-change broadcast"
```

---

### Task 4: Dashboard — live updates + multi-project view

**Files:**
- Modify: `src/server/static/index.html`, `src/server/static/app.js`, `src/server/static/style.css`

- [ ] **Step 1: Add a project selector to `index.html`**

Replace the `<h1>` line region with:
```html
  <h1>AgentBoard</h1>
  <div id="bar">
    <label>项目:
      <select id="project"><option value="">全部</option></select>
    </label>
    <span id="live">●</span>
  </div>
```

- [ ] **Step 2: Rewrite `app.js` to use EventSource + project filter + grouping**

```js
const COLS = [
  ["pending", "待办"], ["in_progress", "进行中"],
  ["blocked", "阻塞"], ["done", "完成"],
];
const sel = document.getElementById("project");

async function loadProjects() {
  const projects = await (await fetch("/api/projects")).json();
  for (const p of projects) {
    const o = document.createElement("option");
    o.value = p.path;
    o.textContent = p.path.split(/[\\/]/).pop() + (p.tool ? ` (${p.tool})` : "");
    sel.appendChild(o);
  }
}

function q() { return sel.value ? `?project=${encodeURIComponent(sel.value)}` : ""; }

async function refresh() {
  const tasks = await (await fetch("/api/tasks" + q())).json();
  const cols = document.getElementById("cols");
  cols.innerHTML = "";
  for (const [status, label] of COLS) {
    const div = document.createElement("div");
    div.className = "col";
    const items = tasks.filter((t) => t.status === status);
    div.innerHTML = `<h3>${label} (${items.length})</h3>` + items.map((t) => {
      const proj = sel.value ? "" : `<small>· ${t.project.split(/[\\/]/).pop()}</small>`;
      return `<div class="card">${t.title}<br><small>${t.source}</small> ${proj}</div>`;
    }).join("");
    cols.appendChild(div);
  }
  const scheds = await (await fetch("/api/schedules" + q())).json();
  document.getElementById("sched-list").innerHTML = scheds.map((s) =>
    `<li><b>${s.name}</b> — ${s.cron_expr}<br><small>下次: ${s.next_run ?? "无效表达式"}</small></li>`
  ).join("") || "<li><small>暂无定时任务</small></li>";
}

sel.addEventListener("change", refresh);

function connect() {
  const es = new EventSource("/api/stream");
  const live = document.getElementById("live");
  es.onopen = () => { live.style.color = "#3fb950"; };
  es.onmessage = () => refresh();
  es.onerror = () => { live.style.color = "#f85149"; };
}

(async () => { await loadProjects(); await refresh(); connect(); })();
setInterval(refresh, 30000); // fallback
```

- [ ] **Step 3: Add styles to `style.css`**

```css
#bar { display:flex; align-items:center; gap:1rem; margin-bottom:1rem; }
#bar select { background:#161b22; color:#e6edf3; border:1px solid #30363d; border-radius:6px; padding:.2rem .4rem; }
#live { font-size:.8rem; color:#6e7681; }
.card small { opacity:.5; }
```

- [ ] **Step 4: Manual verify (browser)**

Rebuild+serve (Task 5), open `http://127.0.0.1:8123`:
- project dropdown lists registered projects; selecting one filters the board + schedules.
- `●` indicator turns green when SSE connected.
- Edit a watched file (e.g. STATUS.md) → board updates within ~1s without manual reload.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dashboard live updates (SSE) + multi-project filter"
```

---

### Task 5: Rebuild, install, e2e verify

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all green (Phase 1 20 + watcher 2 = 22).

- [ ] **Step 2: Build + install**

```bash
bun build --compile --outfile agentboard.exe ./src/index.ts
cp agentboard.exe "C:/Users/FU Qianchen/.local/bin/agentboard.exe"
```

- [ ] **Step 3: E2E** — kill old server, launch exe detached (PowerShell `Start-Process -WindowStyle Hidden`), open dashboard, confirm: live indicator green, project filter works, editing a file refreshes the board live.

- [ ] **Step 4: Update STATUS.md phase ledger** (mark Phase 2 done) and commit.

---

## Self-Review

**Spec coverage:** Codex hook → Task 1 ✓. Real-time refresh (fsnotify+SSE) → Tasks 2,3,4 ✓. Multi-project view → Task 4 ✓. Live overlay → explicitly deferred ✓.

**Placeholder scan:** No TBD; all code complete. Codex-trust + first-real-Codex-session are flagged as user actions, not placeholders.

**Type consistency:** `debounce<A>`, `watchProjects(dirs, extraFiles, onChange)`, SSE `clients: Set<ReadableStreamDefaultController<Uint8Array>>`, `broadcast()` consistent across Tasks 2–3. Frontend `q()`/`refresh()`/`connect()` defined once.

## Open risks
- SSE/watch are integration-tested manually (not unit). Watcher fs.watch behavior varies by OS; debounce unit-tested, watch wiring manual.
- New projects registered while server runs aren't added to the watch set until restart (projects.json IS watched, so a register still triggers one broadcast → clients refetch all projects). Acceptable for Phase 2.
- Codex hook needs one-time user trust; cannot self-verify a real Codex session.
