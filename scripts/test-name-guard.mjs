/**
 * 专属称呼守卫：老登只能叫本人，别人一律换成「你」；第三人称提法保留。
 * 离线运行：node scripts/test-name-guard.mjs
 */
import assert from 'node:assert/strict'
import { guardExclusiveNickname } from '../src/nameGuard.js'

const owner = '3308887513'
const g = (text, speakerId) => guardExclusiveNickname(text, { term: '老登', speakerId, ownerUserId: owner })

// 1) 本人发言：原样保留
assert.equal(g('老登今天怎么这么慢', owner), '老登今天怎么这么慢')

// 2) 别人：当面称呼换成「你」
assert.equal(g('老登你要是知道，估计又要吹牛', '111'), '你要是知道，估计又要吹牛')
assert.equal(g('老登，吃了吗', '111'), '你，吃了吗')
assert.equal(g('那个老登别吹了', '111'), '你别吹了')
assert.equal(g('老登呢，怎么不说话', '111'), '你呢，怎么不说话')
// 句尾称呼 / 对方自己喊"老登你好"时不能跟着复读
assert.equal(g('你来啦老登。', '111'), '你来啦。')
assert.equal(g('老登你好呀', '111'), '你好呀')

// 3) 第三人称提法（在说本人）保留
assert.equal(g('你的真老登可能会介意', '111'), '你的真老登可能会介意')
assert.equal(g('老登的脾气你最清楚', '111'), '老登的脾气你最清楚')

// 4) 没有称呼 / 没配置主人 → 原样
assert.equal(g('今天天气不错', '111'), '今天天气不错')
assert.equal(guardExclusiveNickname('老登你好', { term: '老登', speakerId: '111', ownerUserId: '' }), '老登你好')

// 5) 自定义称呼与空文本
assert.equal(guardExclusiveNickname('老大你来了', { term: '老大', speakerId: '111', ownerUserId: owner }), '你来了')
assert.equal(g('', '111'), '')

console.log('test-name-guard passed')
