/**
 * 即时上下文的相关性挑选：不再只取最近 N 条，而是把同话题的更早消息也带上，
 * 同时保持时间顺序与条数上限。离线运行：node scripts/test-context-select.mjs
 */
import assert from 'node:assert/strict'
import { selectHistory } from '../src/contextSelect.js'
import { tokenize, overlapCount } from '../src/contextTokens.js'

const msg = (content, i, name = '群友') => ({ role: 'user', content, time: 1_700_000_000_000 + i * 1000, name })

// 1) 不足上限时原样返回
const few = [msg('在吗', 1)]
assert.deepEqual(selectHistory(few, { limit: 10 }), few)

// 2) 超上限时优先保留最近一半 + 同话题的较早消息
const history = []
for (let i = 0; i < 12; i++) history.push(msg('猫粮到底买哪种好啊', i))
for (let i = 12; i < 40; i++) history.push(msg(`随便聊聊第 ${i} 句`, i))
const picked = selectHistory(history, { limit: 10, text: '猫粮买什么好呢' })
assert.equal(picked.length, 10)
assert.ok(picked.some((m) => m.content.includes('猫粮')), '应带上一部分跟猫粮相关的旧消息')
assert.ok(picked.some((m) => m.time === history.at(-1).time), '最近的消息必须在')
// 结果保持时间顺序
for (let i = 1; i < picked.length; i++) assert.ok(picked[i].time > picked[i - 1].time, '应按时间升序')

// 3) 当前说话人的更早消息会被保留（多轮连贯）
const mixed = [
  msg('我先说一句无关的', 1, '甲'),
  msg('乙在说别的', 2, '乙'),
  ...Array.from({ length: 20 }, (_, i) => msg(`第 ${i} 句闲聊`, i + 3, '丙')),
  msg('甲刚刚说的重点', 30, '甲'),
]
const picked2 = selectHistory(mixed, { limit: 8, text: '随便', speaker: '甲' })
assert.ok(picked2.some((m) => m.content === '我先说一句无关的'), '同一说话人的旧消息应被带上')

// 4) 空历史/非法上限不崩
assert.deepEqual(selectHistory([], { limit: 5 }), [])
assert.ok(selectHistory(history, { limit: 1 }).length <= 1)

// 5) 分词与重叠：中文 bigram、英文词、过滤 [图片] 与 @
const tokens = tokenize('Spyder 炸了 [图片] @123456 猫粮')
assert.ok(tokens.includes('spyder'))
assert.ok(tokens.includes('猫粮'))
assert.ok(!tokens.some((t) => t.includes('图片')))
assert.equal(overlapCount(tokenize('猫粮怎么选'), '猫粮选哪种'), 1)

console.log('test-context-select passed')
