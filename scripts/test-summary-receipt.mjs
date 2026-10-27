/**
 * 报告发送回执：自定义报告时间（如 22:00）时也要落盘，
 * 否则第二天启动会误报"昨日日报未发出"。
 * 离线运行：node scripts/test-summary-receipt.mjs
 */
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSummarySchedule } from '../src/summarySchedule.js'

const logger = { info() {}, warn() {}, error() {} }
const dir = mkdtempSync(path.join(tmpdir(), 'summary-receipt-'))
const DAY = '2026-10-26'

function service(times, { enabled = true } = {}) {
  return createSummarySchedule({
    config: { summaryEnabled: true, summaryFallbackEnabled: enabled, summaryTimes: times, dataDir: dir },
    logger, onebot: {}, groups: () => [101], isRunning: () => false,
    readEveningHistory: async () => ({ complete: true, rawMessages: [] }), runGroup: async () => {},
  })
}

try {
  // 1) 22:00 的计划：22 点之后发送要记录回执
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(`${DAY}T22:03:00+08:00`).getTime() })
  const a = service(['22:00'])
  const key = a.beforeSend(101)
  assert.ok(key, '22:03 发送应返回回执键')
  a.acknowledged(key, { message_id: 9001 })
  assert.equal(a.hasDelivered(DAY, 101), true, '确认后应视为已发送')
  mock.timers.reset()

  // 2) 同一配置下，白天的手动报告不算"当晚已发"
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(`${DAY}T15:00:00+08:00`).getTime() })
  const b = service(['22:00'])
  assert.equal(b.beforeSend(101), null, '15:00 不记录当晚回执')
  mock.timers.reset()

  // 3) 默认 23:00 的旧行为不变
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(`${DAY}T22:30:00+08:00`).getTime() })
  const c = service(['23:00'])
  assert.equal(c.beforeSend(101), null, '23:00 计划下 22:30 不记录')
  mock.timers.reset()

  console.log('test-summary-receipt passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
