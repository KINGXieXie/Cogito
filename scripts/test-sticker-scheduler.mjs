/**
 * 表情包调度：跟回复发 / 单独发、冷却、每小时上限、同图与同标签限制。
 * 离线运行：node scripts/test-sticker-scheduler.mjs
 */
import assert from 'node:assert/strict'
import { createStickerScheduler } from '../src/stickerScheduler.js'

let clock = 1_700_000_000_000
const now = () => clock
const items = [
  { name: 'a.jpg', tag: '吃东西', allowStandalone: true, weight: 1 },
  { name: 'b.jpg', tag: '吃东西', allowStandalone: true, weight: 1 },
  { name: 'c.jpg', tag: '好奇', allowStandalone: false, weight: 1 },
]
const candidates = [
  { tag: '吃东西', hits: 3, speakers: 2, strong: true },
  { tag: '好奇', hits: 2, speakers: 2, strong: true },
]

// 1) 跟回复：直接挑最高分的标签
let s = createStickerScheduler({ config: { stickerMinGapMs: 0, stickerPerHour: 10, stickerSameImageMs: 0, stickerTagWindowMs: 0, stickerTagMax: 5 }, now })
let pick = s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock, rand: () => 0 })
assert.ok(pick)
assert.equal(pick.tag, '吃东西')
assert.equal(pick.item.name, 'a.jpg')

// 2) 单独发：概率 0 → 不发
s = createStickerScheduler({ config: { stickerStandaloneRate: 0 }, now })
assert.equal(s.pick({ chatKey: 'g1', items, candidates, mode: 'standalone', at: clock, rand: () => 0 }), null)

// 3) 单独发：强话题 + 概率 1 → 发；弱话题仍不发
s = createStickerScheduler({ config: { stickerStandaloneRate: 1 }, now })
assert.ok(s.pick({ chatKey: 'g1', items, candidates, mode: 'standalone', at: clock, rand: () => 0 }))
const weak = [{ tag: '吃东西', hits: 1, speakers: 1, strong: false }]
assert.equal(s.pick({ chatKey: 'g1', items, candidates: weak, mode: 'standalone', at: clock, rand: () => 0 }), null)

// 4) 不允许单独发的图会被跳过
const onlyCat = [{ tag: '好奇', hits: 3, speakers: 2, strong: true }]
assert.equal(s.pick({ chatKey: 'g1', items, candidates: onlyCat, mode: 'standalone', at: clock, rand: () => 0 }), null)

// 5) 冷却：刚发过要等最小间隔
s = createStickerScheduler({ config: { stickerMinGapMs: 60_000, stickerPerHour: 10 }, now })
pick = s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock, rand: () => 0 })
s.remember('g1', pick.item, clock)
assert.equal(s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock + 1000, rand: () => 0 }), null)
assert.ok(s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock + 61_000, rand: () => 0 }))

// 6) 同一张图在一段时间内不重复（tagMax 放开，确保是图级限制）
s = createStickerScheduler({ config: { stickerMinGapMs: 0, stickerPerHour: 10, stickerSameImageMs: 30 * 60_000, stickerTagMax: 10, stickerTagWindowMs: 60_000 }, now })
pick = s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock, rand: () => 0 })
s.remember('g1', pick.item, clock)
const next = s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock + 1000, rand: () => 0 })
assert.ok(next)
assert.notEqual(next.item.name, pick.item.name, '不能短时间重复同一张图')

// 7) 每小时上限
s = createStickerScheduler({ config: { stickerMinGapMs: 0, stickerPerHour: 1, stickerSameImageMs: 0, stickerTagMax: 10, stickerTagWindowMs: 0 }, now })
pick = s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock, rand: () => 0 })
s.remember('g1', pick.item, clock)
assert.equal(s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock + 1000, rand: () => 0 }), null)
assert.ok(s.pick({ chatKey: 'g1', items, candidates, mode: 'attach', at: clock + 3_600_001, rand: () => 0 }))

// 8) 同标签次数上限
s = createStickerScheduler({ config: { stickerMinGapMs: 0, stickerPerHour: 10, stickerSameImageMs: 0, stickerTagWindowMs: 10 * 60_000, stickerTagMax: 1 }, now })
const foodOnly = [candidates[0]]
pick = s.pick({ chatKey: 'g1', items, candidates: foodOnly, mode: 'attach', at: clock, rand: () => 0 })
s.remember('g1', pick.item, clock)
assert.equal(s.pick({ chatKey: 'g1', items, candidates: foodOnly, mode: 'attach', at: clock + 1000, rand: () => 0 }), null)

console.log('test-sticker-scheduler passed')
