# 维护手册（人 + AI 代理都从这里开始）

> 目标：让任何维护者（包括 GPT / Codex 这类编码代理）在不动生产数据的前提下，安全地改代码、跑测试、发版本。
> 先读 `docs/ARCHITECTURE.md` 了解结构，再读本文做事。

## 0. 三条底线

1. **`data/`、`logs/`、`.env` 是实例私有数据**：不进 Git、不当示例、不写进 CHANGELOG；改动它们不影响仓库版本。
2. **提示词是产品**：`conversationRules`、`chatAppendix`、`persona` 的措辞被测试或行为依赖，改字前先 `grep` 测试，改后必须跑全量离线测试。
3. **一次完整交付 = 改代码 → 测试 → 版本号 → CHANGELOG → 提交 + 标签 → 推送 → 重启生效**。只调查或用户说"先别提交"时除外。

## 1. 快速上手（本机）

```powershell
cd <仓库根目录>
F:\node.exe scripts\test-offline.mjs      # 等价 npm test：受控离线测试，不连 QQ、不调付费模型
F:\node.exe scripts\check-repository.mjs  # 凭据/私有文件扫描，提交前必跑
```

- 运行入口：`node src/index.js --profile=main`（生产由计划任务 `DeepSeekQQBot` 拉起）
- 重启（会短暂离线，由计划任务重新启动）：

```powershell
$lock = Get-Content .\data\bot.lock -Raw | ConvertFrom-Json
.\bot-restart.ps1 -BotPid $lock.pid -BotProfile main -TaskName DeepSeekQQBot
```

- 控制台：`http://127.0.0.1:8787`（页面有工作台、人格、语言习惯、QQ 登录、回复行为、记忆等）
- 日志：`logs/bot.log`（主要）、`logs/restart.log`、`logs/supervisor.log`、`logs/heartbeat.log`、`logs/alerts.log`

## 2. 发布流程（照做即可）

1. **改代码**：保持零依赖、ESM、Node ≥ 22；新模块放 `src/`，新测试放 `scripts/test-*.mjs`。
2. **加测试**：新测试必须登记到 `scripts/test-offline.mjs` 的 allowlist（否则不算进 `npm test`）。测试只许用假 fetch、临时目录，禁止连真实模型或发 QQ 消息。
3. **跑测试**：`node scripts/test-offline.mjs`，必须全绿；`node scripts/check-repository.mjs` 必须通过。
4. **改版本**：`package.json` 语义化版本——修复→patch，兼容新增→minor，不兼容→major。
5. **写 CHANGELOG**：`## <version> — YYYY-MM-DD`，中文，写清行为变化、修复、限制；不写个人路径、真实聊天样例、凭据。
6. **提交与标签**：

```powershell
git add -A
git commit -m "fix: ..."        # 或 feat: / perf: / docs: / chore:
git tag -a v<version> -m "<version> <一句话>"
git push origin main
git push origin v<version>
```

7. **重启生效**：代码和 `.env` 改动必须重启机器人；`data/` 下的人格/语言习惯/语料生成时或控制台保存后生效。

## 3. 常见任务配方

| 想做什么 | 改哪里 | 注意 |
| --- | --- | --- |
| 调她的口气/口头禅 | 控制台「语言习惯」（写 `data/speech-habits.txt`） | 只影响表达，不改身份；保存即生效、不用重启 |
| 改身份/关系/世界观 | 控制台「人格编辑」或 `data/persona.txt` | 人格切换会备份并重置记忆，慎重；改前先备份 |
| 改"多长、分几条" | `src/replyShape.js` + `.env`(`REPLY_*`) | `test-reply-analysis.mjs` 覆盖长度/分行/判断型提问 |
| 改系统附加规则 | `src/chatAppendix.js` | `test-chat-appendix.mjs` 有条款断言；长度/装饰不要在这里重复写 |
| 改安全/衔接规则 | `src/conversationRules.js` | **两句措辞被 `test-message-context.mjs`、`test-message-freshness.mjs` 精确匹配**，改字先改测试 |
| 加一个 `.env` 配置 | `src/config.js`（解析+校验）+ `.env.example` + 本文件 | 给出安全默认值；范围用 `Math.min/max` 夹紧 |
| 加控制台动作 | `src/admin/server.js` 的 `actions` + `src/admin/ui.html` | 前端 `api('/api/action/名字', {})` 必须带 body；动作只收 POST |
| 加控制台页面 | `ui.html` 的 `PAGES`、`pageXxx()`、`render()`、`bind()` | 页面里的定时器要在 `bind()` 开头清掉，避免叠加 |
| 换模型/换厂商 | `.env`(`DEEPSEEK_MODEL`/`SUMMARY_MODEL`/`VISION_*`) + `usageMeter.js` 价格表 | 非千问模型不要发 `enable_thinking`（见坑 1） |
| 加内置指令 | `src/commandCenter.js`、`bot.js` 的指令分支、`docs/COMMANDS.md` | 管理员门槛与群范围先于执行 |
| 加自定义规则能力 | `src/customCommands.js`、`customCommandSchedule.js` | 固定/随机规则不调模型；AI 回复要显式开启 |

## 4. 已知坑（都踩过）

