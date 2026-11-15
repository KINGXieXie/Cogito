/**
 * 语气分级 + 情绪镜像：纯规则，零额外调用。
 *
 * 语气分级：老板/管理员/熟人/陌生人，四档不同亲密度；
 * 情绪镜像：对方在气头上/着急/低落/兴奋时，先贴情绪再说话。
 */
const EMOTION_RULES = [
  { label: 'anger', re: /气死|烦死|恶心|滚|妈的|她妈|操|怒了|无语|离谱|生气|受不了/ },
  { label: 'anxiety', re: /救命|急死|怎么办|完了|崩了|来不及|慌|糟糕|糟了/ },
  { label: 'sad', re: /难过|好累|心累|哭了|委屈|emo|丧|难受|疼|想哭/ },
  { label: 'happy', re: /哈哈|开心|太好了|好耶|爽|笑死|耶！|棒/ },
]

export function detectEmotion(text) {
  const s = String(text ?? '')
  for (const rule of EMOTION_RULES) if (rule.re.test(s)) return rule.label
  return ''
}

export function classifyTier({ userId, senderRole = '', ownerUserId = '', seenCount = 0, familiarMin = 4 } = {}) {
  const id = String(userId ?? '')
  if (ownerUserId && id === String(ownerUserId)) return 'owner'
  if (senderRole === 'owner' || senderRole === 'admin') return 'admin'
  if (Number(seenCount) >= Math.max(1, Number(familiarMin) || 4)) return 'familiar'
  return 'stranger'
}

const TIER_LINES = {
  owner: '他对你是最亲近的：可以自然撒娇、损他两句、喊他蟹蟹；别腻过头，也别每句都黏。',
  admin: '对方是群管理：客气、留分寸，别撒娇、别乱开玩笑。',
  familiar: '是聊过几次的熟人：可以随意一点、开点小玩笑，不用太客气。',
  stranger: '对方不太熟/是新面孔：礼貌、收敛，别一上来就套近乎。',
}

const EMOTION_LINES = {
  anger: '对方正在气头上：先短、先接住情绪，别讲道理、别嬉皮笑脸。',
  anxiety: '对方有点急：直接给办法或安抚，一两句，别绕。',
  sad: '对方情绪低：软一点，先陪着，别急着分析。',
  happy: '对方很开心：跟着高兴，可以捧一句，别泼冷水。',
}

export function toneHint({ tier = 'stranger', emotion = '' } = {}) {
  const lines = [TIER_LINES[tier] || TIER_LINES.stranger]
  if (emotion && EMOTION_LINES[emotion]) lines.push(EMOTION_LINES[emotion])
  return `\n\n【说话对象与当下情绪（只影响语气，不要说出来）】${lines.join(' ')}`
}
