/**
 * 书籍话题主动接话：没被@、也没触发普通回复时，她应该接一句。
 * 离线运行：node scripts/test-book-join.mjs（假模型，不联网、不发 QQ）
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createBot } from '../src/bot.js'
import { MemoryStore } from '../src/memory.js'
import { MessageTimeline } from '../src/messageFreshness.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-bookjoin-'))
const logger = { info() {}, warn() {}, debug() {}, error() {} }
const group = 200000002, selfId = '200000010', user = 200000011

async function run(configPatch, text, replyText = '唔……三体我读过，黑暗森林那段最难忘。') {
  let time = Math.floor(Date.now() / 1000) * 1000
  const timeline = new MessageTimeline({ now: () => time })
  timeline.begin()
  const memory = new MemoryStore({ file: path.join(dir, `m${Math.random()}.json`), limit: 50, logger })
  const sent = []
  const requests = []
  const onebot = {
    selfId, messageTimeline: timeline,
    async sendGroup(g, t) { sent.push(t); return { message_id: 1000 + sent.length } },
    async sendPrivate(u, t) { sent.push(t); return { message_id: 2000 + sent.length } },
    async getMsg() { return null },
    async getForwardMsg() { return { messages: [] } },
    async refreshStatus() { return { connected: true, online: true, qqOnline: true } },
  }
  const base = {
    whitelistGroups: new Set([group]), mutedGroups: new Set(), proactiveRate: 0, proactiveCooldownMs: 0,
    quietHours: '', quietHoursBlockAll: true, contextRememberAll: true, autoPlusOneEnabled: false,
    replyMaxLines: 3, replyLineMaxChars: 40, humanDelayMinMs: 0, humanDelayMaxMs: 0, lineGapMinMs: 0, lineGapMaxMs: 0,
    emojiKeepRate: 0, replyLengthMatch: true, maxTokens: 100, rateLimitPerHour: 100, rateLimitAtPerHour: 100,
    rateLimitMinGapMs: 0, rateLimitWaitMaxMs: 0, historyLimit: 10, historyLimitDirect: 10, stickerEnabled: false,
    recallEnabled: false, longMemoryEnabled: false, defenseEnabled: false, bookJoinEnabled: true, bookJoinRate: 1,
    bookJoinCooldownMs: 0, typingPerCharMs: 0, typingMaxMs: 1000, atEnabled: true, atAutoRate: 0, timeframe: 'test',
    ...configPatch,
  }
  const bot = createBot({
    config: base, logger, onebot, memory, chatSettings: null, rateLimiter: null,
    llm: { async chat(...args) { requests.push(args); return replyText } },
    buildSystemPrompt: () => '你是思思',
    rand: () => 0.5,
  })
  const evt = {
    post_type: 'message', message_type: 'group', user_id: user, group_id: group,
    message_id: 777, time: time / 1000, sender: { nickname: '群友甲', role: 'member' },
    message: [{ type: 'text', data: { text } }],
  }
  evt.messageContext = timeline.receive(evt)
  await bot.handleMessage(evt)
  return { sent, requests }
}

try {
  // 1) 书籍话题：没被@也接话
  const a = await run({}, '最近在读三体，太好看了')
  assert.ok(a.requests.length >= 1, '应该调用模型生成接话')
  assert.ok(a.sent.length >= 1, '应该发出消息')

  // 2) 普通闲聊：不接话
  const b = await run({}, '今天食堂的饭真难吃啊')
  assert.equal(b.sent.length, 0, '普通话题不应主动接话')

  // 3) 关闭开关：书籍话题也不接
  const c = await run({ bookJoinEnabled: false }, '最近在读三体，太好看了')
  assert.equal(c.sent.length, 0)

  // 4) 安静时段：不越权接话
  const d = await run({ quietHours: '00:00-23:59' }, '最近在读三体，太好看了')
  assert.equal(d.sent.length, 0, '安静时段不能主动接话')

  // 5) @ 人：模型写 [at:对方] 应换成真 @ 当前说话人
  const e = await run({}, '最近在读三体，太好看了', '[at:对方] 唔……我也读过，结局挺难受的。')
  assert.ok(e.sent.some((t) => t.includes('[CQ:at,qq=200000011]')), `应包含 @ 提问者：${JSON.stringify(e.sent)}`)

  console.log('test-book-join passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
