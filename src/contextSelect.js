/**
 * 即时上下文的相关性挑选：不再只按"最近 N 条"，而是优先保留
 *  ① 最近一半消息（保证接得上现在的话题）
 *  ② 被引用/当前话题相关的更早消息（按关键词重叠挑 2~3 条）
 *  ③ 当前说话人刚说过的话（保证连贯）
 * 返回的消息仍按时间顺序排列，下游的引用/去重逻辑不用改。
 */
import { tokenize, overlapCount } from './contextTokens.js'

export function selectHistory(messages, { limit = 20, text = '', speaker = '', now = Date.now() } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const cap = Math.max(1, Math.floor(limit))
  if (list.length <= cap) return list

  const keep = new Set()
  const recentCount = Math.min(cap, Math.max(4, Math.ceil(cap * 0.5)))
  for (let i = list.length - recentCount; i < list.length; i++) keep.add(i)

  // ① 关键词相关：从更早的消息里挑最像当前话题的
  const tokens = tokenize(text)
  if (tokens.length) {
    const scored = []
    for (let i = 0; i < list.length; i++) {
      if (keep.has(i)) continue
      const msg = list[i]
      if (!msg || msg.role !== 'user') continue
      const score = overlapCount(tokens, msg.content)
      if (score > 0) scored.push([score, i])
    }
    scored.sort((a, b) => b[0] - a[0] || b[1] - a[1])
    const room = Math.max(0, Math.min(3, cap - keep.size))
    for (const [, i] of scored.slice(0, room)) keep.add(i)
  }

  // ② 当前说话人最近两句：同一人多轮时上下文更连贯
  if (speaker) {
    let added = 0
    for (let i = list.length - 1; i >= 0 && added < 2 && keep.size < cap; i--) {
      if (keep.has(i)) continue
      const msg = list[i]
      if (msg?.role === 'user' && msg.name === speaker) { keep.add(i); added++ }
    }
  }

  // ③ 还有空位就从最近往前补，保证窗口尽量满
  for (let i = list.length - 1; i >= 0 && keep.size < cap; i--) keep.add(i)

  return [...keep].sort((a, b) => a - b).map((i) => list[i])
}

/** 估算选中窗口的"话题年龄"（最早一条距现在多久），给日志/调试用 */
export function windowAgeMs(messages, now = Date.now()) {
  const times = (Array.isArray(messages) ? messages : [])
    .map((m) => Number(m?.time))
    .filter((t) => Number.isFinite(t) && t > 0)
  if (!times.length) return 0
  return Math.max(0, now - Math.min(...times))
}
