# AgentBoard 设计文档

- 日期：2026-06-16
- 工作名：AgentBoard（可改）
- 状态：设计已批准，待 spec 复核 → 转 writing-plans

## Context（为什么做）

用户想在终端 Claude Code 里"可视化定时任务 + todo list"。调研发现现成方案割裂且无法内嵌：

- `claude-tasks`（Go TUI）：定时任务可视化，但是**独立全屏 TUI**，必须另开终端窗口。
- `claude-todo`（CC 插件）：持久 todo，但只能 `/todo` **按需打印**，非常驻看板。
- Claude Code 的 statusline **只能有一个**，已被 `claude-hud` 占用，且 claude-hud 只显示**原生会话 todo**（临时），不显示持久/项目级 todo，也没有 cron。

结论：真正的空白是"**一个跨工具、持久、常驻**的 todo + 定时任务可视化"。决定不自建插件、也不抢 statusline，而是做一个**伴随 Claude Code / Codex 启动的本地 Web 看板 exe**——类似 Clawd on Desk 的伴随模式（hooks 驱动 + 本地服务），但聚焦 todo/定时任务可视化。

预期产出：任一工具开 session，看板自动起，浏览器里能看到当前项目（及已注册项目）的 todo 进度与定时任务下次运行时间。

## 已锁定决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 形态 | 本地 Web 看板单文件 exe | 跨平台、跨工具、轻；后续可桌面化 |
| todo 数据源 | **项目文件为主**（RESUME.md / TODO.md / STATUS.md） | 工具中立 → 一个解析器同时支持 Claude+Codex；持久、项目级 |
| cron 范围 | **只可视化，app 不执行** | 避免重写半个 claude-tasks；执行交给 claude-tasks/系统 |
| 技术栈 | **Bun（TypeScript）** | 已装（1.3.14）；`bun build --compile` 出单文件 exe、内置 `Bun.serve`、TS 原生；Go 未装且无 winget 难装 |
| 跨工具 | Claude Code + Codex | 两者均支持 hooks（Codex `config.toml` 已 `hooks=true`） |

## 架构

单文件 exe `agentboard`（Bun 编译的 TypeScript），四个独立、可单测的模块。

### ① Collector（文件扫描器）
输入项目根目录，输出统一 todo 模型。

- 数据源：
  - `.claude/RESUME.md` —— 用户 CLAUDE.md Rule 16 的任务进度表（markdown 表 `| Task | Status | Commit |`，状态用 ⬜/🔄/⏸️/✅）
  - `TODO.md` —— 复选框/列表
  - `STATUS.md` —— project-bootstrap 总控台：Phase 账本 + Open items（已实现，见 status.ts）
  - `AI-ISSUES.md` —— project-bootstrap 问题表（已实现，见 aiIssues.ts）
  - ⚠️ 冲突：`⏸` 在 RESUME.md=阻塞、在 STATUS.md=实现完成待门禁(≈进行中)，故两者用各自的状态映射，不共用 statusFromEmoji
- 统一模型：
  ```
  Task { ID string; Title string; Status Status; Source string; Project string }
  Status ∈ { pending(⬜), in_progress(🔄), blocked(⏸️), done(✅) }
  ```
- 三个隔离的小解析器，各自独立测试：
  - `parseResumeTable(md) -> []Task`（markdown 表格）
  - `parseTodoChecklist(md) -> []Task`（`- [ ]` / `- [x]`）
  - `parseStatusSections(md) -> []Task`（Phase 2）
- 容错：文件缺失返回空，不报错；格式不符的行跳过。

### ② Schedule store
- `schedule.json`（app 自管），位置：全局 `~/.agentboard/schedule.json`（条目带 `project` 字段区分）
- 条目：`{ name, cron_expr, command, last_run?, enabled }`
- 用 cron 解析库（npm `cron-parser`）计算 `next_run`
- **只读可视化，app 不调度、不执行**

### ③ Server + 看板
- `Bun.serve`，绑 `127.0.0.1:<port>`，默认 `:8123`（可 `--port` 或配置覆盖）
- API：
  - `GET /api/projects` → 已注册项目列表
  - `GET /api/tasks?project=<path>` → 该项目统一 todo（省略 project 则全部）
  - `GET /api/schedules?project=<path>` → 定时任务 + 计算后的 next_run
