/**
 * 群总结失败的告警：写一份小状态文件给控制台看，同时追加到 logs/alerts.log。
 *
 * 为什么需要：日报失败以前只写 bot.log，用户不看日志就不知道；
 * 而且睡眠/关机错过 23:00 时连日志都没有，第二天才"怎么没报告"。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from './stateFile.js'

export const SUMMARY_ALERTS_FILE = 'summary-alerts.json'
const MAX_ITEMS = 20

function alertFile(dataDir) {
  return path.join(String(dataDir || '.'), SUMMARY_ALERTS_FILE)
}

/** 记录一条失败；stage 用 send/generate/missed 这类短词，message 会截断。 */
export function recordSummaryAlert({ dataDir, logDir, groupId = '', stage = '', message = '', at = Date.now(), logger } = {}) {
  const item = {
    at,
    groupId: String(groupId || ''),
    stage: String(stage || ''),
    message: String(message || '').replace(/\s+/g, ' ').slice(0, 400),
  }
  let state = { version: 1, items: [] }
  try {
    const file = alertFile(dataDir)
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      if (saved && Array.isArray(saved.items)) state = { version: 1, items: saved.items }
    }
    state.items = [...state.items, item].slice(-MAX_ITEMS)
    writeJsonAtomic(alertFile(dataDir), state)
  } catch (err) {
    logger?.warn?.(`总结告警写入失败：${err.message}`)
  }
  try {
    if (logDir) {
      const time = new Date(at).toLocaleString('zh-CN', { hour12: false })
      appendFileSync(path.join(logDir, 'alerts.log'), `[${time}] ALERT 群 ${item.groupId || '—'} 总结失败（${item.stage || 'unknown'}）：${item.message}\n`, 'utf8')
    }
  } catch {
    /* 告警写不进去不影响主流程 */
  }
  return item
}

/** 读"仍然新鲜"的最近一条失败（默认 48 小时内），没有就返回 null。 */
export function readLatestSummaryAlert(dataDir, { withinMs = 48 * 3600 * 1000, now = Date.now() } = {}) {
  try {
    const file = alertFile(dataDir)
    if (!existsSync(file)) return null
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    const items = Array.isArray(saved?.items) ? saved.items : []
    const fresh = items.filter((item) => Number(item?.at) > 0 && now - Number(item.at) <= withinMs)
    return fresh.length ? fresh[fresh.length - 1] : null
  } catch {
    return null
  }
}
