/**
 * 会话线程摘要：把最近 N 轮"对方说 → 你答"压成一行，单独放进提示词。
 *
 * 为什么需要：群聊刷得快，历史窗口里塞满别人的话，模型容易接着更早的话题答；
 * 焦点块只解决"当前这一句"，线程摘要补上"刚才两三轮在聊什么"。
 *
 * 纯本地、不调用模型；只保留最近 N 轮，每边截断，控制 token。
 */
const CQ_RE = /\[CQ:[^\]]*\]/g

function clean(text) {
  return String(text ?? '')
    .replace(CQ_RE, '')
    .replace(/\[表情[:：][^\]]*\]/g, '')
    .replace(/【[^】]{1,20}】/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createThreadTracker({ maxTurns = 2, maxChars = 50 } = {}) {
  const chats = new Map()

  function listOf(key) {
    let list = chats.get(key)
    if (!list) { list = []; chats.set(key, list) }
    return list
  }

  /** 记录一轮完整对话（对方说了什么、你回了什么） */
  function noteTurn(key, userText, assistantText, at = Date.now()) {
    if (!key) return
    const user = clean(userText).slice(0, maxChars)
    const assistant = clean(assistantText).slice(0, maxChars)
    if (!user && !assistant) return
    const list = listOf(key)
    list.push({ user, assistant, at })
    while (list.length > Math.max(1, maxTurns)) list.shift()
  }

  function summary(key) {
    const list = chats.get(key) || []
    if (!list.length) return ''
    const turns = list
      .filter((t) => t.user || t.assistant)
      .map((t, i) => `${i + 1}) 对方：${t.user || '（略）'} → 你：${t.assistant || '（没回）'}`)
    if (!turns.length) return ''
    return `\n\n【你们刚才在聊（只作参考，别照搬）】${turns.join(' ｜ ')}`
  }

  function clear(key) {
    if (key) chats.delete(key)
    else chats.clear()
  }

  return { noteTurn, summary, clear, maxTurns }
}
