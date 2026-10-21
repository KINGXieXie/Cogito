/**
 * 语言习惯（控制台「语言习惯」页）的离线回归：规范化、提示词注入位置、空值不影响原提示词。
 * 离线运行：node scripts/test-speech-habits.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizeSpeechHabits, readSpeechHabits, speechHabitsBlock, speechHabitsFile, SPEECH_HABITS_MAX } from '../src/speechHabits.js'
import { createChatPromptBuilder } from '../src/chatPrompt.js'
import { conversationRules } from '../src/conversationRules.js'

// 1) 规范化：去首尾空白、统一换行、超长截断
assert.equal(normalizeSpeechHabits('  - 常用"诶"开头  \r\n- 一次最多两句  '), '- 常用"诶"开头\n- 一次最多两句')
assert.equal(normalizeSpeechHabits(undefined), '')
assert.equal(normalizeSpeechHabits('字'.repeat(SPEECH_HABITS_MAX + 10)).length, SPEECH_HABITS_MAX)

// 2) 空内容不拼任何东西，有内容才加标题
assert.equal(speechHabitsBlock(''), '')
assert.equal(speechHabitsBlock('   '), '')
assert.ok(speechHabitsBlock('- 句尾带 awa').includes('语言习惯'))
assert.ok(speechHabitsBlock('- 句尾带 awa').includes('- 句尾带 awa'))

// 3) 从实例数据目录读取；没有文件时返回空串
const dir = mkdtempSync(path.join(tmpdir(), 'cogito-habits-'))
try {
  assert.equal(readSpeechHabits(dir), '')
  writeFileSync(speechHabitsFile(dir), '- 称呼他为"老登"\n', 'utf8')
  assert.equal(readSpeechHabits(dir), '- 称呼他为"老登"')
  assert.ok(readFileSync(speechHabitsFile(dir), 'utf8').includes('老登'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// 4) 提示词顺序：人格 → 语言习惯 → 长期记忆 → 系统附加说明
const longMemory = { get: () => '旧记忆片段' }
const config = { persona: '你是测试角色，说话慢。', speechHabits: '- 句尾带 awa', longMemoryEnabled: true, botName: 'Cogito' }
const build = createChatPromptBuilder({ config, longMemory })
const prompt = build({ chatKey: 'g1' })
const iPersona = prompt.indexOf('说话慢')
const iHabits = prompt.indexOf('语言习惯')
const iMemory = prompt.indexOf('旧记忆片段')
const iAppendix = prompt.indexOf('系统附加说明')
assert.ok(iPersona >= 0 && iHabits > iPersona, '语言习惯要跟在人设之后')
assert.ok(iMemory > iHabits, '长期记忆在语言习惯之后')
assert.ok(iAppendix > iMemory, '系统附加说明仍在最后')

// 5) 未填语言习惯时，提示词与原来一致（不产生多余人设污染）
const plain = createChatPromptBuilder({ config: { ...config, speechHabits: '' }, longMemory })
assert.ok(!plain({ chatKey: 'g1' }).includes('语言习惯'))

// 6) 语言习惯不会写进机械规则里，避免和长度/格式规则互相打架
config.speechHabits = '- 句尾带 awa'
assert.ok(!conversationRules(config).includes('句尾带 awa'))

console.log('test-speech-habits passed')
