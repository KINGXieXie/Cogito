/**
 * 按字数估算打字延迟：越长越慢、有上下限。
 * 离线运行：node scripts/test-typing-pace.mjs
 */
import assert from 'node:assert/strict'
import { typingDelayMsForLength } from '../src/humanize.js'

const short = typingDelayMsForLength(3, { min: 600, max: 7000, perCharMs: 55 }, () => 0)
const mid = typingDelayMsForLength(30, { min: 600, max: 7000, perCharMs: 55 }, () => 0)
const long = typingDelayMsForLength(200, { min: 600, max: 7000, perCharMs: 55 }, () => 0)

assert.ok(short >= 600)
assert.ok(mid > short, `30 字应比 3 字慢：${mid} vs ${short}`)
assert.ok(long <= 7000, '不能超过上限')
assert.ok(long >= mid)
assert.ok(typingDelayMsForLength(0, { min: 600, max: 7000, perCharMs: 55 }, () => 0) >= 600)

console.log('test-typing-pace passed')
