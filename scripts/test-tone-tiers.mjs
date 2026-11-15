/**
 * 语气分级与情绪镜像。
 * 离线运行：node scripts/test-tone-tiers.mjs
 */
import assert from 'node:assert/strict'
import { detectEmotion, classifyTier, toneHint } from '../src/toneTiers.js'

// 情绪识别
assert.equal(detectEmotion('烦死了，又没座'), 'anger')
assert.equal(detectEmotion('救命，我马上去交表'), 'anxiety')
assert.equal(detectEmotion('好累啊，想哭'), 'sad')
assert.equal(detectEmotion('哈哈哈哈哈'), 'happy')
assert.equal(detectEmotion('今天天气不错'), '')

// 语气分级
assert.equal(classifyTier({ userId: 1, ownerUserId: '1' }), 'owner')
assert.equal(classifyTier({ userId: 2, senderRole: 'admin' }), 'admin')
assert.equal(classifyTier({ userId: 2, seenCount: 10, familiarMin: 4 }), 'familiar')
assert.equal(classifyTier({ userId: 3, seenCount: 1, familiarMin: 4 }), 'stranger')

// 提示内容包含语气与情绪，且不同档位不串味
const owner = toneHint({ tier: 'owner', emotion: 'sad', ownerName: '蟹蟹', ownerTerm: '老登' })
assert.ok(owner.includes('最亲近'))
assert.ok(owner.includes('爸爸'))
assert.ok(owner.includes('老登'), '老板档应允许开玩笑叫老登')
assert.ok(owner.includes('情绪低'))
const stranger = toneHint({ tier: 'stranger', emotion: 'anger' })
assert.ok(stranger.includes('不太熟'))
assert.ok(stranger.includes('气头上'))
assert.ok(!stranger.includes('撒娇'))

console.log('test-tone-tiers passed')
