/**
 * @ 人：标记解析、名字匹配、安全限制、CQ 输出。
 * 离线运行：node scripts/test-mentions.mjs
 */
import assert from 'node:assert/strict'
import { applyMentions } from '../src/mentions.js'

const members = [
  { user_id: 456, card: '小明', nickname: '明明' },
  { user_id: 789, card: '', nickname: '阿花' },
]

// 1) [at:对方] → 当前说话人
let r = applyMentions('[at:对方] 我读过三体。', { speakerId: 123, members, selfId: 999 })
assert.equal(r.text, '[CQ:at,qq=123] 我读过三体。')
assert.deepEqual(r.mentions, ['123'])

// 2) [at:名字] → 按群名片/昵称解析
assert.equal(applyMentions('[at:小明] 你说得对', { speakerId: 1, members }).text, '[CQ:at,qq=456] 你说得对')
assert.equal(applyMentions('[at:阿花] 嗯', { speakerId: 1, members }).text, '[CQ:at,qq=789] 嗯')

// 3) 找不到人：删掉标记，不发原文
assert.equal(applyMentions('[at:不存在的人] 你好', { speakerId: 1, members }).text, '你好')

// 4) 安全：@全体默认拒绝、不 @ 自己
assert.equal(applyMentions('[at:全体] 开会了', { speakerId: 1, members }).text, '开会了')
assert.equal(applyMentions('[at:对方] 你好', { speakerId: 999, selfId: 999 }).text, '你好')

// 5) 重复 @ 只保留一次
const dup = applyMentions('[at:对方] 你[at:对方]说', { speakerId: 123 })
assert.deepEqual(dup.mentions, ['123'])
assert.equal(dup.text.match(/\[CQ:at,qq=123\]/g).length, 1)

// 6) 没有标记：原样返回
assert.deepEqual(applyMentions('普通消息', { speakerId: 123 }), { text: '普通消息', mentions: [] })

console.log('test-mentions passed')
