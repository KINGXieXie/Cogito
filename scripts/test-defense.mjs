/**
 * 群内守护：辱骂识别、指向判断、第一次维护/第二次禁言、受保护成员、窗口衰减、重置、日志。
 * 离线运行：node scripts/test-defense.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hasInsult, targetsOwner, pickDefenseLine, createDefenseGuard } from '../src/defense.js'

// 1) 辱骂词识别：明确攻击词命中，普通吐槽不命中
assert.equal(hasInsult('你个傻逼'), true)
assert.equal(hasInsult('你是不是脑残啊'), true)
assert.equal(hasInsult('滚出去'), true)
assert.equal(hasInsult('这道题好难啊'), false)
assert.equal(hasInsult('你真是个笨蛋'), false, '“笨蛋”不在硬名单里，避免误伤玩笑')

// 2) 指向主人：@ / 昵称 / 引用作者
const owner = '3308887513'
const aliases = ['叫我蟹蟹就好', '蟹蟹', '老登']
assert.equal(targetsOwner({ message: [{ type: 'at', data: { qq: owner } }] }, { text: '你说啥' }, { ownerId: owner, aliases }), true)
assert.equal(targetsOwner({ message: [] }, { text: '叫他蟹蟹就好' }, { ownerId: owner, aliases }), true)
assert.equal(targetsOwner({ message: [] }, { text: '今天好累' }, { ownerId: owner, aliases }), false)
assert.equal(targetsOwner({ message: [] }, { text: '蟹蟹' }, { ownerId: '', aliases }), false, '没配置主人时不启用')

// 3) 维护话术随次数变化
assert.notEqual(pickDefenseLine(1, () => 0), pickDefenseLine(3, () => 0))

// 4) 状态机：第一次警告、第二次禁言 2 分钟、受保护只警告、窗口过期重新累计
const dir = mkdtempSync(path.join(tmpdir(), 'cogito-defense-'))
let clock = 1_700_000_000_000
const logger = { info() {}, warn() {} }
try {
  const guard = createDefenseGuard({
    dataDir: dir,
    config: { defenseEnabled: true, defenseMuteSeconds: 120, defenseWindowMs: 7 * 86400000, defenseWhitelist: ['999'] },
    logger,
    now: () => clock,
  })
  const first = guard.evaluate({ groupId: 1, userId: 555, text: '你个傻逼' })
  assert.deepEqual([first.action, first.strikes, first.muteSeconds], ['warn', 1, 0])
  const second = guard.evaluate({ groupId: 1, userId: 555, text: '再说一次傻逼' })
  assert.deepEqual([second.action, second.strikes, second.muteSeconds], ['mute', 2, 120])

  // 受保护成员：永远只警告
  guard.evaluate({ groupId: 1, userId: 999, text: '傻逼' })
  const protectedAgain = guard.evaluate({ groupId: 1, userId: 999, text: '傻逼' })
  assert.equal(protectedAgain.action, 'warn')

  // 窗口外的旧记录不计入
  clock += 8 * 86400000
  const afterWindow = guard.evaluate({ groupId: 1, userId: 555, text: '傻逼' })
  assert.equal(afterWindow.strikes, 1)
  assert.equal(afterWindow.action, 'warn')

  // 日志落盘 + 状态可读
  assert.ok(existsSync(path.join(dir, 'defense-log.jsonl')))
  const lines = readFileSync(path.join(dir, 'defense-log.jsonl'), 'utf8').trim().split('\n')
  assert.ok(lines.length >= 4)
  assert.equal(guard.state().enabled, true)
  assert.ok(guard.state().members.some((m) => m.userId === 555))

  // 重置
  guard.reset({})
  assert.equal(guard.state().members.length, 0)

  // 关闭开关：不动作
  const off = createDefenseGuard({ dataDir: dir, config: { defenseEnabled: false }, logger, now: () => clock })
  assert.equal(off.evaluate({ groupId: 1, userId: 555, text: '傻逼' }).action, 'ignore')

  console.log('test-defense passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
