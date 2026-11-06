/**
 * 群内 @ 人：模型写 [at:对方] / [at:名字]，这里换成 QQ 的 CQ @ 码。
 *
 * 安全限制：
 * - 不支持 @全体（除非显式允许）；
 * - 不 @ 机器人自己；
 * - 找不到人就把标记删掉，绝不把 "[at:xxx]" 原样发到群里；
 * - 同一个名字/同一个人只 @ 一次。
 */
const MARK_RE = /\[at\s*[:：]\s*([^\]\n]{1,20})\]/gi

const SELF_WORDS = /^(对方|你|ta|他|她)$/i
const ALL_WORDS = /^(全体|所有人|大家|all)$/i

export function applyMentions(text, { speakerId = '', speakerName = '', members = [], selfId = '', allowAll = false } = {}) {
  const raw = String(text ?? '')
  if (!raw.toLowerCase().includes('[at')) return { text: raw, mentions: [] }
  const seen = new Set()
  const mentions = []
  const push = (id) => {
    const key = String(id)
    if (!key || key === String(selfId) || seen.has(key)) return ''
    seen.add(key)
    mentions.push(key)
    return `[CQ:at,qq=${key}] `
  }
  let out = raw.replace(MARK_RE, (_, value) => {
    const target = String(value || '').trim()
    if (!target) return ''
    if (SELF_WORDS.test(target)) return push(speakerId) || (speakerName ? `${speakerName} ` : '')
    if (ALL_WORDS.test(target)) return allowAll ? push('all') : ''
    const hit = (members || []).find((m) =>
      String(m?.user_id) === target ||
      String(m?.card || '').includes(target) ||
      String(m?.nickname || '').includes(target))
    return hit ? push(hit.user_id) : ''
  })
  // 清理标记删掉后可能留下的多余空格/空行
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, mentions }
}
