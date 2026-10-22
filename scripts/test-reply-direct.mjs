/**
 * 被@/私聊时的"先想一下 + 多句完整回答"：直接对话的形态、思考停顿、以及判断型提问优先级。
 * 离线运行：node scripts/test-reply-direct.mjs
 */
import assert from 'node:assert/strict'
import { planReply, shapeHint, asksForQuestion, asksForAnalysis, measureText } from '../src/replyShape.js'
import { thinkDelayMs } from '../src/humanize.js'

// 1) 被@的直接对话：问句给 2~3 句的空间，预算比普通回复大
const ask = '你知道同济四平校区有什么好吃的嘛'
const directPlan = planReply({
  incomingLen: measureText(ask),
  maxLines: 10,
  lineMaxChars: 40,
  matchEnabled: true,
  question: asksForQuestion(ask),
  direct: true,
})
assert.equal(directPlan.direct, true)
assert.ok(directPlan.lines >= 2, `直接对话至少两句，当前 ${directPlan.lines}`)
assert.ok(directPlan.lines <= 3, `不要变成小作文，当前 ${directPlan.lines}`)
assert.ok(directPlan.budget >= 70, `直接对话预算应 ≥70，当前 ${directPlan.budget}`)
assert.ok(directPlan.budget <= directPlan.lines * 40, '仍受单行上限约束')

// 2) 两个字的招呼不硬凑：还是普通短回复
const hi = planReply({ incomingLen: measureText('在？'), maxLines: 10, lineMaxChars: 40, matchEnabled: true, question: asksForQuestion('在？'), direct: true })
assert.equal(hi.direct, undefined)
assert.equal(hi.lines, 1)

// 3) 判断型提问优先：被@问到 MBTI 时仍走"依据 + 结论"两段式
const mbti = planReply({ incomingLen: measureText('我的mbti是什么'), maxLines: 10, lineMaxChars: 40, matchEnabled: true, analysis: asksForAnalysis('我的mbti是什么'), direct: true })
assert.equal(mbti.analysis, true)
assert.equal(mbti.direct, undefined, '分析型形态优先于普通直接对话')

// 4) 形态提示：要"先想一下"、要答到点上、保持人格语气
const hint = shapeHint(directPlan)
assert.ok(hint.includes('先想一下'), '提示要先理解再答')
assert.ok(hint.includes('别只丢一句客气话'), '提示要回答到点上')
assert.ok(hint.includes('保持你平时的语气'), '提示不能丢掉人格语气')
assert.ok(hint.includes(`${directPlan.lines} 句`), '提示要写清几句')

// 5) 思考停顿：落在配置区间内，问得越长停得越久（固定随机源便于断言）
const short = thinkDelayMs({ min: 800, max: 2200, length: 4 }, () => 0.5)
const long = thinkDelayMs({ min: 800, max: 2200, length: 40 }, () => 0.5)
assert.ok(short >= 800 && short <= 2200, `短问题停顿越界：${short}`)
assert.ok(long >= 800 && long <= 2200, `长问题停顿越界：${long}`)
assert.ok(long > short, `长问题应停得更久：${long} vs ${short}`)
assert.equal(thinkDelayMs({ min: 0, max: 0, length: 10 }), 0, '0 表示不等')

console.log('test-reply-direct passed')