1. **思考开关**：`enable_thinking` 是通义千问的参数，DeepSeek v4 系**会被静默忽略**并继续生成推理 token。给 DeepSeek 关思考必须发 `thinking:{type:'disabled'}`（`deepseek.js` 已按厂商分流）。长期记忆关闭后，同一整理请求 completion 从 1186 → 81。
2. **每个 DeepSeek 客户端都要单独关思考**：聊天、记忆、**日报总结**、**视觉读图** 是四个独立客户端。日报曾因总结模型思考吃满 8000 输出预算、连续两天发不出去（10-23 实测）；视觉读图也会因推理 token 返回空描述。新增模型客户端时先想清楚要不要思考。
3. **长期记忆死循环**：摘要顶到 `LONG_MEMORY_MAX_CHARS` 后若"超预算就整批回滚"，每个整理周期都会白烧一次完整生成（10-20 实测一天 ¥2.5）。现在超预算先压缩、再按行截断，永远前进；提示词按上限的 85% 给目标，减少"压缩后仍超预算"的截断（会丢尾部事实）。
4. **控制台 404**：`api()` 早先"不带 body 就 GET"，而动作只收 POST，新页面会整页 404。现在 `/api/action/*` 一律 POST；新增调用照旧传 `{}` 最稳。
5. **测试锁提示词**：`conversationRules` 里两句安全条款被精确匹配/断言；`chatAppendix` 也有条款断言与字数上限。改措辞前先 `grep -r "断言里的片段" scripts/`。
6. **编码**：源文件与 `.env` 都是 **UTF-8 无 BOM**；PowerShell 写文件用 `[IO.File]::WriteAllText(path, text, UTF8Encoding($false))`；用 `Invoke-WebRequest` 给控制台发中文时 body 要用 UTF-8 字节，否则中文变 `?`。
7. **进程单实例**：`data/bot.lock` 记 pid；不要手工再起一个，重启走 `bot-restart.ps1`。
8. **NapCat 登录**：睡眠/恢复或重启 QQ 会掉登录；控制台「QQ 登录」页可看码、扫码、快速登录。快速登录依赖 QQ 本地 token（`F:\Tencent Files\<uin>\`），列表里可能只有你的主号——登错号机器人不会上线（页面已标红提示）。
9. **表情包**：模型在回复末尾写 [表情:标签]，src/stickers.js 负责换成图片（base64 CQ）；图片放 data/stickers/，manifest.json 可覆盖标签/说明，缺省用文件名第一段当标签。触发有冷却（STICKER_COOLDOWN_MS）与每小时上限（STICKER_MAX_PER_HOUR），正文里不会出现标记。想加自己的表情包：直接用控制台「表情包库」页上传/改标签/删除（立即生效）；也可以把图丢进目录、删掉 manifest 里没有的项（或补一行 tag），重启后生效。
10. **风控自保**：`src/riskGuard.js` 统计发送失败（风控类正则见 `isRiskError`），窗口内达阈值自动停发并指数退避；状态在 `/api/state` 的 `riskGuard`，控制台可手动解除。它只降低"被限流后继续加码"的风险，**不保证不封号**；真正的护栏还是低频率、别群发广告/链接、别 @全体。
11. **旧事检索**：`src/contextRecall.js` 把 `data/daily` 的近 14 天记录建成 3 字片段索引，只在消息含“上次/记得/之前”等词时注入 3~5 条旧片段（不额外调模型）；命中见 `bot.log` 的 `[回忆]`。索引按 10 分钟自动重建，启动 3 秒后预建。要放宽/收紧召回：`RECALL_DAYS`、`RECALL_MAX_ITEMS`；原始记录保留期 `SUMMARY_RETENTION_DAYS`（默认 7，本机 30）。
12. **日报**：23:00 未登录会跳过，`SUMMARY_FALLBACK_ENABLED=1` 时 23:30 查漏补发，但要求 QQ 在线；不追补历史。
13. **数据可恢复性**：清记忆/切人格会写 `data/config-backups/*.json`；原始日报在 `data/daily/`；`data` 里的东西删了就没有第二份。

## 5. 排障顺序

1. 机器人不回 → 看 `logs/bot.log` 尾部：`OneBot 连接失败` 多半是 QQ 掉登录（`Test-NetConnection 127.0.0.1 3001`）；`安静时段` 是配置；`限流` 是频率保护。
2. 控制台异常 → `/api/state` 是否 200；页面 404 先怀疑接口方法/名字（见坑 3）。
3. 花钱异常 → 读 `data/usage.json` 按模型/标签拆分；再看 `logs/bot.log` 里 `长期记忆已更新` 的条数与字数；确认没有"失败重试"刷屏。
4. 报告没发 → 看 `[定时总结]` 日志与 `data/daily/`，确认是否登录、群号是否在白名单/`SUMMARY_GROUPS`。

## 6. 交付前检查清单

- [ ] `node scripts/test-offline.mjs` 全绿
- [ ] `node scripts/check-repository.mjs` 通过
- [ ] `package.json` 版本已递增，`CHANGELOG.md` 有对应条目
- [ ] 没有把 `data/`、`.env`、日志、个人路径写进提交
- [ ] 提交信息可读（`fix:` / `feat:` / `perf:` / `docs:`），标签 `v<version>` 已推送
- [ ] 改了代码或 `.env` 的话，已按 `bot-restart.ps1` 重启并确认 `机器人就绪`
