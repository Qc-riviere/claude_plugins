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
        const all = await readSchedules(opts.scheduleFile ?? "");
        const filtered = project ? all.filter((s) => s.project === project) : all;
        return json(filtered.map((s) => ({ ...s, next_run: computeNextRun(s.cron_expr) })));
      }
      return new Response("not found", { status: 404 });
    },
  });
}
