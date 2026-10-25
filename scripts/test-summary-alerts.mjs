/**
 * 群总结失败告警：写入状态文件与 alerts.log、只读近期一条、过期自动失效。
 * 离线运行：node scripts/test-summary-alerts.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { recordSummaryAlert, readLatestSummaryAlert, SUMMARY_ALERTS_FILE } from '../src/summaryAlerts.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-alerts-'))
const logger = { info() {}, warn() {} }

try {
  // 1) 没有记录时返回 null
  assert.equal(readLatestSummaryAlert(dir), null)

  // 2) 记录一条：状态文件 + alerts.log 都写入
  const at = Date.now() - 60_000
  recordSummaryAlert({ dataDir: dir, logDir: dir, groupId: '1128218901', stage: 'generate', message: '总结模型达到输出 token 上限', at, logger })
  const file = path.join(dir, SUMMARY_ALERTS_FILE)
  assert.ok(existsSync(file), '应生成 summary-alerts.json')
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.items.length, 1)
  assert.equal(saved.items[0].groupId, '1128218901')
  assert.equal(saved.items[0].stage, 'generate')
  const alertLog = readFileSync(path.join(dir, 'alerts.log'), 'utf8')
  assert.ok(alertLog.includes('ALERT 群'))
  assert.ok(alertLog.includes('总结失败'))
  assert.ok(alertLog.includes('1128218901'))

  // 3) 读回最近一条
  const latest = readLatestSummaryAlert(dir)
  assert.equal(latest.stage, 'generate')
  assert.equal(latest.at, at)

  // 4) 过期的不算（默认 48 小时，这里只查 30 秒，1 分钟前的记录应视为过期）
  assert.equal(readLatestSummaryAlert(dir, { withinMs: 30 * 1000 }), null)

  // 5) 只保留最近 20 条，且取最新
  for (let i = 0; i < 25; i++) {
    recordSummaryAlert({ dataDir: dir, logDir: dir, groupId: 'g', stage: 'missed', message: `第 ${i} 次`, at: Date.now() - (25 - i) * 1000, logger })
  }
  const items = JSON.parse(readFileSync(file, 'utf8')).items
  assert.equal(items.length, 20)
  assert.equal(items.at(-1).message, '第 24 次')
  assert.equal(readLatestSummaryAlert(dir).message, '第 24 次')

  // 6) 写坏文件不抛错，读坏文件返回 null
  rmSync(file)
  recordSummaryAlert({ dataDir: dir, logDir: dir, groupId: 'x', stage: 'send', message: '坏文件后仍可写' })
  assert.equal(readLatestSummaryAlert(dir).message, '坏文件后仍可写')

  console.log('test-summary-alerts passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
