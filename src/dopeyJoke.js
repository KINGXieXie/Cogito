/**
 * 「呆呆的玩笑」：让人设偶尔不那么一本正经。
 * 不是每条都开玩笑，只按概率在提示词里加一句许可，避免变成固定节目。
 */
export function shouldDopeyJoke({ rate = 0, length = 0, rand = Math.random } = {}) {
  if (!(Number(rate) > 0)) return false
  if (Number(length) < 4) return false
  return rand() < Number(rate)
}

export function dopeyHint() {
  return '\n\n【这次可以"呆"一下（可选）】可以故意把对方的话听岔半拍、或者用很认真的语气接一个错位的梗，开个呆呆的玩笑；别解释、别硬凑、一条里最多一个，不好笑就正常接。'
}
