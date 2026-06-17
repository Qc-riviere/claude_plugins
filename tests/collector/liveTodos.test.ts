import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { encodeCwd, extractLastTodos, collectLiveTodos } from "../../src/collector/liveTodos";

test("encodes cwd to Claude project dir name", () => {
  expect(encodeCwd("D:\\File VS code\\plugins_claude")).toBe("D--File-VS-code-plugins-claude");
  expect(encodeCwd("D:/File VS code/plugins_claude")).toBe("D--File-VS-code-plugins-claude");
});

const JSONL = [
  JSON.stringify({ type: "x" }),
  JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
    input: { todos: [{ content: "old", status: "completed", activeForm: "o" }] } }] } }),
  JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
    input: { todos: [
      { content: "do A", status: "in_progress", activeForm: "doing A" },
      { content: "do B", status: "pending", activeForm: "doing B" },
    ] } }] } }),
].join("\n");

test("returns the LAST TodoWrite todos, mapping completed->done", () => {
  const todos = extractLastTodos(JSONL);
  expect(todos.length).toBe(2);
  expect(todos[0]).toEqual({ content: "do A", status: "in_progress" });
  expect(todos[1]).toEqual({ content: "do B", status: "pending" });
});

test("empty when no TodoWrite present", () => {
  expect(extractLastTodos('{"type":"x"}')).toEqual([]);
});

test("collectLiveTodos reads latest transcript for the project", async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-home-"));
  const tdir = join(home, "projects", "D--proj-demo");
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, "old.jsonl"),
    JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
      input: { todos: [{ content: "X", status: "pending" }] } }] } }));
  await new Promise((r) => setTimeout(r, 10));
  writeFileSync(join(tdir, "new.jsonl"),
    JSON.stringify({ message: { content: [{ type: "tool_use", name: "TodoWrite",
      input: { todos: [{ content: "Y", status: "in_progress" }] } }] } }));
  const todos = await collectLiveTodos("D:\\proj\\demo", home);
  expect(todos).toEqual([{ content: "Y", status: "in_progress" }]);
});

test("collectLiveTodos returns [] when no transcript dir", async () => {
  expect(await collectLiveTodos("D:\\nope", mkdtempSync(join(tmpdir(), "ab-h2-")))).toEqual([]);
});
