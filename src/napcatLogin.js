/**
 * NapCat 登录辅助：控制台「QQ 登录」页通过它查看登录状态、取二维码、发起快速登录。
 *
 * 为什么走 NapCat WebUI 的 HTTP 接口而不是直接读缓存文件：
 * 状态（是否已登录、可快速登录的账号）只有 WebUI 知道；二维码图片缓存文件在等扫码时才会更新，
 * 所以两者都读——状态走接口，图片直接取缓存，避免把大图塞进 WebUI 的接口响应。
 *
 * 鉴权方式（实测 NapCat 4.x）：POST /api/auth/login {hash: sha256(token + '.napcat'), totpCode: ''}
 * 拿到 Credential，之后用 Authorization: Bearer <Credential> 调 /api/QQLogin/*。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export function hashToken(token) {
  return createHash('sha256').update(`${token}.napcat`).digest('hex')
}

/** 在 NapCat 安装目录里找最新的 webui.json（多版本共存时取最近修改的那个）。 */
export function findWebuiConfig(napcatDir) {
  const versions = path.join(String(napcatDir || ''), 'versions')
  try {
    const found = readdirSync(versions)
      .map((name) => path.join(versions, name, 'resources', 'app', 'napcat', 'config', 'webui.json'))
      .filter((file) => existsSync(file))
      .map((file) => ({ file, mtime: statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    return found[0]?.file || ''
  } catch {
    return ''
  }
}

/** 读取 WebUI 监听端口与 token；token 只在本进程内使用，不返回给前端。 */
export function readWebuiSettings(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const token = String(raw?.token || '').trim()
    if (!token) return null
    const port = Number(raw?.port) || 6099
    return { token, port, host: String(raw?.host || '') }
  } catch {
    return null
  }
}

function webuiBase(port) {
  return `http://127.0.0.1:${port}`
}

async function postJson(url, body, { headers = {}, fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { throw new Error(`NapCat 返回的不是 JSON（HTTP ${response.status}）`) }
  return data
}

/** 登录拿 Credential，再调一个 /api/QQLogin/* 接口，返回 data。 */
export async function napcatCall({ port, token, pathname, payload, fetchImpl = fetch, timeoutMs = 6000 }) {
  const base = webuiBase(port)
  const login = await postJson(`${base}/api/auth/login`, { hash: hashToken(token), totpCode: '' }, { fetchImpl, timeoutMs })
  const credential = login?.data?.Credential
  if (!credential) throw new Error(login?.message || 'NapCat WebUI 登录失败')
  const result = await postJson(`${base}${pathname}`, payload || {}, {
    headers: { Authorization: `Bearer ${credential}` },
    fetchImpl,
    timeoutMs,
  })
  if (result?.code !== 0) throw new Error(result?.message || 'NapCat 接口返回失败')
  return result.data
}

/** 等扫码时 NapCat 会把二维码写成缓存图片；多版本时取最新一张。 */
export function findQrImage(napcatDir) {
  const versions = path.join(String(napcatDir || ''), 'versions')
  try {
    const files = readdirSync(versions)
      .map((name) => path.join(versions, name, 'resources', 'app', 'napcat', 'cache', 'qrcode.png'))
      .filter((file) => existsSync(file))
      .map((file) => ({ file, mtime: statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    return files[0]?.file || ''
  } catch {
    return ''
  }
}

export function readQrImage(file) {
  if (!file || !existsSync(file)) return null
  try {
    const buffer = readFileSync(file)
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8
    const png = buffer[0] === 0x89 && buffer[1] === 0x50
    if (!jpeg && !png) return null
    return {
      dataUrl: `data:image/${jpeg ? 'jpeg' : 'png'};base64,${buffer.toString('base64')}`,
      updatedAt: statSync(file).mtimeMs,
      bytes: buffer.length,
    }
  } catch {
    return null
  }
}

/** 汇总控制台需要的登录信息：状态、账号列表、二维码。 */
export async function loginSnapshot({ napcatDir, fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const dir = String(napcatDir || '').trim()
  if (!dir) return { configured: false, reachable: false, error: '未配置 NAPCAT_DIR（NapCat 安装目录）' }
  const configFile = findWebuiConfig(dir)
  if (!configFile) return { configured: false, reachable: false, error: '在 NapCat 目录里找不到 webui.json' }
  const settings = readWebuiSettings(configFile)
  if (!settings) return { configured: false, reachable: false, error: 'webui.json 里没有 token' }

  const snapshot = { configured: true, reachable: true, isLogin: false, uin: '', phase: '', accounts: [], qr: readQrImage(findQrImage(dir)) }
  try {
    const status = await napcatCall({ port: settings.port, token: settings.token, pathname: '/api/QQLogin/CheckLoginStatus', fetchImpl, timeoutMs })
    snapshot.isLogin = Boolean(status?.isLogin)
    snapshot.phase = String(status?.loginPhase || '')
    snapshot.uin = String(status?.uin || '')
    if (!snapshot.isLogin) {
      const list = await napcatCall({ port: settings.port, token: settings.token, pathname: '/api/QQLogin/GetQuickLoginListNew', fetchImpl, timeoutMs }).catch(() => [])
      snapshot.accounts = (Array.isArray(list) ? list : []).map((item) => ({
        uin: String(item?.uin || ''),
        nickName: String(item?.nickName || ''),
        isQuickLogin: item?.isQuickLogin === true,
        isAutoLogin: item?.isAutoLogin === true,
      })).filter((item) => item.uin)
    }
  } catch (err) {
    snapshot.reachable = false
    snapshot.error = `NapCat 接口不可用：${err.message}`
  }
  return snapshot
}
