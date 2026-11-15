/**
 * 回复自检与复读检测：单元 + 假模型集成（不联网、不发 QQ）。
 * 离线运行：node scripts/test-self-check.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizeReply, tooSimilar, checkAnswer } from '../src/replyCheck.js'
import { createBot } from '../src/bot.js'
import { MemoryStore } from '../src/memory.js'
import { MessageTimeline } from '../src/messageFreshness.js'

// 1) 单元：归一化与相似度
assert.equal(normalizeReply('在呀！！怎么啦？'), '在呀怎么啦')
assert.equal(tooSimilar('在呀，怎么啦', '在呀 怎么啦！'), true)
assert.equal(tooSimilar('在呀，怎么啦', '我在呢，怎么啦'), false)
assert.equal(tooSimilar('嗯', '嗯'), true)
assert.equal(tooSimilar('', '嗯'), false)

// 2) checkAnswer 解析
const passLlm = { async chat() { return '通过' } }
const failLlm = { async chat() { return '不通过：答非所问' } }
assert.equal((await checkAnswer({ llm: passLlm, question: '在吗', reply: '在的' })).ok, true)
const bad = await checkAnswer({ llm: failLlm, question: '在吗', reply: '今天天气不错' })
assert.equal(bad.ok, false)
assert.match(bad.reason, /答非所问/)
// 模型异常时按通过处理，不能把消息吞掉
assert.equal((await checkAnswer({ llm: { async chat() { throw Error('x') } }, question: 'q', reply: 'r' })).ok, true)

// 3) 集成：自检不通过会重写
const dir = mkdtempSync(path.join(tmpdir(), 'cogito-selfcheck-'))
const logger = { info() {}, warn() {}, debug() {}, error() {} }
const group = 200000002, selfId = '200000010', user = 200000011
function harness({ selfCheckEnabled, duplicateGuardEnabled, replyFor }) {
  const time = Math.floor(Date.now() / 1000) * 1000
  const timeline = new MessageTimeline({ now: () => time }); timeline.begin()
  const memory = new MemoryStore({ file: path.join(dir, `m${Math.random()}.json`), limit: 50, logger })
  const sent = []
  const calls = []
  const onebot = {
    selfId, messageTimeline: timeline,
    async sendGroup(g, t) { sent.push(t); return { message_id: 1000 + sent.length } },
    async sendPrivate(u, t) { sent.push(t); return { message_id: 2000 + sent.length } },
    async getMsg() { return null }, async getForwardMsg() { return { messages: [] } },
    async refreshStatus() { return { connected: true, online: true, qqOnline: true } },
  }
  const config = {
    whitelistGroups: new Set([group]), mutedGroups: new Set(), proactiveRate: 0, proactiveCooldownMs: 0,
    quietHours: '', quietHoursBlockAll: true, contextRememberAll: true, autoPlusOneEnabled: false,
    replyMaxLines: 2, replyLineMaxChars: 40, humanDelayMinMs: 0, humanDelayMaxMs: 0, lineGapMinMs: 0, lineGapMaxMs: 0,
    emojiKeepRate: 0, replyLengthMatch: true, maxTokens: 120, rateLimitPerHour: 100, rateLimitAtPerHour: 100,
    rateLimitMinGapMs: 0, rateLimitWaitMaxMs: 0, historyLimit: 10, historyLimitDirect: 10, stickerEnabled: false,
    recallEnabled: false, longMemoryEnabled: false, defenseEnabled: false, bookJoinEnabled: false, atEnabled: false,
    typingPerCharMs: 0, typingMaxMs: 500, understandEnabled: false, selfCheckEnabled, duplicateGuardEnabled,
    duplicateWindowMs: 30 * 60_000, dopeyJokeRate: 0,
  }
  const bot = createBot({
    config, logger, onebot, memory, chatSettings: null, rateLimiter: null,
    llm: { async chat(prompt) { calls.push(prompt); return replyFor(prompt, calls.length) } },
    buildSystemPrompt: () => '你是思思', rand: () => 0.5,
  })
  async function send(text) {
    const evt = {
      post_type: 'message', message_type: 'group', user_id: user, group_id: group,
      message_id: 700 + calls.length, time: time / 1000, sender: { nickname: '群友甲', role: 'member' },
      message: [{ type: 'at', data: { qq: selfId } }, { type: 'text', data: { text } }],
    }
    evt.messageContext = timeline.receive(evt)
    await bot.handleMessage(evt)
  }
  return { sent, calls, send }
}

try {
  // 自检：第一次回答跑偏，质检不通过 → 重写
  const a = harness({
    selfCheckEnabled: true, duplicateGuardEnabled: false,
    replyFor: (prompt) => {
      if (prompt.includes('对话质检员')) return '不通过：答非所问'
      if (prompt.includes('自检不通过')) return '在的呀，怎么啦'
      return '今天天气不错，出去走走吧'
    },
  })
  await a.send('在吗')
  assert.equal(a.calls.some((p) => p.includes('自检不通过')), true, '应触发重写')
  assert.ok(a.sent.some((t) => t.includes('在的呀')), `应发出重写后的回复：${JSON.stringify(a.sent)}`)

  // 复读：第二次回复与上一条相同 → 换说法
  let first = true
  const b = harness({
    selfCheckEnabled: false, duplicateGuardEnabled: true,
    replyFor: (prompt) => {
      if (prompt.includes('换个说法')) return '嗯嗯，我在呢'
      if (first) { first = false; return '在的呀，怎么啦' }
      return '在的呀，怎么啦'
    },
  })
  await b.send('在吗')
  await b.send('人呢')
  assert.equal(b.calls.some((p) => p.includes('换个说法')), true, '应触发换说法')
  assert.ok(b.sent.some((t) => t.includes('我在呢')), `应发出改写后的回复：${JSON.stringify(b.sent)}`)

  console.log('test-self-check passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
