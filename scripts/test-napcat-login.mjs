/**
 * 控制台「QQ 登录」页的离线回归：找配置、读 token/端口、鉴权调用、状态汇总、二维码读取。
 * 全部用假 fetch 与临时目录，不连真实 NapCat、不发 QQ 消息。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hashToken, findWebuiConfig, readWebuiSettings, napcatCall, readQrImage, loginSnapshot } from '../src/napcatLogin.js'

const TOKEN = 'e0f8065bc421'

// 1) 鉴权 hash 稳定（sha256(token + '.napcat')）
assert.equal(hashToken('abc').length, 64)
assert.equal(hashToken('abc'), hashToken('abc'))
assert.notEqual(hashToken('abc'), hashToken('abd'))

const dir = mkdtempSync(path.join(tmpdir(), 'cogito-login-'))
const versionDir = path.join(dir, 'versions', '9.9.33-52230', 'resources', 'app', 'napcat')
const configDir = path.join(versionDir, 'config')
const cacheDir = path.join(versionDir, 'cache')
mkdirSync(configDir, { recursive: true })
mkdirSync(cacheDir, { recursive: true })
const webuiFile = path.join(configDir, 'webui.json')
writeFileSync(webuiFile, JSON.stringify({ host: '::', port: 6099, token: TOKEN }), 'utf8')

try {
  // 2) 能在安装目录里找到 webui.json 并读出端口/token
  assert.equal(findWebuiConfig(dir), webuiFile)
  const settings = readWebuiSettings(webuiFile)
  assert.equal(settings.token, TOKEN)
  assert.equal(settings.port, 6099)
  assert.equal(readWebuiSettings(path.join(dir, 'nope.json')), null)

  // 3) 二维码图片：识别 PNG/JPEG，坏文件返回 null
  const pngFile = path.join(cacheDir, 'qrcode.png')
  writeFileSync(pngFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
  const qr = readQrImage(pngFile)
  assert.ok(qr.dataUrl.startsWith('data:image/png;base64,'))
  writeFileSync(path.join(cacheDir, 'broken.png'), Buffer.from([1, 2, 3]))
  assert.equal(readQrImage(path.join(cacheDir, 'broken.png')), null)

  // 假 fetch：auth 先返回 Credential，再按接口名返回数据
  const fakeFetch = (table) => async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {}
    if (url.endsWith('/api/auth/login')) {
      assert.equal(body.hash, hashToken(TOKEN), 'auth 必须用 token 的 hash')
      return { status: 200, text: async () => JSON.stringify(table.auth || {}) }
    }
    const api = url.split('/api/QQLogin/')[1]
    const reply = table[api]
    if (reply instanceof Error) throw reply
    return { status: 200, text: async () => JSON.stringify(reply || { code: -1, message: 'missing' }) }
  }

  // 4) 已登录：状态与账号都能读到
  const online = await loginSnapshot({
    napcatDir: dir,
    fetchImpl: fakeFetch({
      auth: { code: 0, data: { Credential: 'cred' } },
      CheckLoginStatus: { code: 0, data: { isLogin: true, uin: '3755578205', loginPhase: 'ready' } },
    }),
  })
  assert.equal(online.reachable, true)
  assert.equal(online.isLogin, true)
  assert.equal(online.uin, '3755578205')
  assert.deepEqual(online.accounts, [])
  assert.ok(online.qr && online.qr.dataUrl, '离线时缓存里的二维码仍应可读')
  assert.ok(!JSON.stringify(online).includes(TOKEN), 'token 不能返回给界面')

  // 5) 未登录：给出快速登录账号列表
  const offline = await loginSnapshot({
    napcatDir: dir,
    fetchImpl: fakeFetch({
      auth: { code: 0, data: { Credential: 'cred' } },
      CheckLoginStatus: { code: 0, data: { isLogin: false, loginPhase: 'qrcode', uin: '3755578205' } },
      GetQuickLoginListNew: { code: 0, data: [
        { uin: '3755578205', nickName: 'Cogito', isQuickLogin: true, isAutoLogin: true },
        { uin: '3308887513', nickName: '叫我蟹蟹就好', isQuickLogin: true },
      ] },
    }),
  })
  assert.equal(offline.isLogin, false)
  assert.equal(offline.accounts.length, 2)
  assert.equal(offline.accounts[0].uin, '3755578205')
  assert.equal(offline.accounts[0].isAutoLogin, true)

  // 6) NapCat 不可达时不抛异常，返回可读错误
  const broken = await loginSnapshot({
    napcatDir: dir,
    fetchImpl: async () => { throw new Error('ECONNREFUSED') },
  })
  assert.equal(broken.reachable, false)
  assert.match(broken.error, /ECONNREFUSED/)

  // 7) 未配置目录时明确提示
  const unset = await loginSnapshot({ napcatDir: '' })
  assert.equal(unset.configured, false)
  assert.match(unset.error, /NAPCAT_DIR/)

  // 8) 鉴权失败要报出原因
  await assert.rejects(
    napcatCall({ port: 6099, token: TOKEN, pathname: '/api/QQLogin/CheckLoginStatus', fetchImpl: fakeFetch({ auth: { code: -1, message: 'token is empty' } }) }),
    /token is empty/,
  )

  console.log('test-napcat-login passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
