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

// Normalize separators so the same dir registered as C:\x and C:/x dedupes.
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

export async function addProject(
  path: string,
  tool: string | undefined,
  file: string = PROJECTS_FILE,
): Promise<void> {
  path = normPath(path);
  const list = await readProjects(file);
  const existing = list.find((p) => normPath(p.path) === path);
  if (existing) {
    existing.tool = tool ?? existing.tool;
  } else {
    list.push({ path, tool, addedAt: new Date().toISOString() });
  }
  mkdirSync(dirname(file), { recursive: true });
  await Bun.write(file, JSON.stringify(list, null, 2));
}