- 看板（静态 HTML/JS，`bun build --compile` 时作为 asset 嵌入二进制）：
  - 左：**Todo 板**，按状态分列（待办/进行中/阻塞/完成），按项目分组
  - 右：**定时任务列表**，显示 name / cron / 下次运行倒计时 / enabled
  - 刷新：前端每 3~5s 轮询 API（Phase 1 最简）；Phase 2 换 fsnotify + SSE
- 数据获取：每次 API 请求即时重扫文件（成本低，先求简单）

### ④ 项目注册 + 自启动
- 子命令 `agentboard register <path> [--tool claude|codex]`：
  1. 把项目路径写进 `~/.agentboard/projects.json`（去重）
  2. 检查服务是否在跑（探测端口/pid 文件），没跑则 detached 拉起 `agentboard serve`
- 其他子命令：`agentboard serve`（前台跑服务）、`agentboard version`
- 自启动 hook：
  - Claude Code：`~/.claude/settings.json` 的 `SessionStart` 追加一条 hook 调 `agentboard register "$CLAUDE_PROJECT_DIR"`（注意：用户已有多条 SessionStart hook，**追加不覆盖**）
  - Codex：`~/.codex/config.toml` 的 hooks 段加 session 启动钩子调同一命令
- 服务首次启动可选自动开浏览器（`--open`）

## 分阶段（YAGNI）

**Phase 1（MVP）**
- Bun/TS 骨架 + 子命令（serve / register / version）
- Collector：RESUME.md 表格 + TODO.md 复选框两个解析器
- Schedule store：读 `schedule.json` + 算 next_run
- Web 看板：Todo 板 + 定时任务列表两面板，轮询刷新，资源 embed 进二进制
- 项目注册（projects.json）+ 端口探测自启动
- Claude SessionStart 自启动 hook（追加式）

**Phase 2（已完成）**
- Codex hook 接入 ✅
- STATUS.md / AI-ISSUES.md 解析 ✅、多项目聚合视图 ✅
- fsnotify + SSE 实时刷新 ✅

**Phase 3（已完成）**
- 会话内实时 todo 叠加：读 Claude transcript 最后一次 TodoWrite，"当前会话执行中"细条 ✅
- Codex 侧不可行（rollout 不绑项目、无 update_plan 数据），已记录排除

## 明确不做
- cron 执行引擎（只可视化）
- 桌面原生窗口（先 Web）
- 云端 / 账号体系 / 多用户
- 回写 todo 文件（看板**只读**）

## 构建 / 落地
- `bun build --compile --outfile agentboard.exe ./src/index.ts` → 单文件 exe，拷到 `~/.local/bin/agentboard.exe`（与 claude-tasks 同目录）
- 开发期直接 `bun run src/index.ts serve`，免编译
- 源码放当前目录 `D:\File VS code\plugins_claude`
- 前置：Bun 1.3.14 已装 ✓

## 验证（end-to-end）
1. 单测：三个解析器对样例 markdown 产出正确 Task 列表；cron 表达式算出正确 next_run。
2. 起服务：`agentboard serve --port 8123`，浏览器开 `127.0.0.1:8123` 看到看板。
3. 造数据：在一个测试项目放 `.claude/RESUME.md`（含任务表）和 `TODO.md`，刷新看板能正确显示分列。
4. 定时任务：往 `schedule.json` 加一条每分钟的任务，看板显示正确的下次运行倒计时。
5. 自启动：配好 Claude SessionStart hook 后，新开一个 Claude session，确认服务被拉起且当前项目被注册（出现在 `/api/projects`）。

## 开放项 / 风险
- ✅ 运行时：Bun 1.3.14 已装。
- ⏸️ 端口 8123 是否冲突 —— 提供 `--port`，并在 register 时探测。
- ⏸️ 是否要 git init 做版本管理 —— 待用户决定。
- Codex hooks 的事件名/参数格式需在 Phase 2 实测确认（先不阻塞 Phase 1）。
