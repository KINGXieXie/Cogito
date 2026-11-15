/**
 * 会话线程摘要：最近 N 轮压成一行、截断、去 CQ。
 * 离线运行：node scripts/test-thread-summary.mjs
 */
import assert from 'node:assert/strict'
import { createThreadTracker } from '../src/threadSummary.js'

const tracker = createThreadTracker({ maxTurns: 2, maxChars: 20 })
assert.equal(tracker.summary('g1'), '')

tracker.noteTurn('g1', '图书馆又没座了', '那去食堂坐着吧')
tracker.noteTurn('g1', '那你去不去', '去呀，我这就过去。')
let s = tracker.summary('g1')
assert.ok(s.includes('你们刚才在聊'))
assert.ok(s.includes('图书馆又没座了'))
assert.ok(s.includes('去呀'))

// 只保留最近 2 轮：第 3 轮进来后第 1 轮应消失
tracker.noteTurn('g1', '第三句', '第三答')
s = tracker.summary('g1')
assert.ok(!s.includes('图书馆又没座了'), '最旧一轮应被挤掉')
assert.ok(s.includes('第三句'))

// 截断与清洗：@CQ、表情、内部标记
const t2 = createThreadTracker({ maxTurns: 1, maxChars: 12 })
t2.noteTurn('g2', '[CQ:at,qq=123] [表情:微笑] 你好呀你好呀你好呀', '[CQ:face,id=6] 嗯嗯嗯嗯嗯嗯嗯嗯')
const s2 = t2.summary('g2')
assert.ok(!s2.includes('CQ:'), 'CQ 码应被清掉')
assert.ok(!s2.includes('表情'), '表情标记应被清掉')
assert.ok(s2.includes('你好呀'))

// 不同会话互不影响
assert.equal(t2.summary('g3'), '')

// clear
tracker.clear('g1')
assert.equal(tracker.summary('g1'), '')

console.log('test-thread-summary passed')
