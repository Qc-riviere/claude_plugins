import type { Schedule } from "./types";

export async function readSchedules(path: string): Promise<Schedule[]> {
  const f = Bun.file(path);
  if (!(await f.exists())) return [];
  try {
    const data = JSON.parse(await f.text());
    return Array.isArray(data) ? (data as Schedule[]) : [];
  } catch {
    return [];
  }
}
