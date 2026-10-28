/**
 * 表情包库的文件操作（控制台用）：列表、上传、改标签、删除。
 * 目录与命名规则和 src/stickers.js 一致：data/stickers/<file> + manifest.json。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadStickers, stickerDir } from './stickers.js'

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
const MAX_BYTES = 2 * 1024 * 1024
const NAME_RE = /[^\w\u4e00-\u9fa5()\-— .[\]]/g

function manifestFile(dataDir) {
  return path.join(stickerDir(dataDir), 'manifest.json')
}

export function readManifest(dataDir) {
  try {
    const m = JSON.parse(readFileSync(manifestFile(dataDir), 'utf8'))
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
  } catch {
    return {}
  }
}

export function writeManifest(dataDir, manifest) {
  mkdirSync(stickerDir(dataDir), { recursive: true })
  writeFileSync(manifestFile(dataDir), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function safeName(input) {
  const raw = String(input || '').replace(/\\/g, '/').split('/').pop()
  const cleaned = raw.replace(NAME_RE, '').trim().slice(0, 80)
  const ext = path.extname(cleaned).toLowerCase()
  if (!cleaned || !IMAGE_EXT.includes(ext)) return ''
  return cleaned
}

function uniqueName(dataDir, name) {
  const dir = stickerDir(dataDir)
  if (!existsSync(path.join(dir, name))) return name
  const ext = path.extname(name)
  const base = name.slice(0, -ext.length)
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}_${i}${ext}`
    if (!existsSync(path.join(dir, candidate))) return candidate
  }
  return `${base}_${Date.now()}${ext}`
}

function looksLikeImage(buf) {
  if (buf.length < 12) return false
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true // png
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true // jpg
  if (buf.toString('ascii', 0, 4) === 'GIF8') return true // gif
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true // webp
  return false
}

export function listStickers(dataDir, logger) {
  const dir = stickerDir(dataDir)
  if (!existsSync(dir)) return []
  return loadStickers(dataDir, logger).map((item) => {
    let size = 0
    let mtime = 0
    try {
      const st = statSync(item.file)
      size = st.size
      mtime = st.mtimeMs
    } catch { /* 文件刚好被删 */ }
    return { name: item.name, tag: item.tag, desc: item.desc, size, mtime }
  })
}

/** 上传：data 是 base64（可带 data:image/png;base64, 前缀） */
export function saveSticker({ dataDir, name, data, tag, logger }) {
  const safe = safeName(name)
  if (!safe) throw Error('文件名不合法（只支持 png/jpg/gif/webp）')
  const base64 = String(data || '').replace(/^data:[^;]+;base64,/, '')
  if (!base64) throw Error('没有收到图片数据')
  const buf = Buffer.from(base64, 'base64')
  if (!buf.length) throw Error('图片数据为空')
  if (buf.length > MAX_BYTES) throw Error(`图片太大（${(buf.length / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_BYTES / 1024 / 1024}MB）`)
  if (!looksLikeImage(buf)) throw Error('文件内容不像图片（png/jpg/gif/webp）')
  mkdirSync(stickerDir(dataDir), { recursive: true })
  const finalName = uniqueName(dataDir, safe)
  writeFileSync(path.join(stickerDir(dataDir), finalName), buf)
  const manifest = readManifest(dataDir)
  const base = finalName.replace(/\.[^.]+$/, '')
  manifest[finalName] = {
    tag: String(tag || manifest[finalName]?.tag || base.split(/[_\-—\s]/)[0] || base).slice(0, 12),
    desc: String(manifest[finalName]?.desc || '').slice(0, 40),
  }
  writeManifest(dataDir, manifest)
  logger?.info?.(`[表情包] 已添加：${finalName}（${(buf.length / 1024).toFixed(0)}KB）`)
  return { name: finalName, tag: manifest[finalName].tag, desc: manifest[finalName].desc, size: buf.length }
}

export function updateSticker({ dataDir, name, tag, desc, logger }) {
  const safe = safeName(name)
  if (!safe) throw Error('文件名不合法')
  if (!existsSync(path.join(stickerDir(dataDir), safe))) throw Error('这张图不存在（可能已被删除）')
  const manifest = readManifest(dataDir)
  manifest[safe] = {
    tag: String(tag || '').trim().slice(0, 12) || safe.replace(/\.[^.]+$/, '').split(/[_\-—\s]/)[0],
    desc: String(desc || '').trim().slice(0, 40),
  }
  writeManifest(dataDir, manifest)
  logger?.info?.(`[表情包] 标签更新：${safe} → ${manifest[safe].tag}`)
  return { name: safe, tag: manifest[safe].tag, desc: manifest[safe].desc }
}

export function deleteSticker({ dataDir, name, logger }) {
  const safe = safeName(name)
  if (!safe) throw Error('文件名不合法')
  const file = path.join(stickerDir(dataDir), safe)
  if (!existsSync(file)) throw Error('这张图不存在（可能已被删除）')
  unlinkSync(file)
  const manifest = readManifest(dataDir)
  if (manifest[safe]) { delete manifest[safe]; writeManifest(dataDir, manifest) }
  logger?.info?.(`[表情包] 已删除：${safe}`)
  return { name: safe }
}
