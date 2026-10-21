/**
 * 语言习惯：实例私有的"怎么说话"设置（口癖、称呼、语气、表情、句子长度）。
 * 它追加在人设之后、机械规则之前——只影响表达方式，不改变身份与事实。
 * 文件放在实例数据目录，不入 Git；控制台编辑后即时生效，不需要重启。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const SPEECH_HABITS_MAX = 4000
export const SPEECH_HABITS_FILE = 'speech-habits.txt'

export function normalizeSpeechHabits(text, max = SPEECH_HABITS_MAX) {
  const s = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim()
  return s.length > max ? s.slice(0, max) : s
}

export function speechHabitsFile(dataDir) {
  return path.join(dataDir, SPEECH_HABITS_FILE)
}

export function readSpeechHabits(dataDir, logger) {
  try {
    const file = speechHabitsFile(dataDir)
    if (!existsSync(file)) return ''
    return normalizeSpeechHabits(readFileSync(file, 'utf8'))
  } catch (err) {
    logger?.warn?.(`语言习惯读取失败：${err.message}`)
    return ''
  }
}

/** 拼进系统提示词的那一段；没有内容时返回空串，不影响原有提示词。 */
export function speechHabitsBlock(text, max = SPEECH_HABITS_MAX) {
  const habits = normalizeSpeechHabits(text, max)
  if (!habits) return ''
  return `\n\n【语言习惯（本实例自定义，优先于人格里的同类描述；只影响说话方式，不改变身份与事实）】\n${habits}`
}
