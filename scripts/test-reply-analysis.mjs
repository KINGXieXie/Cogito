/**
 * 判断/分析型提问的回复形态：先给依据、再单独给结论；仍然按聊天尺度收着，不写成长段落。
 * 离线运行：node scripts/test-reply-analysis.mjs
 */
import assert from 'node:assert/strict'
import { asksForAnalysis, planReply, shapeHint, shapeReply, measureText } from '../src/replyShape.js'

// 1) 哪些问法算"需要判断/分析"
assert.equal(asksForAnalysis('我的mbti是什么'), true)
assert.equal(asksForAnalysis('帮我看看我的 MBTI 吧'), true)
assert.equal(asksForAnalysis('你觉得我性格怎么样'), true)
assert.equal(asksForAnalysis('帮我想想该不该去'), true)
assert.equal(asksForAnalysis('为什么他总这样'), true)
assert.equal(asksForAnalysis('我性格比较内向'), false, '陈述句不放宽形态')
assert.equal(asksForAnalysis('今天吃啥'), false)
assert.equal(asksForAnalysis(''), false)
assert.equal(asksForAnalysis(undefined), false)

// 2) 短问题也能分成"依据 + 结论"，总长仍在聊天尺度内
const short = planReply({ incomingLen: measureText('我的mbti是什么'), maxLines: 10, lineMaxChars: 40, analysis: true })
assert.equal(short.analysis, true)
assert.ok(short.lines >= 2, '至少两行')
assert.ok(short.budget >= 36 && short.budget <= 120, '预算不越界')
assert.ok(short.perLineCap >= 10, '单行至少能放一句短话')

// 3) 对照：同一句话不开分析模式时仍是一行（闲聊不受影响）
const plain = planReply({ incomingLen: measureText('我的mbti是什么'), maxLines: 10, lineMaxChars: 40 })
assert.equal(plain.lines, 1)

// 4) 问得长一些时允许三行；行数受 REPLY_MAX_LINES 约束
assert.equal(planReply({ incomingLen: 120, maxLines: 10, lineMaxChars: 40, analysis: true }).lines, 3)
assert.equal(planReply({ incomingLen: 120, maxLines: 2, lineMaxChars: 40, analysis: true }).lines, 2)
assert.equal(planReply({ incomingLen: 10, maxLines: 1, lineMaxChars: 40, analysis: true }).lines, 1)

// 5) 提示词要强调"先依据后结论"，并禁止长段落/列表
const hint = shapeHint(short)
assert.ok(hint.includes('结论'))
assert.ok(hint.includes(`${short.lines} 行`))
assert.ok(hint.includes('不要编号'))
assert.ok(hint.includes('不要写成长段落'))
assert.ok(hint.includes('不要提及'), '内部规则不能泄漏到聊天里')

// 6) 模型把分析和结论写在一行时，按句号拆成两条，结论落在最后一条
const raw = '唔...你说话慢慢的，喜欢一个人待着。所以我猜你是 INFP。'
const lines = shapeReply(raw, short)
assert.ok(lines.length >= 2, '应拆成多条')
assert.ok(lines.join('').length <= short.budget + 8, '总长不超预算')
assert.ok(lines[lines.length - 1].includes('INFP'), '结论在最后一条')

// 7) 明确要求长内容时 longForm 优先于分析形态
assert.equal(planReply({ incomingLen: 10, maxLines: 5, lineMaxChars: 40, analysis: true, longForm: true }).longForm, true)

console.log('test-reply-analysis passed')
