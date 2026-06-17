import { watch, type FSWatcher } from "fs";
import { join } from "path";

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Watch each project root + its .claude dir, plus extra files (schedule/projects).
// Non-recursive; fires onChange (debounced) on any event. Returns a close fn.
export function watchProjects(
  projectDirs: string[],
  extraFiles: string[],
  onChange: () => void,
): () => void {
  const fire = debounce(onChange, 300);
  const watchers: FSWatcher[] = [];
  const targets = [
    ...projectDirs,
    ...projectDirs.map((d) => join(d, ".claude")),
    ...extraFiles,
  ];
  for (const target of targets) {
    try {
      watchers.push(watch(target, { persistent: false }, () => fire()));
    } catch {
      // missing path (e.g. no .claude dir) — skip
    }
  }
  return () => {
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
  };
}
