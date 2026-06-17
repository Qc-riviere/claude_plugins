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
