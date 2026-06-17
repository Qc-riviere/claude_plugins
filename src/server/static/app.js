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
      const key = t.source.replace(/\.md$/, "").replace(/[^a-z]/gi, "").toLowerCase();
      return `<div class="card tag-${key}"><span class="tag tag-${key}">${t.source}</span> ${t.title} ${proj}</div>`;
    }).join("");
    cols.appendChild(div);
  }
  const scheds = await (await fetch("/api/schedules" + q())).json();
  document.getElementById("sched-list").innerHTML = scheds.map((s) => {
    if (!s.next_run)
      return `<li><b>${s.name}</b> — <code>${s.cron_expr}</code><br><small>无效表达式</small></li>`;
    const when = new Date(s.next_run).toLocaleString();
    return `<li><b>${s.name}</b> — <code>${s.cron_expr}</code>` +
      `<br><span class="countdown" data-next="${s.next_run}">…</span>` +
      `<small> · 下次 ${when}</small></li>`;
  }).join("") || "<li><small>暂无定时任务</small></li>";
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
