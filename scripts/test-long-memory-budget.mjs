// 长期记忆整理的字数预算回归：超预算必须先压缩、再按行截断，不准整批保留反复重试。
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLongMemory } from '../src/longMemory.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-lm-budget-'))
const log = { infos: [], warns: [] }
const logger = { info: (message) => log.infos.push(message), warn: (message) => log.warns.push(message) }
const saved = (file) => JSON.parse(readFileSync(file, 'utf8'))

function make(name, { maxChars, reply }) {
  const file = path.join(dir, `${name}.json`)
  const calls = []
  const llm = { chat: async (prompt, messages) => { calls.push({ prompt, messages }); return reply(calls.length, prompt, messages) } }
  const longMemory = createLongMemory({ file, logger, llm, maxChars, intervalMs: 3600000 })
  return { longMemory, file, calls }
}

try {
  // A：整理结果超预算 → 压缩一次后采用
  const a = make('a', { maxChars: 40, reply: (count) => count === 1 ? '甲'.repeat(100) : '乙'.repeat(30) })
  a.longMemory.addEvicted('g1', [{ text: '旧消息', time: 1000 }])
  assert.equal(await a.longMemory.summarize('g1'), true)
  assert.equal(a.calls.length, 2, '超预算时应追加一次压缩调用')
  assert.ok(a.calls[1].prompt.includes('压缩'), '第二次调用应是压缩提示词')
  assert.equal(saved(a.file).g1.summary, '乙'.repeat(30))
  assert.deepEqual(saved(a.file).g1.pending, [])
  assert.ok(log.infos.some((message) => message.includes('已压缩')))

  // B：压缩后仍超预算 → 按行截断，仍然推进队列
  const b = make('b', { maxChars: 20, reply: () => '丙'.repeat(60) })
  b.longMemory.addEvicted('g2', [{ text: '消息', time: 1000 }])
  assert.equal(await b.longMemory.summarize('g2'), true)
  const bSaved = saved(b.file).g2
  assert.ok(bSaved.summary.length <= 20, '摘要不得超过预算')
  assert.deepEqual(bSaved.pending, [])
  assert.ok(log.warns.some((message) => message.includes('按行截断')))

  // C：预算内不额外调用压缩
  const c = make('c', { maxChars: 100, reply: () => '很短的摘要' })
  c.longMemory.addEvicted('g3', [{ text: '消息', time: 1000 }])
  assert.equal(await c.longMemory.summarize('g3'), true)
  assert.equal(c.calls.length, 1)

  // D：空摘要保留批次等待重试，不能当成成功
  const d = make('d', { maxChars: 100, reply: () => '' })
  d.longMemory.addEvicted('g4', [{ text: '消息', time: 1000 }])
  assert.equal(await d.longMemory.summarize('g4'), false)
  assert.equal(saved(d.file).g4.pending.length, 1)
  assert.ok(log.warns.some((message) => message.includes('摘要为空')))

  // E：积压超过单批上限时持续前进，不会卡在超预算里
  const e = make('e', { maxChars: 30, reply: (count, prompt) => prompt.includes('压缩') ? '丁'.repeat(10) : '戊'.repeat(80) })
  const entries = Array.from({ length: 130 }, (_, index) => ({ text: `第${index}条`, time: 1000 + index, name: '群友' }))
  assert.equal(await e.longMemory.feed('g5', entries), true)
  assert.deepEqual(saved(e.file).g5.pending, [])
  assert.ok(e.calls.length >= 5, '130 条积压至少要分三批整理')
  assert.ok(saved(e.file).g5.summary.length <= 30)

  console.log('test-long-memory-budget passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
