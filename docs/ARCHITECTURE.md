# 架构说明（给维护者与 AI 代理）

一句话：**DeepSeek API 接入 QQ 的非官方机器人**，零依赖、纯 ESM、Node ≥ 22；一个进程连一条 OneBot（NapCat）WebSocket，带一个本地控制台。

## 1. 运行拓扑

```
QQ 客户端 ──hook──▶ NapCat（OneBot 11）─ws://127.0.0.1:3001─▶ src/index.js（机器人进程）
                                   │                                   │
                                   └─ WebUI http://127.0.0.1:6099      ├─▶ DeepSeek API
                                                                       └─ 控制台 http://127.0.0.1:8787
```

- 机器人进程：`node src/index.js --profile=main`
- 计划任务（Windows）：`DeepSeekQQBot`（机器人）、`NapCatQQ`（NapCat+QQ）、`KoukouSupervisor`（看护/重启）、`BotHeartbeat`（心跳/告警）
- 端口：OneBot WS `3001`、控制台 `8787`、NapCat WebUI `6099`
- 重启脚本：`bot-restart.ps1 -BotPid <pid> -BotProfile main -TaskName DeepSeekQQBot`（校验进程身份→结束→按计划任务拉起）

## 2. 目录与数据边界

**进 Git**：`src/`、`scripts/`、`docs/`、`integrations/`、根目录启动脚本、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`.env.example`、`persona.txt`（通用模板）、`poke-replies.txt`（通用示例）。

**不进 Git（实例私有，`data/`、`logs/` 被忽略）**：

| 路径 | 内容 |
| --- | --- |
| `data/persona.txt` | 实例默认人格（优先于仓库模板） |
| `data/personas/*.txt` | 控制台导入的人格库 |
| `data/speech-habits.txt` | 「语言习惯」页编辑的表达偏好（≤4000 字） |
| `data/poke-replies.txt` | 拍一拍语料（一行一条，`{name}` 替换昵称，`#` 注释） |
| `data/memory.json` | 近期记忆（每会话最近 N 条，默认 20） |
| `data/long-memory.json` + `.records/` + `.state.json` | 长期记忆摘要 + 原文档案 + 分区世代 |
| `data/usage.json` | 每日 token/费用账本（本地估算） |
| `data/chat-settings.json` | 会话级覆盖（静音、概率、人格、备注…） |
| `data/custom-commands.json`、`data/command-center.json` | 自定义指令与指令中心状态 |
| `data/daily/*.jsonl` | 群日报原始记录 |
| `data/config-backups/` | 人格切换/清记忆前的快照 |
| `.env`、`windows.local.json` | 部署参数与凭据 |

## 3. 一条消息的链路

1. `onebot.js` 收到事件 → `bot.js#handleMessage` 判定是否该回（@、私聊、白名单概率、静音、安静时段、频率限制、时效）。
2. `memory.js` 记录消息；超出窗口的旧消息经 `onEvict` 交给 `longMemory.addEvicted()`。
3. 组装提示词（见第 4 节），`planReply()` 决定本次形态（行数/字数预算）。
4. `deepseek.js#DeepSeekClient.chat()` 请求模型；失败按退避重试。
5. `replyShape.js#shapeReply()` 把正文裁成 1..N 行；`bot.js` 逐行分条发送（行间 500~1600ms 补句间隔），附带打字延迟与装饰符号决策。

**长期记忆**：`longMemory` 攒够 `LONG_MEMORY_MAX_BATCH` 条（默认 120）或每 `LONG_MEMORY_INTERVAL_MS`（默认 2h）整理一次；整理结果超过 `LONG_MEMORY_MAX_CHARS`（默认 2000）时先做一次"压缩"调用，仍超则按行截断——**永远不整批回滚重试**（旧版本的死循环曾一天烧掉 ¥2.5）。

## 4. 提示词装配顺序（`chatPrompt.js` + `bot.js`）

```
人格(persona) → 语言习惯(speech-habits) → 长期记忆 → 今日已办(todayNote)
→ 系统附加说明(chatAppendix) → 对话衔接规则(conversationRules)
→ 【形态要求】(shapeHint) → 【装饰】(decorationHint)
```

- 人格与语言习惯来自实例数据；附加说明、衔接规则、形态提示来自代码。
- **长度只由 shapeHint 控制，装饰只由 decorationHint 控制**，其他文件里不要再写一遍（写两遍会互相打架）。
- `conversationRules` 里有安全条款（不把他人经历算到发言者头上、对方拒绝要当真、不擅自改药量等），**措辞被测试逐句锁定**，改字前先看 `test-message-context.mjs` / `test-message-freshness.mjs`。

## 5. 模块地图（`src/`）

