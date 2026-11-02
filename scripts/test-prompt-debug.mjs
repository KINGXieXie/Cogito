/**
 * 提示词调试：分段拼装、字数/token 估算、旧事检索注入、试跑（假模型，不联网）。
 * 离线运行：node scripts/test-prompt-debug.mjs
 */
import assert from 'node:assert/strict'
import { createPromptDebugger } from '../src/promptDebug.js'

const config = {
  botName: '思思', persona: '你叫思思，一个说话很小声的女生。', speechHabits: '',
  replyMaxLines: 10, replyLineMaxChars: 40, replyLengthMatch: true, maxTokens: 500,
  stickerEnabled: true, recallEnabled: true, recallMaxItems: 4,
  exclusiveNickname: '老登', ownerUserId: '3308887513', ownerName: '蟹蟹',
}
const longMemory = { get: () => '' }
let recallCalls = 0
const recall = ({ text }) => {
  recallCalls++
  return text.includes('上次') ? [{ t: Date.now(), name: '群友甲', text: '上次说的那家小馆子' }] : []
}
let lastPrompt = ''
const llm = { async chat(prompt) { lastPrompt = prompt; return '唔……在的呀。' } }
const debuggerObj = createPromptDebugger({ config, longMemory, todayNote: () => '', recall, stickers: [{ tag: '开心', file: 'x.png', name: 'x.png' }], llm })

// 1) 普通消息：分段拼装、字数与预算
const a = debuggerObj.sectionsFor({ chatKey: 'g1', text: '今天好累啊' })
assert.ok(a.sections.length >= 4, `分段太少：${a.sections.length}`)
assert.ok(a.chars > 100)
assert.ok(a.approxTokens > 0)
assert.ok(a.sections.some((s) => s.text.includes('思思')), '应包含人格')
assert.ok(a.sections.some((s) => s.text.includes('回复的形态要求') || s.text.includes('形态要求')), '应包含形态要求')
assert.ok(a.sections.some((s) => s.text.includes('表情包')), '应包含表情包说明')
assert.equal(a.recallCount, 0)
assert.equal(recallCalls, 0, '不出现回忆词时不应检索')

// 2) 出现回忆词：注入旧片段
const b = debuggerObj.sectionsFor({ chatKey: 'g1', text: '上次说的那家店还开吗' })
assert.equal(b.recallCount, 1)
assert.ok(b.sections.some((s) => s.text.includes('小馆子')), '应注入旧片段')
assert.ok(b.chars > a.chars)

// 3) 试跑：用假模型，返回原始与裁剪结果
const r = await debuggerObj.tryReply({ chatKey: 'g1', text: '在吗' })
assert.equal(r.raw, '唔……在的呀。')
assert.ok(Array.isArray(r.shaped) && r.shaped.length >= 1)
assert.ok(lastPrompt.includes('思思'), '应把拼好的提示词交给模型')
assert.equal(lastPrompt, r.prompt)

// 4) 没有配置主人时不出现称呼规则
const noOwner = createPromptDebugger({ config: { ...config, ownerUserId: '' }, longMemory, todayNote: () => '', recall, stickers: [], llm })
assert.equal(noOwner.sectionsFor({ chatKey: 'g1', text: '你好' }).sections.some((s) => s.text.includes('称呼规则')), false)

console.log('test-prompt-debug passed')
