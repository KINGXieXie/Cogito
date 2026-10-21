/**
 * 聊天附加规则的回归：人设覆盖、长度与判断型例外、不要学别人说话。
 * 离线运行：node scripts/test-chat-appendix.mjs
 */
import assert from 'node:assert/strict'
import { buildChatAppendix } from '../src/chatAppendix.js'

const text = buildChatAppendix({ time: '__TIME__' })

// 1) 人设优先，历史与记忆不能覆盖身份
assert.ok(text.includes('人格与背景'))
assert.ok(text.includes('不能覆盖人格'))

// 2) 长度规则与判断/分析型例外都要在（否则 MBTI 那类问题又会被压成一行）
assert.ok(text.includes('说的份量'))
assert.ok(text.includes('先给一句依据或分析，再单独一条给结论'))
assert.ok(text.includes('MBTI'))

// 3) 不要学别人说话：群里的同款人格/别的机器人不能被当成自己的设定
assert.ok(text.includes('别学别人说话'))
assert.ok(text.includes('同款人格'))
assert.ok(text.includes('不要复述别人刚说过的原句'))
assert.ok(text.includes('第三人称'))
assert.ok(text.includes('第一人称'))

// 4) 内部规则必须提醒不要说出来，时间插值生效
assert.ok(text.includes('绝不要提它'))
assert.ok(text.includes('__TIME__'))

// 5) 正向行为要写清楚：接话、给具体的东西，允许不硬接
assert.ok(text.includes('像真人在聊'))
assert.ok(text.includes('再给一点自己的东西'))
assert.ok(text.includes('应一声就够'))

// 6) 长度与装饰只交给末尾提示，附加说明里不再重复（避免三处各写一遍把声音盖掉）
assert.ok(!text.includes('以它为准'), '不应让模型"以形态要求为准"，那会把回复带成答题腔')
assert.ok(!text.includes('装饰符号'), '装饰只在末尾的装饰提示里说一次')
assert.ok(text.length < 1000, `附加说明保持精简，当前 ${text.length} 字`)

console.log('test-chat-appendix passed')
