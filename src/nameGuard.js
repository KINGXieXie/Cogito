/**
 * 专属称呼守卫：像「老登」这种只属于某一个人的叫法，
 * 当发言者不是那位本人时，把明显"当面称呼"的用法换成「你」。
 *
 * 只动"对着当前说话人喊"的用法（老登你 / 老登， / 那个老登），
 * 保留"真老登""老登的脾气"这类第三人称提法（那是在说本人，不是叫错人）。
 */

export function guardExclusiveNickname(text, { term = '老登', speakerId = '', ownerUserId = '' } = {}) {
  const raw = String(text ?? '')
  if (!term || !raw) return raw
  if (!ownerUserId) return raw // 没配置主人 → 不擅自改称呼
  if (String(speakerId) === String(ownerUserId)) return raw
  if (!raw.includes(term)) return raw

  const t = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = raw
    // 「那个老登」「这位老登」→ 你
    .replace(new RegExp(`(?:那个|这位|这货|那个叫)${t}`, 'g'), '你')
    // 「老登你」/「老登你要是」→ 你
    .replace(new RegExp(`${t}(?=你)`, 'g'), '你')
    // 「老登，」「老登！」「老登 」这类独立称呼（句首或标点后）
    .replace(new RegExp(`(^|[，,。！!？?、~～\\s])${t}(?=[，,。！!？?、~～\\s]|$)`, 'g'), '$1你')
    // 「老登要是 / 老登呢 / 老登啊…」→ 你
    .replace(new RegExp(`${t}(?=要是|呢|啊|呀|吧|在|说|知|想|吃|来|去)`, 'g'), '你')
  // 清理替换后可能出现的别扭组合
  out = out
    .replace(/你你/g, '你')
    .replace(/那个你|这位你|这货你/g, '你')
    .replace(/你(?=你了)/g, '')
  return out
}
