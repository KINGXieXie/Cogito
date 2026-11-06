/**
 * 书籍/文学话题识别。
 * 离线运行：node scripts/test-book-topics.mjs
 */
import assert from 'node:assert/strict'
import { isBookTopic } from '../src/bookTopics.js'

// 真的在聊书/文学
assert.equal(isBookTopic('最近在读三体，太好看了'), true)
assert.equal(isBookTopic('你喜欢哪个诗人啊'), true)
assert.equal(isBookTopic('余华那本活着看哭我'), true)
assert.equal(isBookTopic('这本小说结局怎么样'), true)
assert.equal(isBookTopic('有没有什么书单推荐'), true)

// 歧义句不能误判（2026-11 实测它们让日志显得“触发了”，其实聊的是座位和游戏）
assert.equal(isBookTopic('图书馆几楼比较好'), false)
assert.equal(isBookTopic('夜之城没有活着的传奇'), false)
assert.equal(isBookTopic('推理强度不会是off吧'), false)
assert.equal(isBookTopic('你还活着吗'), false)
assert.equal(isBookTopic('今天食堂的饭真难吃'), false)
assert.equal(isBookTopic('帮我写个说明书'), false)
assert.equal(isBookTopic('哈哈'), false)

console.log('test-book-topics passed')
