/**
 * 话题追踪：给每张表情包的关键词打分，判断"群里现在在聊什么"。
 *
 * - 每条群消息只记录命中的标签（不是全文），内存很小；
 * - 5 分钟滚动窗口，过期自动清掉；
 * - "强话题" = 至少两个不同的人提到，或同一话题被提到 3 次以上；
 * - 单个人自己连说三句不算强话题（避免一个人刷屏就触发）。
 */
export function createTopicTracker({ windowMs = 5 * 60_000, now = Date.now } = {}) {
  const chats = new Map() // chatKey -> [{ at, userId, hits: Map<tag, Set<keyword>> }]

  function prune(chatKey, at = now()) {
    const list = chats.get(chatKey)
    if (!list) return []
    const kept = list.filter((m) => at - m.at <= windowMs)
    chats.set(chatKey, kept)
    return kept
  }

  /** 记录一条群消息（只存命中的标签与关键词） */
  function observe({ chatKey = '', text = '', userId = '', at = now(), items = [] } = {}) {
    const s = String(text || '')
    if (!s || !chatKey) return
    const hits = new Map()
    for (const item of items) {
      if (!item?.tag) continue
      for (const keyword of item.keywords || []) {
        if (keyword && s.toLowerCase().includes(String(keyword).toLowerCase())) {
          if (!hits.has(item.tag)) hits.set(item.tag, new Set())
          hits.get(item.tag).add(keyword)
        }
      }
    }
    if (!hits.size) return
    const list = prune(chatKey, at)
    list.push({ at, userId: String(userId || ''), hits })
    chats.set(chatKey, list)
  }

  /**
   * 当前窗口内每个标签的强度。
   * @returns {Array<{tag:string, hits:number, speakers:number, strong:boolean, keywords:string[]}>}
   */
  function candidates({ chatKey = '', at = now() } = {}) {
    const list = prune(chatKey, at)
    const byTag = new Map()
    for (const m of list) {
      for (const [tag, keywords] of m.hits) {
        const entry = byTag.get(tag) || { tag, hits: 0, speakers: new Set(), keywords: new Set() }
        entry.hits += 1
        if (m.userId) entry.speakers.add(m.userId)
        for (const k of keywords) entry.keywords.add(k)
        byTag.set(tag, entry)
      }
    }
    return [...byTag.values()]
      .map((e) => ({
        tag: e.tag,
        hits: e.hits,
        speakers: e.speakers.size,
        strong: e.speakers.size >= 2 || e.hits >= 3,
        keywords: [...e.keywords].slice(0, 5),
      }))
      .sort((a, b) => (b.hits + b.speakers * 0.5) - (a.hits + a.speakers * 0.5))
  }

  function clear(chatKey) {
    if (chatKey) chats.delete(chatKey)
    else chats.clear()
  }

  return { observe, candidates, clear, windowMs }
}
