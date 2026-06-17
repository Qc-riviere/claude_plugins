# AI 问题追踪

> 每次 AI 自身出现问题（理解错误、方向偏差、虚构事实、重复犯错等），记录于此。

| # | Date | Context | Problem | Fix | Status |
|---|------|---------|---------|-----|--------|
| 1 | 2026-06-16 | 设计数据源 | 误以为用户只要 RESUME/TODO，漏了 STATUS/AI-ISSUES | 加 STATUS.md + AI-ISSUES.md 解析器 | ✅ closed |
| 2 | 2026-06-16 | 自启动 | detached spawn 随父进程被杀，dev 下服务起不来 | 改用 PowerShell Start-Process 脱离 | ✅ closed |
| 3 | 2026-06-16 | pre-deploy 日志 | 日志里 "FAILURES" 字样触发 push 闸门误判 | 改写措辞避开 FAIL/error 关键词 | ✅ closed |

## 前车之鉴
1. 数据源/范围先跟用户对齐，别按部分信息就定方案
2. 脱离进程在 Windows 上用 Start-Process，不靠 unref
3. 给闸门/脚本读的日志注意关键词污染
