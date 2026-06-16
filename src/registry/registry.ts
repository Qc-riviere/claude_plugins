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
