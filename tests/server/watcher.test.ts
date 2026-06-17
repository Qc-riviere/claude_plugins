import { expect, test } from "bun:test";
import { debounce } from "../../src/server/watcher";

test("debounce collapses rapid calls into one trailing call", async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 50);
  fn(); fn(); fn();
  expect(calls).toBe(0);
  await new Promise((r) => setTimeout(r, 90));
  expect(calls).toBe(1);
});

test("debounce fires again after the quiet window", async () => {
  let calls = 0;
  const fn = debounce(() => { calls++; }, 30);
  fn();
  await new Promise((r) => setTimeout(r, 60));
  fn();
  await new Promise((r) => setTimeout(r, 60));
  expect(calls).toBe(2);
});
