/**
 * 表情包调度：决定"这条消息要不要发图、发哪张"。
 * 与回复逻辑解耦：调用方只负责告诉它"现在有没有回复要发"（mode=attach/standalone）。
 *
 * 防刷规则：
 * - 同一个会话：两条表情包最小间隔、每小时上限；
 * - 同一张图：一段时间内不重复；
 * - 同一个标签：一段时间内最多 N 次；
 * - 单独发（没有文字回复时）还需要"强话题"和概率命中，避免自言自语刷图。
 */
export function createStickerScheduler({ config = {}, logger, now = Date.now } = {}) {
  const minGapMs = Math.max(0, config.stickerMinGapMs ?? 180_000)
  const perHour = Math.max(0, config.stickerPerHour ?? config.stickerMaxPerHour ?? 6)
  const sameImageMs = Math.max(0, config.stickerSameImageMs ?? 30 * 60_000)
  const tagWindowMs = Math.max(0, config.stickerTagWindowMs ?? 10 * 60_000)
  const tagMax = Math.max(1, config.stickerTagMax ?? 2)
  const standaloneRate = Math.min(1, Math.max(0, config.stickerStandaloneRate ?? 0.1))
  const chats = new Map() // chatKey -> { times:number[], byImage:Map, byTag:Map }

  function stateOf(chatKey) {
    let s = chats.get(chatKey)
    if (!s) {
      s = { times: [], byImage: new Map(), byTag: new Map() }
      chats.set(chatKey, s)
    }
    return s
  }

  function prune(s, at) {
    s.times = s.times.filter((t) => at - t < 3_600_000)
    for (const [k, t] of s.byImage) if (at - t > sameImageMs) s.byImage.delete(k)
    for (const [tag, list] of s.byTag) {
      const kept = list.filter((t) => at - t < tagWindowMs)
      if (kept.length) s.byTag.set(tag, kept)
      else s.byTag.delete(tag)
    }
  }

  function chatLimit(chatKey, at) {
    const s = stateOf(chatKey)
    prune(s, at)
    const last = s.times[s.times.length - 1] || 0
    if (minGapMs && at - last < minGapMs) return { ok: false, reason: 'min-gap' }
    if (perHour && s.times.length >= perHour) return { ok: false, reason: 'hour-cap' }
    return { ok: true, reason: '' }
  }

  /**
   * @param candidates 来自 topicTracker.candidates()：{tag,hits,speakers,strong}
   * @param mode 'attach'（跟文字一起）| 'standalone'（单独发）
   * @returns {{item:object, tag:string, score:number, strong:boolean} | null}
   */
  function pick({ chatKey = '', items = [], candidates = [], mode = 'attach', at = now(), rand = Math.random } = {}) {
    const limit = chatLimit(chatKey, at)
    if (!limit.ok) return null
    const s = stateOf(chatKey)
    const byTag = new Map(candidates.map((c) => [c.tag, c]))
    const pool = []
    for (const item of items) {
      const cand = byTag.get(item.tag)
      if (!cand) continue
      if (mode === 'standalone' && item.allowStandalone === false) continue
      if (s.byImage.has(item.name)) continue
      if ((s.byTag.get(item.tag) || []).length >= tagMax) continue
      const score = cand.hits + cand.speakers * 0.5 + (Number(item.weight) || 1) * 0.3 - (mode === 'standalone' ? 0.4 : 0)
      pool.push({ item, tag: item.tag, score, strong: cand.strong })
    }
    if (!pool.length) return null
    if (mode === 'standalone') {
      if (!pool.some((p) => p.strong)) return null
      if (rand() >= standaloneRate) return null
      const strong = pool.filter((p) => p.strong)
      strong.sort((a, b) => b.score - a.score)
      return strong[Math.min(strong.length - 1, Math.floor(rand() * Math.min(3, strong.length)))]
    }
    pool.sort((a, b) => b.score - a.score)
    return pool[Math.min(pool.length - 1, Math.floor(rand() * Math.min(3, pool.length)))]
  }

  function remember(chatKey, item, at = now()) {
    if (!item) return
    const s = stateOf(chatKey)
    s.times.push(at)
    prune(s, at)
    s.byImage.set(item.name, at)
    const list = s.byTag.get(item.tag) || []
    list.push(at)
    s.byTag.set(item.tag, list)
    logger?.debug?.(`[表情包] 调度记录：${chatKey} → ${item.tag}(${item.name})`)
  }

  function state(chatKey = '') {
    if (chatKey) {
      const s = stateOf(chatKey)
      return { lastAt: s.times[s.times.length - 1] || 0, sentLastHour: s.times.length }
    }
    return { chats: chats.size }
  }

  return { pick, remember, chatLimit, state, minGapMs, perHour, sameImageMs, tagWindowMs, tagMax, standaloneRate }
}
