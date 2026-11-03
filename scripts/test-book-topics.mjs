/**
 * 书籍/文学话题识别。
 * 离线运行：node scripts/test-book-topics.mjs
 */
import assert from 'node:assert/strict'
import { isBookTopic } from '../src/bookTopics.js'

assert.equal(isBookTopic('最近在读三体，太好看了'), true)
assert.equal(isBookTopic('你喜欢哪个诗人啊'), true)
assert.equal(isBookTopic('余华那本活着看哭我'), true)
assert.equal(isBookTopic('这本小说结局怎么样'), true)
assert.equal(isBookTopic('今天食堂的饭真难吃'), false)
assert.equal(isBookTopic('帮我写个说明书'), false, '说明书不算文学')
assert.equal(isBookTopic('哈哈'), false)

console.log('test-book-topics passed')
