/**
 * 风控自保：失败累计、风控识别、熔断暂停、指数退避、恢复与重置。
 * 离线运行：node scripts/test-risk-guard.mjs
 */
import assert from 'node:assert/strict'
import { createRiskGuard, isRiskError } from '../src/riskGuard.js'

let clock = 1_700_000_000_000
const now = () => clock
const logger = { warn() {}, info() {} }
const cfg = { riskGuardEnabled: true, riskWindowMs: 10 * 60_000, riskFailThreshold: 3, riskPauseMs: 15 * 60_000, riskMaxPauseMs: 60 * 60_000 }

// 1) 风控错误识别
assert.equal(isRiskError('OneBot API 失败：retcode=1200 操作过于频繁'), true)
assert.equal(isRiskError('发送失败：账号存在风险'), true)
assert.equal(isRiskError('ECONNRESET'), false)

// 2) 连续 3 次风控类错误 → 暂停 15 分钟
const g = createRiskGuard({ config: cfg, logger, now })
for (let i = 0; i < 2; i++) assert.equal(g.noteFailure(Error('操作过于频繁')).paused, false)
const trip = g.noteFailure(Error('操作过于频繁'))
assert.equal(trip.paused, true)
assert.equal(trip.duration, 15 * 60_000)
assert.equal(g.paused(), true)
assert.ok(g.remainingMs() > 0)
assert.match(g.state().lastPauseReason, /操作过于频繁/)

// 3) 时间走过去后自动恢复（但不是立刻清零退避次数）
clock += 15 * 60_000 + 1
assert.equal(g.paused(), false)
assert.equal(g.state().pauseCount, 1)

// 4) 再触发一次 → 退避翻倍成 30 分钟
for (let i = 0; i < 3; i++) g.noteFailure(Error('发送失败：频率限制'))
assert.equal(g.paused(), true)
assert.equal(g.state().remainingMs, 30 * 60_000)

// 5) 手动解除（full）→ 暂停与计数清零
g.reset({ full: true })
assert.equal(g.paused(), false)
assert.equal(g.state().pauseCount, 0)
assert.equal(g.state().totalFailed, 0)

// 6) 非风控类错误要累计到 6 次（阈值 ×2）才熔断
const g2 = createRiskGuard({ config: cfg, logger, now })
for (let i = 0; i < 5; i++) g2.noteFailure(Error('网络抖动'))
assert.equal(g2.paused(), false)
g2.noteFailure(Error('网络抖动'))
assert.equal(g2.paused(), true)

// 7) 成功会冲淡风险计数
const g3 = createRiskGuard({ config: cfg, logger, now })
g3.noteFailure(Error('操作过于频繁'))
g3.noteFailure(Error('操作过于频繁'))
g3.noteSuccess()
g3.noteSuccess()
g3.noteFailure(Error('操作过于频繁'))
assert.equal(g3.paused(), false, '成功两次后风险计数减半，不应在第三次立即熔断')

// 8) 关闭开关时只统计不暂停
const g4 = createRiskGuard({ config: { ...cfg, riskGuardEnabled: false }, logger, now })
for (let i = 0; i < 5; i++) g4.noteFailure(Error('操作过于频繁'))
assert.equal(g4.paused(), false)
assert.equal(g4.state().enabled, false)

// 9) 窗口外的旧失败不计入
const g5 = createRiskGuard({ config: cfg, logger, now })
g5.noteFailure(Error('操作过于频繁'))
g5.noteFailure(Error('操作过于频繁'))
clock += 11 * 60_000
g5.noteFailure(Error('操作过于频繁'))
assert.equal(g5.paused(), false, '窗口外的失败应已过期')

console.log('test-risk-guard passed')
