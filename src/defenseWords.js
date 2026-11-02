/**
 * 守护词库：把"辱骂词"和"指向词"从代码里挪到 data/defense-words.json，
 * 让主人可以在控制台自己增删，保存后立即生效。
 *
 * 词是**字面量**，不是正则：写入时转义，读的时候忽略大小写（英文）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export const DEFAULT_INSULTS = [
  '傻逼', '傻b', '傻比', '傻缺', '脑残', '智障', '弱智', '白痴', '蠢货', '蠢猪',
  '废物', '垃圾东西', '狗东西', '狗杂种', '贱人', '贱种', '畜生', '去死', '滚蛋',
  '滚出去', '尼玛', '妈的死', '操你', '日你', '吃屎', '死全家', 'sb', 'nmsl',
]

export const DEFAULT_ALIASES = ['叫我蟹蟹就好', '蟹蟹', '主人', '老登']

export function defenseWordsFile(dataDir) {
  return path.join(String(dataDir || '.'), 'defense-words.json')
}

export function normalizeWords(list, { max = 300, maxLen = 24, label = '词' } = {}) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    const word = String(item ?? '').trim().slice(0, maxLen)
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
    if (out.length >= max) break
  }
  return out
}

export function loadDefenseWords(dataDir, { fallbackInsults = DEFAULT_INSULTS, fallbackAliases = DEFAULT_ALIASES, logger } = {}) {
  const file = defenseWordsFile(dataDir)
  try {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      const insults = normalizeWords(saved?.insults, { label: '辱骂词' })
      const aliases = normalizeWords(saved?.aliases, { label: '指向词' })
      if (insults.length > 0) {
        return {
          insults,
          aliases: aliases.length > 0 ? aliases : normalizeWords(fallbackAliases, { label: '指向词' }),
          source: 'file',
        }
      }
      logger?.warn?.('守护词库文件里没有有效的辱骂词，暂用默认词库')
    }
  } catch (err) {
    logger?.warn?.(`守护词库读取失败（用默认词库）：${err.message}`)
  }
  return {
    insults: normalizeWords(fallbackInsults, { label: '辱骂词' }),
    aliases: normalizeWords(fallbackAliases, { label: '指向词' }),
    source: 'default',
  }
}

export function saveDefenseWords(dataDir, { insults, aliases } = {}) {
  const cleanInsults = normalizeWords(insults, { label: '辱骂词' })
  const cleanAliases = normalizeWords(aliases, { label: '指向词' })
  if (cleanInsults.length === 0) throw Error('辱骂词不能为空（至少留一个）')
  if (cleanInsults.length > 300) throw Error('辱骂词最多 300 个')
  if (cleanAliases.length > 50) throw Error('指向词最多 50 个')
  const file = defenseWordsFile(dataDir)
  mkdirSync(path.dirname(file), { recursive: true })
  const payload = { version: 1, insults: cleanInsults, aliases: cleanAliases, updatedAt: new Date().toISOString() }
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return { insults: cleanInsults, aliases: cleanAliases }
}

export function compileInsultRegex(insults) {
  const list = normalizeWords(insults, { label: '辱骂词' })
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!list.length) return null
  return new RegExp(list.join('|'), 'i')
}
