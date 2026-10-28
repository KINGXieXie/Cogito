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
  return `\n\n【表情包（可选，不是必须）】你收藏的表情包标签：${listed.join('、')}。只有情绪很对的时候才用：在回复的最后单独加一行 \`[表情:标签]\`（标签必须来自上面的列表，一条回复最多一个），系统会换成图片发出去。正经答题、长句子、别人在说正事时不要发；同一段对话里不要连着发。`
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
