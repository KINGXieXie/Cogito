/**
 * 表情包：清单加载、标签提示、标记提取、CQ 组装、边界情况。
 * 离线运行：node scripts/test-stickers.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadStickers, stickerHint, extractSticker, stickerCq, stickerTagList, matchEmotionTag, findStickerByTag } from '../src/stickers.js'
import { listStickers, saveSticker, updateSticker, deleteSticker, readManifest } from '../src/stickerLibrary.js'

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-stickers-'))
const logger = { info() {}, warn() {} }
// 1x1 透明 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

try {
  assert.deepEqual(loadStickers(dir, logger), [], '没有目录时返回空数组')

  const sdir = path.join(dir, 'stickers')
  mkdirSync(sdir, { recursive: true })
  writeFileSync(path.join(sdir, '开心_猫.png'), PNG)
  writeFileSync(path.join(sdir, '无语_狗.png'), PNG)
  writeFileSync(path.join(sdir, 'notes.txt'), '不是图片')

  // 1) 没有 manifest：用文件名第一段当标签
  const auto = loadStickers(dir, logger)
  assert.equal(auto.length, 2, '只加载图片')
  assert.deepEqual(stickerTagList(auto).sort(), ['无语', '开心'].sort())

  // 2) manifest 覆盖标签/说明
  writeFileSync(path.join(sdir, 'manifest.json'), JSON.stringify({
    '开心_猫.png': { tag: '开心', desc: '高兴时' },
    '无语_狗.png': { tag: '无语', desc: '无奈时' },
  }))
  const lib = loadStickers(dir, logger)
  assert.equal(lib.find((i) => i.name === '开心_猫.png').tag, '开心')
  assert.equal(lib.find((i) => i.name === '无语_狗.png').desc, '无奈时')

  // 3) 提示词：列标签、说明标记格式
  const hint = stickerHint(lib)
  assert.ok(hint.includes('开心') && hint.includes('无语'))
  assert.ok(hint.includes('[表情:标签]'))
  assert.ok(hint.length < 400, '提示不能太长')

  // 4) 提取：精确标签 + 去掉标记
  const r1 = extractSticker('哈哈这也太逗了\n[表情:开心]', lib, () => 0)
  assert.equal(r1.sticker?.tag, '开心')
  assert.ok(!r1.text.includes('[表情'))
  assert.equal(r1.text, '哈哈这也太逗了')

  // 5) 模糊匹配：标签互相包含
  const r2 = extractSticker('好吧[表情包：无语]', lib, () => 0)
  assert.equal(r2.sticker?.tag, '无语')
  assert.equal(r2.text, '好吧')

  // 6) 未知标签：去掉标记但不发图
  const r3 = extractSticker('嗯嗯 [表情:不存在]', lib, () => 0)
  assert.equal(r3.sticker, null)
  assert.equal(r3.text, '嗯嗯')

  // 7) 没有标记：原样返回
  const r4 = extractSticker('普通回复', lib, () => 0)
  assert.equal(r4.sticker, null)
  assert.equal(r4.text, '普通回复')

  // 8) CQ：base64 图片段；不存在的文件返回空串
  const cq = stickerCq(lib[0].file)
  assert.ok(cq.startsWith('[CQ:image,file=base64://'))
  assert.ok(cq.endsWith(']'))
  assert.equal(stickerCq(path.join(sdir, 'nope.png')), '')

  // 9) 情绪识别（模型偶尔不写标签时的自动补图依据）
  const emo = [
    ['开心_猫.png', { tag: '开心' }],
    ['无语_狗.png', { tag: '无语' }],
  ]
  writeFileSync(path.join(sdir, 'manifest.json'), JSON.stringify(emo))
  const emoLib = loadStickers(dir, logger)
  assert.equal(matchEmotionTag('今天笑死我了', emoLib), '开心')
  assert.equal(matchEmotionTag('这也太离谱了', emoLib), '无语')
  assert.equal(matchEmotionTag('今天天气不错', emoLib), null)
  assert.equal(matchEmotionTag('笑死我了', []), null)
  assert.equal(findStickerByTag(emoLib, '开心', () => 0)?.tag, '开心')
  assert.equal(findStickerByTag(emoLib, '不存在', () => 0), null)

  // 10) 控制台用的文件操作：上传 / 重名 / 改标签 / 删除 / 校验
  const lib2 = mkdtempSync(path.join(tmpdir(), 'cogito-lib2-'))
  try {
    const saved = saveSticker({ dataDir: lib2, name: '猫猫大笑.png', data: PNG.toString('base64'), logger })
    assert.equal(saved.name, '猫猫大笑.png')
    assert.equal(saved.tag, '猫猫大笑', '没有 tag 时文件名第一段就是标签')
    const dup = saveSticker({ dataDir: lib2, name: '猫猫大笑.png', data: PNG.toString('base64'), logger })
    assert.notEqual(dup.name, saved.name, '重名要自动改名')
    const tagged = saveSticker({ dataDir: lib2, name: '随便.png', data: PNG.toString('base64'), tag: '开心', logger })
    assert.equal(tagged.tag, '开心')
    assert.equal(listStickers(lib2, logger).length, 3)

    const updated = updateSticker({ dataDir: lib2, name: '猫猫大笑.png', tag: '无语', desc: '无奈时', logger })
    assert.equal(updated.tag, '无语')
    assert.equal(readManifest(lib2)['猫猫大笑.png'].desc, '无奈时')

    deleteSticker({ dataDir: lib2, name: '随便.png', logger })
    assert.equal(listStickers(lib2, logger).some((i) => i.name === '随便.png'), false)
    assert.equal(readManifest(lib2)['随便.png'], undefined)

    assert.throws(() => saveSticker({ dataDir: lib2, name: 'evil.exe', data: PNG.toString('base64'), logger }), /文件名/)
    assert.throws(() => saveSticker({ dataDir: lib2, name: 'x.png', data: Buffer.from('not an image').toString('base64'), logger }), /不像图片/)
    assert.throws(() => saveSticker({ dataDir: lib2, name: 'big.png', data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'), logger }), /太大/)
  } finally {
    rmSync(lib2, { recursive: true, force: true })
  }

  console.log('test-stickers passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
