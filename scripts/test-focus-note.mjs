/**
 * 上下文焦点：把"现在要接的那一句"和上一句回复摆进提示词。
 * 离线运行：node scripts/test-focus-note.mjs
 */
import assert from 'node:assert/strict'
import { buildFocusNote } from '../src/bot.js'

// 1) 有历史回复 + 引用
const note = buildFocusNote(
  [
    { role: 'user', content: '【甲】图书馆没座了' },
    { role: 'assistant', content: '那我们去食堂坐着吧' },
  ],
  '那你去不去',
  { text: '图书馆没座了' },
)
assert.ok(note.includes('你现在要接的话'))
assert.ok(note.includes('那你去不去'))
assert.ok(note.includes('你上一句是'))
assert.ok(note.includes('食堂坐着'))
assert.ok(note.includes('引用了'))
assert.ok(note.includes('不要跳到更早的话题'))

// 2) 只有当前消息：也不能崩
const bare = buildFocusNote([], '在吗')
assert.ok(bare.includes('在吗'))
assert.ok(!bare.includes('你上一句是'))

// 3) 长文本会被截断
const long = buildFocusNote([], 'x'.repeat(500))
assert.ok(long.length < 400)

console.log('test-focus-note passed')
