/**
 * 短消息跳过长期记忆：省 input token，但不影响"上次/记得"这类提问。
 * 离线运行：node scripts/test-memory-inject.mjs
 */
import assert from 'node:assert/strict'
import { createChatPromptBuilder } from '../src/chatPrompt.js'

const config = {
  persona: '测试人设', speechHabits: '', exclusiveNickname: '', ownerUserId: '', ownerName: '',
  longMemoryEnabled: true, memorySkipBelowChars: 8,
}
const longMemory = { get: () => '旧事：群友上周说要去四平那家小馆子' }
const build = createChatPromptBuilder({ config, longMemory })

// 1) 群聊短句：不注入
assert.equal(build({ chatKey: 'g1', query: '哈哈哈' }).includes('旧事'), false)
assert.equal(build({ chatKey: 'g1', query: '在吗' }).includes('旧事'), false)

// 2) 正常长度的群聊：注入
assert.equal(build({ chatKey: 'g1', query: '今天食堂的饭真的太难吃了' }).includes('旧事'), true)

// 3) 短句但提到旧事：仍然注入
assert.equal(build({ chatKey: 'g1', query: '上次那个？' }).includes('旧事'), true)

// 4) 私聊短句：照常注入
assert.equal(build({ chatKey: 'p1', query: '在吗' }).includes('旧事'), true)

// 5) 关闭跳过（0）：短句也注入
const noSkip = createChatPromptBuilder({ config: { ...config, memorySkipBelowChars: 0 }, longMemory })
assert.equal(noSkip({ chatKey: 'g1', query: '哈哈哈' }).includes('旧事'), true)

console.log('test-memory-inject passed')
