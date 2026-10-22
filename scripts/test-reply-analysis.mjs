/**
 * 判断/分析型提问的回复形态：先给依据、再单独给结论；仍然按聊天尺度收着，不写成长段落。
 * 离线运行：node scripts/test-reply-analysis.mjs
 */
import assert from 'node:assert/strict'
import { asksForAnalysis, asksForQuestion, planReply, shapeHint, shapeReply, measureText } from '../src/replyShape.js'

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

// 7) 极短输入不再硬给余量：允许一两个字回复，避免"永远比对方说得多"
const tiny = planReply({ incomingLen: 2, maxLines: 10, lineMaxChars: 40, matchEnabled: true })
assert.ok(tiny.budget <= 12, `极短输入预算应紧一点，当前 ${tiny.budget}`)
assert.ok(shapeHint(tiny).includes('一两个字也行'), '提示要给极短回复留口子')

// 8) 只超一点点不裁：宁可多几个字，也不要把半句砍断
const tolerantPlan = { lines: 1, budget: 8, perLineCap: 18, lineMaxChars: 40 }
assert.deepEqual(shapeReply('唔…累的话，先坐下歇会儿。', tolerantPlan), ['唔…累的话，先坐下歇会儿。'])
const overflowPlan = { lines: 1, budget: 8, perLineCap: 40, lineMaxChars: 40 }
assert.ok(shapeReply('这句明明超预算很多很多很多很多很多很多人', overflowPlan)[0].length < 40, '超太多仍要裁')

// 9) 问句给足答案空间：几个字的提问也要能答完一两句，不被腰斩成"……"
assert.equal(asksForQuestion('今天有什么新闻'), true)
assert.equal(asksForQuestion('发了啥'), true)
assert.equal(asksForQuestion('你知道同济四平校区有什么好吃的嘛'), true)
assert.equal(asksForQuestion('在？'), false, '两个字的招呼不算问句')
assert.equal(asksForQuestion('今天好累啊'), false)
const newsPlan = planReply({ incomingLen: measureText('今天有什么新闻'), maxLines: 10, lineMaxChars: 40, matchEnabled: true, question: true })
assert.ok(newsPlan.budget >= 36, `问句预算应给到一行，当前 ${newsPlan.budget}`)
assert.ok(shapeHint(newsPlan).includes('把话说完整'), '问句提示要明确要求说完')
const plainPlan = planReply({ incomingLen: measureText('今天有什么新闻'), maxLines: 10, lineMaxChars: 40, matchEnabled: true })
assert.ok(plainPlan.budget < newsPlan.budget, '不问问题时仍按对方长度走')

// 10) 两条很短的话合成一条发，避免"在呀。"+"怎么啦。"这种碎碎念
const merged = shapeReply('在呀。\n怎么啦。', { lines: 2, budget: 40, perLineCap: 20, lineMaxChars: 40 })
assert.equal(merged.length, 1, '短的两行应合并成一条')
assert.ok(merged[0].includes('在呀') && merged[0].includes('怎么啦'))
const keepSplit = shapeReply('唔……四平那边啊，我脑子一时有点空。\n老登要是知道，估计又要吹他当年吃遍食堂了。', { lines: 2, budget: 80, perLineCap: 40, lineMaxChars: 40 })
assert.equal(keepSplit.length, 2, '内容够长时仍分两条')

// 7) 明确要求长内容时 longForm 优先于分析形态
assert.equal(planReply({ incomingLen: 10, maxLines: 5, lineMaxChars: 40, analysis: true, longForm: true }).longForm, true)

console.log('test-reply-analysis passed')
