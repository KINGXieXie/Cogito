/**
 * 回复自检与复读检测：
 * - 自检：让模型只判断"这条回复有没有答到点上"，不通过就重写一次；
 * - 复读：与本会话上一条几乎一样的回复，换一种说法。
 * 都只作用在文字回复上，失败按原回复发送（不因质检把消息吞掉）。
 */

export function normalizeReply(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function bigrams(s) {
  const out = new Set()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  return out
}

/** 两条回复是否"几乎一样"（归一化后相等，或二字片段 Jaccard ≥ threshold） */
export function tooSimilar(a, b, { threshold = 0.9 } = {}) {
  const x = normalizeReply(a)
  const y = normalizeReply(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length < 6 || y.length < 6) return false
  const A = bigrams(x)
  const B = bigrams(y)
  if (!A.size || !B.size) return false
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter) >= threshold
}

/**
 * @returns {Promise<{ok:boolean, reason:string}>} ok=false 表示没答到点上
 * 模型没给出明确判断时按"通过"处理，避免质检把消息吞掉。
 */
export async function checkAnswer({ llm, question = '', reply = '', maxTokens = 40 } = {}) {
  if (!llm || !String(reply).trim()) return { ok: true, reason: '' }
  try {
    const out = String(await llm.chat(
      '你是对话质检员。判断【回复】有没有直接回答或接住【对方的话】，而不是答非所问、自顾自说别的。只输出一行：通过，或 不通过：<十个字以内的原因>。',
      [{ role: 'user', content: `【对方的话】${String(question).slice(0, 300)}\n【回复】${String(reply).slice(0, 300)}` }],
      { maxTokens },
    ) ?? '').trim()
    if (/不通过/.test(out)) {
      const reason = out.replace(/^不通过[:：]?/, '').trim().slice(0, 30) || '答非所问'
      return { ok: false, reason }
    }
    return { ok: true, reason: '' }
  } catch {
    return { ok: true, reason: '' }
  }
}