| 模块 | 职责 |
| --- | --- |
| `index.js` | 组装所有依赖、启动 WS、启动控制台、注册信号处理 |
| `bot.js` | 主事件循环：回不回、怎么回、分条发送、拍一拍、指令执行 |
| `onebot.js` | OneBot 11 WS 客户端（收事件、调 API、连接重试、在线核验） |
| `config.js` | 解析 `.env`/环境变量，导出全部配置（含实例隔离路径） |
| `deepseek.js` | 模型客户端：并发队列、重试、超时、思考开关、token 记账 |
| `chatPrompt.js` / `persona.js` / `chatAppendix.js` / `conversationRules.js` / `speechHabits.js` | 提示词分层 |
| `replyShape.js` | 长度匹配、分行、裁剪、形态提示、判断型提问的"依据+结论" |
| `humanize.js` | 装饰符号、打字延迟、限流、安静时段 |
| `memory.js` / `longMemory.js` / `memoryArchive.js` | 近期记忆、长期摘要、原文检索 |
| `personaSwitch.js` / `conversationSessions.js` / `chatSettings.js` | 人格切换与会话级覆盖 |
| `dailySummary.js` + `summary*.js`（约 10 个） | 每日群聊报告：采集、统计、生成、校验、发送、补发 |
| `dailyPing.js` / `customCommands.js` / `customCommandSchedule.js` | 定时指令与自定义规则 |
| `commandCenter.js` + `admin/commandCenter.js` | 指令中心（内置指令开关、AI 回复、草稿生成） |
| `targetWatch.js` | 盯人：目标群友发言时主动接话 |
| `autoPlusOne.js` | 群内连续相同文字时原生 +1 |
| `idCheck.js` | 群名片核对/提醒/移出 |
| `visionKnowledge.js` / `visionNote.js` / `imageCache.js` | 识图、角色对照、图片缓存 |
| `napcatLogin.js` | 控制台「QQ 登录」页：读状态、二维码、快速登录 |
| `usageMeter.js` | 按模型计价，落盘 `data/usage.json` |
| `admin/server.js` + `admin/ui.html` | 本地控制台（HTTP + 单页界面） |

## 6. 控制台

- 后端：`GET /api/state`、`/api/chats`、`/api/groups`；**所有动作**走 `POST /api/action/<name>`（如 `set-config`、`save-speech-habits`、`login-status`、`restart-napcat`）。
- 前端：单文件 `admin/ui.html`，`api(path, body)` **必须 POST**（`/api/action/*` 未传 body 时也要发 `{}`，否则 404）。
- 页面：工作台、会话管理、指令中心、人格编辑、语言习惯、QQ 登录、回复行为、模型与接口、群聊报告、记忆浏览、运行日志、数据与记忆。
- 控制台只监听 `127.0.0.1`；NapCat WebUI 的 token 不会返回给前端。

## 7. 关键配置组（`.env`，全量见 `.env.example`）

| 组 | 键 |
| --- | --- |
| 模型 | `DEEPSEEK_MODEL`、`DEEPSEEK_API_KEY`、`MAX_TOKENS`、`TEMPERATURE`、`TIMEOUT_MS`、`MAX_RETRIES`、`MAX_CONCURRENCY` |
| 回复 | `REPLY_LENGTH_MATCH`、`REPLY_MAX_LINES`、`REPLY_LINE_MAX_CHARS`、`EMOJI_KEEP_RATE`、`LINE_GAP_*` |
| 直接对话 | `THINK_DELAY_MIN_MS`、`THINK_DELAY_MAX_MS`（被@/私聊先想一想）、`UNDERSTAND_ENABLED`、`UNDERSTAND_MIN_CHARS`（回答前的"理解一下"小调用） |
| 节奏/限流 | `PROACTIVE_RATE(_PER_GROUP)`、`PROACTIVE_COOLDOWN_MS`、`RATE_LIMIT_*`、`QUIET_HOURS` |
| 记忆 | `HISTORY_LIMIT`、`LONG_MEMORY_ENABLED`、`LONG_MEMORY_MAX_CHARS`、`LONG_MEMORY_INTERVAL_MS`、`LONG_MEMORY_MAX_BATCH`、`LONG_MEMORY_MAX_TOKENS` |
| 日报 | `SUMMARY_ENABLED`、`SUMMARY_TIMES`、`SUMMARY_FALLBACK_ENABLED`、`SUMMARY_MODEL`、`SUMMARY_MAX_TOKENS`、`SUMMARY_MAX_MESSAGES`、`SUMMARY_SEND_MODE` |
| 识图 | `VISION_PROVIDER`、`VISION_MODEL`、`DASHSCOPE_*`、`VISION_MAX_IMAGES` |
| 控制台/实例 | `ADMIN_ENABLED`、`ADMIN_PORT`、`ADMIN_USERS`、`BOT_PROFILE`、`NAPCAT_DIR`、`NAPCAT_TASK_NAME` |

## 8. 成本结构（实测）

- 主要成本来自**长期记忆整理**（每会话重写整段摘要）和**每次聊天注入摘要**，不是聊天输出本身。
- DeepSeek v4 系模型默认生成推理 token：一句"1+1"completion 42 个、其中 35 个是推理。记忆整理已改为 `thinking:{type:'disabled'}`，实测同一请求 completion 1186 → 81。
- 记账在 `data/usage.json`（本地估算价，真实账单以平台为准）；查看：控制台工作台或直接读文件。
