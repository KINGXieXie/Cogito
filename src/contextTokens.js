/**
 * 中文/英文混排的分词：中文按 2 字切分（bigram），英文/数字按词切分。
 * 只做检索用的粗粒度切分，不引入分词库，保证零依赖。
 */

// 高频虚词组合，命中它们并不能说明"在聊同一件事"，反而会让所有消息看起来都相关
const STOP = new Set([
  '我们', '你们', '他们', '她们', '自己', '这个', '那个', '这些', '那些', '什么',
  '就是', '但是', '然后', '所以', '因为', '如果', '可以', '没有', '一个', '现在',
  '还是', '已经', '感觉', '觉得', '时候', '不是', '真的', '好像', '有点', '怎么',
])

export function tokenize(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/\[图片[^\]]*\]/g, ' ')
    .replace(/\[图片\]/g, ' ')
    .replace(/@\d+/g, ' ')
  const tokens = new Set()
  for (const word of s.match(/[a-z0-9_][a-z0-9_-]{1,}/g) || []) {
    if (word.length >= 2) tokens.add(word)
  }
  for (const run of s.match(/[\u4e00-\u9fa5]+/g) || []) {
    for (let i = 0; i + 1 < run.length; i++) {
      const gram = run.slice(i, i + 2)
      if (!STOP.has(gram)) tokens.add(gram)
    }
  }
  return [...tokens]
}

/** 两段文本共有的检索词数量（用于"这条旧消息和当前话题像不像"） */
export function overlapCount(tokensA, textB) {
  if (!tokensA?.length) return 0
  const b = new Set(tokenize(textB))
  let n = 0
  for (const t of tokensA) if (b.has(t)) n++
  return n
}

/**
 * 旧事检索专用：中文按 3 字切分、英文/数字按词（≥3 字）。
 * 比 2 字更"挑"，能避开"就上""说的"这种到处都是、却不说明在聊什么的组合。
 */
export function tokenizeTrigrams(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/\[图片[^\]]*\]/g, ' ')
    .replace(/\[图片\]/g, ' ')
    .replace(/@\d+/g, ' ')
  const tokens = new Set()
  for (const word of s.match(/[a-z0-9_][a-z0-9_-]{2,}/g) || []) tokens.add(word)
  for (const run of s.match(/[\u4e00-\u9fa5]+/g) || []) {
    for (let i = 0; i + 2 < run.length; i++) {
      tokens.add(run.slice(i, i + 3))
    }
  }
  return [...tokens]
}
