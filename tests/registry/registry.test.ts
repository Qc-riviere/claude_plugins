import { expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readProjects, addProject } from "../../src/registry/registry";

test("addProject persists and dedupes by path", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "ab-reg-")), "projects.json");
  await addProject("/proj/a", "claude", file);
  await addProject("/proj/a", "codex", file); // duplicate path
  await addProject("/proj/b", "claude", file);
  const list = await readProjects(file);
  expect(list.map((p) => p.path).sort()).toEqual(["/proj/a", "/proj/b"]);
});

test("readProjects on missing file returns empty", async () => {
  expect(await readProjects(join(tmpdir(), "no-projects.json"))).toEqual([]);
});
