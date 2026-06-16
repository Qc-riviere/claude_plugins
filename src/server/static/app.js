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
