import { expect, test } from "bun:test";
import { parseTodoChecklist } from "../../src/collector/todo";

const SAMPLE = `# TODO
- [ ] 第一件事
- [x] 已完成的事
- [X] 大写也算完成
- 普通列表项不算
* [ ] 星号复选框
`;

test("parses checkbox items, mapping x->done and space->pending", () => {
  const tasks = parseTodoChecklist(SAMPLE, "/proj");
  expect(tasks.length).toBe(4);
  expect(tasks[0]).toEqual({
    id: "todo:0", title: "第一件事", status: "pending",
    source: "TODO.md", project: "/proj",
  });
  expect(tasks[1].status).toBe("done");
  expect(tasks[2].status).toBe("done");
  expect(tasks[3].title).toBe("星号复选框");
});
