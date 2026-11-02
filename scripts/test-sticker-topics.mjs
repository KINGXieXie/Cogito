/**
 * 表情包话题追踪：关键词命中、窗口衰减、强/弱话题判定。
 * 离线运行：node scripts/test-sticker-topics.mjs
 */
import assert from 'node:assert/strict'
import { createTopicTracker } from '../src/stickerTopics.js'
import { loadStickers, DEFAULT_TOPIC_KEYWORDS } from '../src/stickers.js'

let clock = 1_700_000_000_000
const now = () => clock
const items = [
  { name: 'food.jpg', tag: '吃东西', keywords: DEFAULT_TOPIC_KEYWORDS['吃东西'], allowStandalone: true, weight: 1 },
  { name: 'cat.gif', tag: '好奇', keywords: DEFAULT_TOPIC_KEYWORDS['好奇'], allowStandalone: true, weight: 1 },
]

const tracker = createTopicTracker({ windowMs: 5 * 60_000, now })
const chatKey = 'g1'

// 1) 单人一句话：弱话题
tracker.observe({ chatKey, text: '有人一起点外卖吗', userId: 'u1', at: clock, items })
let cands = tracker.candidates({ chatKey, at: clock })
assert.equal(cands.length, 1)
assert.equal(cands[0].tag, '吃东西')
assert.equal(cands[0].hits, 1)
assert.equal(cands[0].speakers, 1)
assert.equal(cands[0].strong, false)

// 2) 同一个人继续聊：仍然弱（不能一个人刷屏就触发）
clock += 10_000
tracker.observe({ chatKey, text: '食堂最近真的难吃', userId: 'u1', at: clock, items })
cands = tracker.candidates({ chatKey, at: clock })
assert.equal(cands[0].hits, 2)
assert.equal(cands[0].speakers, 1)
assert.equal(cands[0].strong, false)

// 3) 第二个人接话：强话题
clock += 10_000
tracker.observe({ chatKey, text: '那家小馆子好吃吗', userId: 'u2', at: clock, items })
cands = tracker.candidates({ chatKey, at: clock })
assert.equal(cands[0].speakers, 2)
assert.equal(cands[0].strong, true)

// 4) 别的话题也能识别
tracker.observe({ chatKey, text: '这是为什么啊，没听过', userId: 'u3', at: clock, items })
cands = tracker.candidates({ chatKey, at: clock })
assert.ok(cands.some((c) => c.tag === '好奇'))

// 5) 窗口外自动过期
clock += 6 * 60_000
cands = tracker.candidates({ chatKey, at: clock })
assert.deepEqual(cands, [])

// 6) 不命中的话不产生话题
tracker.observe({ chatKey, text: '今天天气不错', userId: 'u1', at: clock, items })
assert.deepEqual(tracker.candidates({ chatKey, at: clock }), [])

// 7) 默认关键词存在
assert.ok(DEFAULT_TOPIC_KEYWORDS['吃东西'].includes('外卖'))
console.log('test-sticker-topics passed')
