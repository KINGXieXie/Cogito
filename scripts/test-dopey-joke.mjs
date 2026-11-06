/**
 * 呆呆的玩笑：概率与提示。
 * 离线运行：node scripts/test-dopey-joke.mjs
 */
import assert from 'node:assert/strict'
import { shouldDopeyJoke, dopeyHint } from '../src/dopeyJoke.js'

assert.equal(shouldDopeyJoke({ rate: 0.15, length: 10, rand: () => 0.1 }), true)
assert.equal(shouldDopeyJoke({ rate: 0.15, length: 10, rand: () => 0.5 }), false)
assert.equal(shouldDopeyJoke({ rate: 0, length: 10, rand: () => 0 }), false, '关闭时永不触发')
assert.equal(shouldDopeyJoke({ rate: 1, length: 2, rand: () => 0 }), false, '太短的消息不逗')
assert.ok(dopeyHint().includes('呆'))
assert.ok(dopeyHint().includes('别解释'))

console.log('test-dopey-joke passed')
