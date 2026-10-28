/**
 * 表情包：模型在回复末尾写 `[表情:标签]`，这里把它换成真图片发出去。
 *
 * 目录：data/stickers/
 *   manifest.json: { "文件或标签.png": { "tag": "开心", "desc": "适合什么场合" } }
 *   图片文件：png / jpg / gif / webp
 * 没有 manifest 时用文件名当标签（如 `抱抱_猫.png` → 标签"抱抱"）。
 * 发送用 base64（OneBot 标准），不依赖 NapCat 能否读到本地路径。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i
const MARK_RE = /[\[【]\s*(?:表情包?|sticker)\s*[:：]\s*([^\]】\n]{1,12})\s*[\]】]/gi
const MAX_SEND_BYTES = 3 * 1024 * 1024

export function stickerDir(dataDir) {
  return path.join(String(dataDir || '.'), 'stickers')
}

export function loadStickers(dataDir, logger) {
  const dir = stickerDir(dataDir)
  if (!existsSync(dir)) return []
  let manifest = {}
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    if (!manifest || typeof manifest !== 'object') manifest = {}
  } catch (err) {
    if (!/ENOENT/.test(err.message)) logger?.warn?.(`表情包清单读取失败（用文件名当标签）：${err.message}`)
  }
  const items = []
  for (const file of readdirSync(dir)) {
    if (!IMAGE_RE.test(file)) continue
    const full = path.join(dir, file)
    const base = file.replace(IMAGE_RE, '')
    const meta = manifest[file] || manifest[base] || {}
    items.push({
      file: full,
      name: file,
      tag: String(meta.tag || meta.name || base.split(/[_\-—\s]/)[0] || base).slice(0, 12),
      desc: String(meta.desc || '').slice(0, 40),
    })
  }
  return items
}

/** 给提示词用的简短目录：只列标签，不列文件 */
export function stickerHint(items, { maxTags = 12 } = {}) {
  const tags = [...new Set((items || []).map((i) => i.tag).filter(Boolean))]
  if (!tags.length) return ''
  const listed = tags.slice(0, maxTags)
  return `\n\n【表情包（可选，不是每次都用）】你收藏的表情包：${listed.join('、')}。遇到明显的情绪——笑出来、无语、震惊、想安慰人、困了饿了——可以在回复最后单独一行写 [表情:标签]（标签从上面选一个，一条回复最多一个），系统会换成图片发出去。这是聊天，不用太拘着；但正经解释、长句子、别人在说正事时别发，同一段对话也别连着发。不想发就不写，正文照常。`
}

/** 从回复里取出表情标记；返回去掉标记后的正文与选中的表情包 */
export function extractSticker(text, items, rand = Math.random) {
  const raw = String(text ?? '')
  const matches = [...raw.matchAll(MARK_RE)]
  if (!matches.length) return { text: raw, sticker: null }
  const cleaned = raw
    .replace(MARK_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!items?.length) return { text: cleaned, sticker: null }
  for (const m of matches) {
    const tag = String(m[1] || '').trim()
    if (!tag) continue
    const exact = items.filter((i) => i.tag === tag || i.name.replace(IMAGE_RE, '') === tag)
    const fuzzy = exact.length
      ? exact
      : items.filter((i) => i.tag.includes(tag) || tag.includes(i.tag))
    if (fuzzy.length) {
      const pick = fuzzy[Math.min(fuzzy.length - 1, Math.floor(rand() * fuzzy.length))]
      return { text: cleaned, sticker: pick }
    }
  }
  return { text: cleaned, sticker: null }
}

/** 组装成 OneBot 的图片 CQ 码（base64，避免路径/转义问题）；超大的图不发送 */
export function stickerCq(file) {
  try {
    const buf = readFileSync(file)
    if (!buf.length || buf.length > MAX_SEND_BYTES) return ''
    return `[CQ:image,file=base64://${buf.toString('base64')}]`
  } catch {
    return ''
  }
}

export function stickerTagList(items, { max = 40 } = {}) {
  return [...new Set((items || []).map((i) => i.tag).filter(Boolean))].slice(0, max)
}

// 用户这句话里的情绪 → 想要的表情包标签（按顺序匹配，先到先得）
const EMOTION_RULES = [
  { tag: '震惊', re: /震惊|卧槽|我靠|真的假的|吓死|恐怖|可怕|wtf|惊了/i },
  { tag: '无语', re: /无语|绷不住|服了|无语子|算了吧|又来了|醉了|离谱|难绷/ },
  { tag: '抱抱', re: /难过|委屈|想哭|哭了|难受|抱抱|安慰|伤心|崩溃|要命|救命|写不完|做不完|坏了/ },
  { tag: '困困', re: /好困|困死|想睡|熬夜|睡不着|没精神|眼皮|累了|好累/ },
  { tag: '饿了', re: /饿了|好饿|想吃|馋|夜宵|外卖|饭点|干饭/ },
  { tag: '开心', re: /笑死|哈哈|嘿嘿|开心|高兴|太好了|好耶|爽|乐死|笑不活/ },
]

/** 从用户消息里识别情绪，返回库里确实存在的标签（没有就返回 null） */
export function matchEmotionTag(text, items) {
  const s = String(text ?? '')
  if (!s || !items?.length) return null
  for (const rule of EMOTION_RULES) {
    if (!rule.re.test(s)) continue
    const hit = items.find((i) => i.tag === rule.tag || i.tag.includes(rule.tag) || rule.tag.includes(i.tag))
    if (hit) return hit.tag
  }
  return null
}

/** 按标签取一张图（模糊匹配） */
export function findStickerByTag(items, tag, rand = Math.random) {
  const list = (items || []).filter((i) => i.tag === tag || i.tag.includes(tag) || tag.includes(i.tag))
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}
