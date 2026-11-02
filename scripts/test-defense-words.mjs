/**
 * 守护词库：增删、去重、转义、持久化、热更新。
 * 离线运行：node scripts/test-defense-words.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizeWords, loadDefenseWords, saveDefenseWords, compileInsultRegex, DEFAULT_INSULTS } from '../src/defenseWords.js'
import { createDefenseGuard } from '../src/defense.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-words-'))
const logger = { info() {}, warn() {} }
try {
  // 1) 归一化：去空行、去重（忽略大小写）、截断长度
  assert.deepEqual(normalizeWords([' 傻逼 ', '', 'SB', 'sb', '滚出去', 'x'.repeat(50)]), ['傻逼', 'SB', '滚出去', 'x'.repeat(24)])

  // 2) 词面量转义：不会当正则解释
  const re = compileInsultRegex(['a.b', 'sb'])
  assert.equal(re.test('a.b'), true)
  assert.equal(re.test('axb'), false)

  // 3) 没有文件时用默认词库
  const loaded = loadDefenseWords(dir, { logger })
  assert.equal(loaded.source, 'default')
  assert.ok(loaded.insults.length >= 10)

  // 4) 保存/读取：自己删掉的词不应回来
  const saved = saveDefenseWords(dir, { insults: ['傻逼', '恶心东西', '恶心东西'], aliases: ['蟹总'] })
  assert.deepEqual(saved.insults, ['傻逼', '恶心东西'])
  const payload = JSON.parse(readFileSync(path.join(dir, 'defense-words.json'), 'utf8'))
  assert.equal(payload.version, 1)
  const reloaded = loadDefenseWords(dir, { logger })
  assert.deepEqual(reloaded.insults, ['傻逼', '恶心东西'])
  assert.deepEqual(reloaded.aliases, ['蟹总'])

  // 5) 至少保留一个辱骂词
  assert.throws(() => saveDefenseWords(dir, { insults: ['  ', ''] }), /不能为空/)

  // 6) 热更新：guard.setWords 立即改变判定与指向词
  const guard = createDefenseGuard({ dataDir: dir, config: { defenseEnabled: true, defenseMuteSeconds: 120 }, words: reloaded, logger })
  assert.equal(guard.hasInsult('你个恶心东西'), true)
  assert.equal(guard.hasInsult('你个王八蛋'), false)
  const next = saveDefenseWords(dir, { insults: ['王八蛋'], aliases: ['蟹总', '蟹老板'] })
  guard.setWords(next)
  assert.equal(guard.hasInsult('你个王八蛋'), true)
  assert.equal(guard.hasInsult('你个恶心东西'), false, '删掉的词应立即失效')
  assert.deepEqual(guard.aliases(), ['蟹总', '蟹老板'])

  // 7) 默认词库仍可用
  assert.ok(DEFAULT_INSULTS.includes('傻逼'))
  console.log('test-defense-words passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
