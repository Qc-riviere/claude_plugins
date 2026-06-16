export type Status = "pending" | "in_progress" | "blocked" | "done";

export interface Task {
  id: string;
  title: string;
  status: Status;
  source: string;
  project: string;
}

export function statusFromEmoji(cell: string): Status {
  if (cell.includes("✅")) return "done";
  if (cell.includes("🔄")) return "in_progress";
  if (cell.includes("⏸")) return "blocked";
  return "pending"; // ⬜ or anything else
}
