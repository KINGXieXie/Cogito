# 交给其它 AI 代理（GPT / Codex）的交接说明

这份文件有两个用途：

1. 给人类维护者看：把项目交给别的代理时，让它先读什么、能改什么、不能改什么；
2. 直接复制第 2 节整段作为 **system / project prompt**，粘进 ChatGPT、Codex CLI 或其它编码代理，它就能按本项目规矩干活。

## 1. 交接包怎么给

推荐做法（按顺序）：

1. 把仓库（`git clone` 或本仓库 zip）交给对方，确保包含 `src/`、`scripts/`、`docs/`、`AGENTS.md`、`README.md`、`CHANGELOG.md`、`.env.example`；
2. **不要**附带 `data/`、`logs/`、`.env`（里面有聊天记录、记忆、API Key、QQ 登录态）；
3. 让对方先读：`AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/MAINTAINER.md` → 本文；
4. 需要它复现部署时，把 `.env.example` 和 `docs/WINDOWS-SETUP.md` 一起给，密钥单独通过安全渠道传。

## 2. 可直接粘贴的代理提示词

```text
你是这个 QQ 机器人项目的维护者。项目路径：<仓库根目录>。

【项目是什么】
零依赖 Node ESM 项目（Node ≥ 22），DeepSeek API 接入 QQ（OneBot 11 / NapCat），
入口 src/index.js --profile=main；本地控制台在 src/admin（http 127.0.0.1:8787）。

【先读这些再动手】
AGENTS.md、docs/ARCHITECTURE.md（结构、数据边界、提示词顺序、模块地图）、
docs/MAINTAINER.md（发布流程、常见任务配方、已知坑）、CHANGELOG.md。

【硬性规矩】
1. data/、logs/、.env 是实例私有，不入库、不改样例、不写进 CHANGELOG。
2. 一次完整交付 = 改代码 → 跑测试 → 递增版本 → 写 CHANGELOG → 提交 → 打 tag → 推送 → 重启。
   用户明确说只调查/先别提交时除外。
3. 测试入口是 node scripts/test-offline.mjs（allowlist 在 scripts/test-offline.mjs）；
   新测试必须登记进去；测试只能用假 fetch/临时目录，禁止连真实模型或发 QQ 消息。
   提交前还要跑 node scripts/check-repository.mjs。
4. 提示词是产品：conversationRules 的安全条款、chatAppendix 的条款被测试精确断言，
   改措辞前先 grep scripts/；长度/装饰只在 shapeHint 与 decorationHint 里说一次。
5. 控制台的 api(path, body) 对所有 /api/action/* 一律 POST；新增动作要同时改
   src/admin/server.js 的 actions 和 src/admin/ui.html。
6. 文件编码 UTF-8 无 BOM；Windows 上用 PowerShell 写文件时显式用 UTF8Encoding(false)。
7. 需要重启才生效的：src/ 代码、.env。不需要重启的：控制台保存人格库、语言习惯、拍一拍语料以外的运行数据。

【成本红线】
DeepSeek v4 系默认生成推理 token。给 DeepSeek 关思考必须发 thinking:{type:'disabled'}
（enable_thinking 只对通义千问有效，对 DeepSeek 会被忽略）。
长期记忆整理禁止"超预算就整批回滚重试"——必须是先压缩、再按行截断，保证队列前进。
改模型相关逻辑后，用 data/usage.json 的每日 token 与费用验证不升反降。

【常用命令】
node scripts/test-offline.mjs
node scripts/check-repository.mjs
$lock = Get-Content .\data\bot.lock -Raw | ConvertFrom-Json
.\bot-restart.ps1 -BotPid $lock.pid -BotProfile main -TaskName DeepSeekQQBot

【改动前先问用户的场景】
- 会删/清实例数据（记忆、人格、日报文件）
- 会改计划任务、注册表、系统设置
- 会换模型厂商或提高调用频率
- 会改动安全条款的措辞

【交付时输出什么】
改了什么文件、为什么、测试结果（脚本数/是否全绿）、版本号与 tag、是否需要重启、
以及回滚方式（备份文件路径或 git 命令）。
```

## 3. 代理最容易做错的五件事

| 错误 | 后果 | 正确做法 |
| --- | --- | --- |
| 改了 `src/conversationRules.js` 的措辞 | 两个测试精确匹配句子，直接红 | 先看 `test-message-context.mjs` / `test-message-freshness.mjs`，同步改测试或保持原句 |
| 在控制台新页面用 `api('/api/action/x')` 不带 body | 请求变 GET，整页 404 | 传 `{}`，或确认 `api()` 已按 `/api/action/` 强制 POST |
| 给 DeepSeek 发 `enable_thinking:false` | 被忽略，推理 token 照烧，费用翻几倍 | 发 `thinking:{type:'disabled'}` |
| 把 `data/` 里的文件当源码提交 | 泄露聊天记录/记忆，或仓库脏 | 只提交 `src/`、`scripts/`、`docs/`、根目录脚本与文档 |
| 只改代码不重启就宣布完成 | 线上仍是旧逻辑 | 用 `bot-restart.ps1` 重启，并确认日志出现"机器人就绪" |

## 4. 验收清单（交给对方后自检）

- [ ] 能说清"一条消息从 OneBot 进来到发出"经过哪些模块
- [ ] 能指出提示词的装配顺序（人格→语言习惯→记忆→附加说明→规则→形态→装饰）
- [ ] 知道 `data/` 不进 Git，且知道 `usage.json` 是成本账本
- [ ] 能独立跑通 `test-offline.mjs` 与 `check-repository.mjs`
- [ ] 改完一次小需求后，能走完"测试→版本→CHANGELOG→tag→推送→重启"
