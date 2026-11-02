/**
 * 群内守护：有人针对主人（OWNER_USER_ID）反复言语冒犯时，
 * 机器人先出声维护；同一个人再犯就禁言一小段时间。
 *
 * 设计原则（避免误伤和滥用）：
 * - 必须是"指向主人"（@、昵称、引用主人的消息）+ 明确的辱骂词，两个条件都满足才进入判断；
 * - 进入判断后还有一次极短的模型确认（可关），模型说不是辱骂就不动；
 * - 管理员/白名单成员只维护、不禁言；
 * - 计数按"窗口"衰减（默认 7 天），改了就是改了；
 * - 每一次动作都写 data/defense-log.jsonl，方便回查。
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from './stateFile.js'
import { compileInsultRegex, normalizeWords, DEFAULT_INSULTS, DEFAULT_ALIASES } from './defenseWords.js'

export const DEFAULT_DEFENSE_ALIASES = DEFAULT_ALIASES

/** 默认词库的纯函数版（测试/兼容用） */
export function hasInsult(text, insults = DEFAULT_INSULTS) {
  const re = compileInsultRegex(insults)
  return re ? re.test(String(text ?? '')) : false
}

function atOwner(evt, ownerId) {
  const segments = Array.isArray(evt?.message) ? evt.message : []
  if (segments.some((s) => s?.type === 'at' && String(s?.data?.qq) === String(ownerId))) return true
  const raw = String(evt?.raw_message ?? '')
  return new RegExp(`\\[CQ:at,qq=${ownerId}(\\]|,)`).test(raw)
}

/** 这条消息是否指向主人（@主人 / 文本里出现专属称呼 / 引用了主人的消息） */
export function targetsOwner(evt, parsed, { ownerId = '', aliases = DEFAULT_DEFENSE_ALIASES, quoted } = {}) {
  if (!ownerId) return false
  if (atOwner(evt, ownerId)) return true
  const text = String(parsed?.text ?? '')
  if (aliases.some((a) => a && text.includes(a))) return true
  const quotedAuthor = quoted?.authorId ?? quoted?.user_id ?? quoted?.message?.sender?.user_id
  return Boolean(quotedAuthor && String(quotedAuthor) === String(ownerId))
}

export function pickDefenseLine(strikes = 1, rand = Math.random) {
  const first = [
    '唔……你别这么说他。',
    '（小声）……那个，能不能不要这样说他。',
    '……我不太喜欢听这种话。',
    '喂，别这样讲话嘛。',
  ]
  const again = [
    '唔……我刚刚已经说过了。',
    '（认真）……我说了，不要这样说他。',
    '你这已经是第二次了呀，别再说了。',
  ]
  const list = strikes <= 1 ? first : again
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

export function createDefenseGuard({ dataDir, config = {}, words = null, logger, now = Date.now } = {}) {
  const enabled = config.defenseEnabled !== false
  const muteSeconds = Math.max(10, Math.min(3600, config.defenseMuteSeconds || 120))
  const windowMs = Math.max(60_000, config.defenseWindowMs || 7 * 86400000)
  const whitelist = new Set((config.defenseWhitelist || []).map(String))
  const stateFile = dataDir ? path.join(String(dataDir), 'defense-state.json') : null
  const logFile = dataDir ? path.join(String(dataDir), 'defense-log.jsonl') : null
  // 词库：可被控制台热更新（setWords），不用重启
  let insults = normalizeWords(words?.insults?.length ? words.insults : DEFAULT_INSULTS, { label: '辱骂词' })
  let aliases = normalizeWords(words?.aliases?.length ? words.aliases : DEFAULT_ALIASES, { label: '指向词' })
  let insultRe = compileInsultRegex(insults)
  let state = { version: 1, members: {} }
  const recent = []

  try {
    if (stateFile && existsSync(stateFile)) {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (saved && typeof saved.members === 'object') state = { version: 1, members: saved.members }
    }
  } catch (err) { logger?.warn?.(`守护记录读取失败：${err.message}`) }

  function save() {
    if (!stateFile) return
    try { writeJsonAtomic(stateFile, state) } catch (err) { logger?.warn?.(`守护记录保存失败：${err.message}`) }
  }

  function appendLog(entry) {
    recent.push(entry)
    if (recent.length > 50) recent.shift()
    if (!logFile) return
    try {
      mkdirSync(path.dirname(logFile), { recursive: true })
      appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8')
    } catch { /* 日志写不进去不影响主流程 */ }
  }

  /** @returns {{action:'ignore'|'warn'|'mute', strikes:number, muteSeconds:number, reason:string}} */
  function evaluate({ groupId = '', userId = '', text = '', isProtected = false } = {}) {
    if (!enabled) return { action: 'ignore', strikes: 0, muteSeconds: 0, reason: 'disabled' }
    const key = `${Number(groupId)}:${Number(userId)}`
    const entry = state.members[key] || { strikes: 0, lastAt: 0, mutedAt: 0 }
    if (now() - Number(entry.lastAt || 0) > windowMs) entry.strikes = 0
    entry.strikes = Number(entry.strikes || 0) + 1
    entry.lastAt = now()
    state.members[key] = entry
    save()

    const admin = isProtected || whitelist.has(String(userId))
    const action = admin || entry.strikes <= 1 ? 'warn' : 'mute'
    if (action === 'mute') entry.mutedAt = now()
    const result = { action, strikes: entry.strikes, muteSeconds: action === 'mute' ? muteSeconds : 0, reason: admin ? 'protected' : 'strike' }
    appendLog({ at: now(), groupId: Number(groupId), userId: Number(userId), action, strikes: entry.strikes, protected: admin, text: String(text).slice(0, 120) })
    logger?.info?.(`[守护] 群 ${groupId} 用户 ${userId} 第 ${entry.strikes} 次冒犯：${action}${admin ? '（受保护，只提醒）' : ''}`)
    return result
  }

  function reset({ groupId, userId } = {}) {
    if (groupId != null && userId != null) delete state.members[`${Number(groupId)}:${Number(userId)}`]
    else state.members = {}
    save()
  }

  /** 控制台保存词库后热更新：立即影响后续判定 */
  function setWords({ insults: nextInsults, aliases: nextAliases } = {}) {
    if (Array.isArray(nextInsults) && nextInsults.length) {
      insults = normalizeWords(nextInsults, { label: '辱骂词' })
      insultRe = compileInsultRegex(insults)
    }
    if (Array.isArray(nextAliases)) aliases = normalizeWords(nextAliases, { label: '指向词' })
    logger?.info?.(`[守护] 词库已更新：辱骂词 ${insults.length} 个、指向词 ${aliases.length} 个`)
    return wordsView()
  }

  function wordsView() {
    return { insults: insults.slice(), aliases: aliases.slice(), hasInsult: (text) => (insultRe ? insultRe.test(String(text ?? '')) : false) }
  }

  function stateView() {
    const members = Object.entries(state.members).map(([key, v]) => {
      const [groupId, userId] = key.split(':')
      return { groupId: Number(groupId), userId: Number(userId), strikes: Number(v.strikes || 0), lastAt: Number(v.lastAt || 0), mutedAt: Number(v.mutedAt || 0) }
    })
    return { enabled, muteSeconds, windowMs, members, recent: recent.slice(-10) }
  }

  return { enabled, evaluate, reset, state: stateView, muteSeconds, windowMs, setWords, words: wordsView, aliases: () => aliases.slice(), hasInsult: (text) => (insultRe ? insultRe.test(String(text ?? '')) : false) }
}
