/**
 * 旧事检索：从 data/daily 的原始记录里按关键词找回相关片段。
 * 离线运行：node scripts/test-context-recall.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRecallIndex, shouldRecall, buildRecallNote, formatRecallTime } from '../src/contextRecall.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-recall-'))
const group = '1128218901'
const nowMs = new Date('2026-10-25T20:00:00+08:00').getTime()
const logger = { info() {}, warn() {}, debug() {}, error() {} }

function record(time, name, text, extra = {}) {
  return JSON.stringify({ id: String(Math.floor(Math.random() * 1e9)), time: Math.floor(time / 1000), userId: '1', name, text, replyId: '', atBot: false, ...extra })
}

try {
  const gdir = path.join(dir, 'daily', group)
  mkdirSync(gdir, { recursive: true })

  // 近期相关记录
  writeFileSync(path.join(gdir, '2026-10-22.jsonl'), [
    record(new Date('2026-10-22T21:03:00+08:00').getTime(), '群友甲', '四平路那家小馆子挺好吃的，也不贵'),
    record(new Date('2026-10-22T21:05:00+08:00').getTime(), '群友乙', '今天雨好大，伞都吹翻了'),
    record(new Date('2026-10-22T21:06:00+08:00').getTime(), '机器人', '机器人自己的话', { atBot: true }),
  ].join('\n'))

  // 超过 days 的旧记录（应被过滤）
  writeFileSync(path.join(gdir, '2026-09-01.jsonl'), [
    record(new Date('2026-09-01T20:00:00+08:00').getTime(), '群友丙', '四平路那家小馆子真的绝了'),
  ].join('\n'))

  // 别的群：不应串到当前群
  const other = path.join(dir, 'daily', '999999')
  mkdirSync(other, { recursive: true })
  writeFileSync(path.join(other, '2026-10-23.jsonl'), [
    record(new Date('2026-10-23T20:00:00+08:00').getTime(), '群友丁', '四平路那家小馆子说过了'),
  ].join('\n'))

  const idx = createRecallIndex({ dataDir: dir, days: 14, logger, now: () => nowMs })
  idx.refresh()
  assert.ok(idx.size >= 3, `索引条目应加载（当前 ${idx.size}）`)

  // 1) 什么时候触发
  assert.equal(shouldRecall('就上次说的那家店，周末去吗'), true)
  assert.equal(shouldRecall('那天你们说的猫粮'), true)
  assert.equal(shouldRecall('记得带上伞'), true)
  assert.equal(shouldRecall('今天好热啊'), false, '普通闲聊不应触发检索')
  assert.equal(shouldRecall('?'), false)

  // 2) 召回：同群、近期、相关
  const found = idx.recall({ groupKey: `g${group}`, text: '上次说的那个小馆子，周末去吗', limit: 3, nowMs })
  assert.ok(found.length >= 1, '应召回旧记录')
  assert.ok(found.some((e) => e.text.includes('小馆子')), `应召回小馆子那条：${JSON.stringify(found.map((e) => e.text))}`)
  assert.ok(!found.some((e) => e.text.includes('雨好大')), '无关的雨天记录不应被召回')
  assert.ok(!found.some((e) => e.text.includes('机器人自己的话')), 'atBot 记录不进检索')
  assert.ok(!found.some((e) => e.text.includes('2026-09-01')), '过期记录不应召回')
  assert.ok(!found.some((e) => e.g === '999999'), '别的群不能串进来')
  // 按时间升序
  for (let i = 1; i < found.length; i++) assert.ok(found[i].t >= found[i - 1].t)

  // 3) 提示词片段：带时间、名字，并明确是历史资料
  const note = buildRecallNote(found)
  assert.ok(note.includes('历史资料'))
  assert.ok(note.includes('群友甲'))
  assert.ok(note.includes('10-22 21:03'))
  assert.ok(!note.includes('机器人自己的话'))
  assert.equal(buildRecallNote([]), '')

  // 4) 另一条相关线索（英文词）也能命中
  writeFileSync(path.join(gdir, '2026-10-23.jsonl'), [
    record(new Date('2026-10-23T23:10:00+08:00').getTime(), '群友戊', 'Spyder 又崩了，改 config 吧'),
  ].join('\n'))
  idx.refresh()
  const spy = idx.recall({ groupKey: `g${group}`, text: '上次那个 Spyder 崩的事后来解决了吗', limit: 3 })
  assert.ok(spy.some((e) => e.text.includes('Spyder')), '英文词也应能召回')

  // 5) 空目录/不存在的目录不崩
  const empty = createRecallIndex({ dataDir: path.join(dir, 'nope'), days: 7, logger, now: () => nowMs })
  assert.deepEqual(empty.recall({ groupKey: `g${group}`, text: '上次说的' }), [])

  // 6) 时间格式
  assert.equal(formatRecallTime(new Date('2026-10-22T21:03:00+08:00').getTime()), '10-22 21:03')

  console.log('test-context-recall passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
