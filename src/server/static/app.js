const COLS = [
  ["pending", "待办"], ["in_progress", "进行中"],
  ["blocked", "阻塞"], ["done", "完成"],
];
const sel = document.getElementById("project");

// Inline lucide SVG inner paths, keyed by source (avoids a React/lucide dep).
const ICONS = {
  task: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  resume: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  todo: '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="m9 11 3 3L22 4"/>',
  status: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  aiissues: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  schedule: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
};
function svgIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ico">${ICONS[key] || ICONS.todo}</svg>`;
}

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
      const key = t.source.replace(/\.md$/, "").replace(/[^a-z]/gi, "").toLowerCase();
      const meta = sel.value ? "" : t.project.split(/[\\/]/).pop();
      return `<div class="card tag-${key}">
        <div class="card-top">
          <span class="card-icon">${svgIcon(key)}</span>
          <span class="tag tag-${key}">${t.source}</span>
        </div>
        <div class="card-title">${t.title}</div>
        ${meta ? `<div class="card-meta">· ${meta}</div>` : ""}
      </div>`;
    }).join("");
    cols.appendChild(div);
  }
  const scheds = await (await fetch("/api/schedules" + q())).json();
  document.getElementById("sched-list").innerHTML = scheds.map((s) => {
    const head = `<div class="card-top"><span class="card-icon">${svgIcon("schedule")}</span><code class="cron">${s.cron_expr}</code></div><div class="sched-name">${s.name}</div>`;
    if (!s.next_run)
      return `<li class="card sched-card">${head}<div class="countdown due">无效表达式</div></li>`;
    const when = new Date(s.next_run).toLocaleString();
    return `<li class="card sched-card">${head}<div class="countdown" data-next="${s.next_run}">…</div><div class="card-meta">下次 ${when}</div></li>`;
  }).join("") || '<li class="sched-empty"><small>暂无定时任务</small></li>';
  tickCountdowns();

  const live = await (await fetch("/api/live" + q())).json();
  const ll = document.getElementById("live-list");
  ll.innerHTML = live.length
    ? live.map((t) => `<span class="live-item ${t.status}">${t.content}</span>`).join("")
    : '<small>无活跃会话 todo</small>';
}

function fmtRemaining(ms) {
  if (ms <= 0) return "运行中…";
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}天 ${hms}` : hms;
}

let countdownRefreshAt = 0;
function tickCountdowns() {
  const now = Date.now();
  let expired = false;
  for (const el of document.querySelectorAll(".countdown")) {
    const rem = new Date(el.dataset.next).getTime() - now;
    el.textContent = "⏳ " + fmtRemaining(rem);
    el.classList.toggle("due", rem <= 0);
    if (rem <= 0) expired = true;
  }
  // a timer elapsed → recompute next_run server-side (throttled to 5s)
  if (expired && now - countdownRefreshAt > 5000) {
    countdownRefreshAt = now;
    refresh();
  }
}
setInterval(tickCountdowns, 1000);

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
