import { collectTasks } from "../collector/collect";
import { collectAgentTasks } from "../collector/agentTasks";
import { collectLiveTodos } from "../collector/liveTodos";
import { readProjects } from "../registry/registry";
import { readSchedules } from "../schedule/store";
import { computeNextRun } from "../schedule/nextRun";
import { watchProjects } from "./watcher";
import { encodeCwd } from "../collector/liveTodos";
import { PROJECTS_FILE, SCHEDULE_FILE } from "../paths";
import { homedir } from "os";
import { join } from "path";
import indexHtml from "./static/index.html" with { type: "text" };
import appJs from "./static/app.js" with { type: "text" };
import styleCss from "./static/style.css" with { type: "text" };

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
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const broadcast = () => {
    for (const c of clients) {
      try { c.enqueue(encoder.encode("data: change\n\n")); } catch {}
    }
  };
  // Watch registered projects + state files; clients refetch on event.
  // Also recursively watch the Claude tasks dir (~/.claude/tasks) and each
  // project's transcript dir so the Task system + live session todos refresh live.
  readProjects(opts.projectsFile).then((projects) => {
    const claudeHome = join(homedir(), ".claude");
    const transcriptDirs = projects.map((p) => join(claudeHome, "projects", encodeCwd(p.path)));
    watchProjects(
      projects.map((p) => p.path),
      [opts.scheduleFile ?? SCHEDULE_FILE, opts.projectsFile ?? PROJECTS_FILE],
      broadcast,
      [join(claudeHome, "tasks"), ...transcriptDirs],
    );
  });

  return Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const project = url.searchParams.get("project") ?? undefined;

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

      if (url.pathname === "/api/refresh") {
        // explicit poke (e.g. from `register` on session start) so open boards
        // re-scan immediately without relying on flaky file watching.
        broadcast();
        return json({ ok: true });
      }
      if (url.pathname === "/api/projects") {
        return json(await readProjects(opts.projectsFile));
      }
      if (url.pathname === "/api/tasks") {
        const projects = project
          ? [project]
          : (await readProjects(opts.projectsFile)).map((p) => p.path);
        const fileTasks = (await Promise.all(projects.map((p) => collectTasks(p)))).flat();
        const agentTasks = (await Promise.all(projects.map((p) => collectAgentTasks(p)))).flat();
        return json([...fileTasks, ...agentTasks]);
      }
      if (url.pathname === "/api/schedules") {
        const all = await readSchedules(opts.scheduleFile ?? "");
        const filtered = project ? all.filter((s) => s.project === project) : all;
        return json(filtered.map((s) => ({ ...s, next_run: computeNextRun(s.cron_expr) })));
      }
      if (url.pathname === "/api/live") {
        const projects = project
          ? [project]
          : (await readProjects(opts.projectsFile)).map((p) => p.path);
        const all = (await Promise.all(projects.map((p) => collectLiveTodos(p)))).flat();
        return json(all);
      }
      if (url.pathname === "/" || url.pathname === "/index.html")
        return new Response(indexHtml, { headers: { "content-type": "text/html" } });
      if (url.pathname === "/app.js")
        return new Response(appJs, { headers: { "content-type": "text/javascript" } });
      if (url.pathname === "/style.css")
        return new Response(styleCss, { headers: { "content-type": "text/css" } });
      return new Response("not found", { status: 404 });
    },
  });
}
