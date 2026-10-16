import { httpFetch } from '../../request'
import { BILIBILI_HEADERS } from '@common/utils/bilibili'

const fail = code => { throw new Error(`bilibili__error_${code}`) }
const isBilibiliHost = host => /(^|\.)bilibili\.com$/.test(host) || host == 'b23.tv'

const extractUrl = text => {
  const match = text.match(/https?:\/\/[^\s<>"，。；）】]+/i) ?? text.match(/(?:^|\s)((?:[\w-]+\.)*(?:bilibili\.com|b23\.tv)\/[^\s<>"，。；）】]+)/i)
  if (!match) return null
  const value = (match[1] ?? match[0]).trim().replace(/[),;\]}]+$/, '')
  try {
    const url = new URL((/^https?:\/\//i.test(value) ? '' : 'https://') + value)
    return isBilibiliHost(url.hostname) ? url : null
  } catch { return null }
}

export const isBilibiliListInput = text => {
  return /(^|[\s/])(?:BV[\da-z]{10}|av\d+)(?:$|[\s/?#])/i.test(text) || /^(fav|season|series|video):/.test(text) || !!extractUrl(text)
}

// Canonical IDs are stored with local lists, so refresh does not depend on a short link.
export const parseBilibiliListInput = raw => {
  const text = String(raw).trim()
  if (/^\d+$/.test(text)) return { type: 'fav', id: text, key: `fav:${text}` }
  let match = /^(fav):(\d+)$/.exec(text)
  if (match) return { type: match[1], id: match[2], key: text }
  match = /^(season|series):(\d+):(\d+)$/.exec(text)
  if (match) return { type: match[1], mid: match[2], id: match[3], key: text }
  match = /^(?:video:)?(BV[\da-z]{10}|av\d+)$/i.exec(text)
  if (match) {
    const id = /^av/i.test(match[1]) ? match[1].toLowerCase() : 'BV' + match[1].slice(2)
    return { type: 'video', id, key: `video:${id}` }
  }

  const url = extractUrl(text)
  if (!url || url.username || url.password || !isBilibiliHost(url.hostname)) return fail('input')
  if (url.hostname == 'b23.tv') return { type: 'short', url: url.href }
  const params = url.searchParams
  let type, id, mid
  if (/^\d+$/.test(params.get('fid') ?? '')) {
    type = 'fav'
    id = params.get('fid')
  } else if ((match = /\/(?:medialist\/detail\/ml|list\/ml|playlist\/pl)(\d+)/i.exec(url.pathname))) {
    type = 'fav'
    id = match[1]
  } else if ((match = /\/(\d+)\/(?:channel\/(collectiondetail|seriesdetail)|lists\/(\d+))/.exec(url.pathname))) {
    mid = match[1]
    type = match[2] == 'seriesdetail' || params.get('type') == 'series' ? 'series' : 'season'
    id = match[3] ?? params.get('sid')
  } else if ((match = /\/medialist\/play\/(\d+)/.exec(url.pathname)) && ['space_collection', 'space_series'].includes(params.get('business'))) {
    mid = match[1]
    type = params.get('business') == 'space_series' ? 'series' : 'season'
    id = params.get('business_id')
  } else if ((match = /^\/list\/(\d+)\/?$/.exec(url.pathname))) {
    mid = match[1]
    type = params.get('type') == 'season' || params.get('business') == 'space_collection' ? 'season' : 'series'
    id = params.get('sid')
  } else if ((match = /\/video\/(BV[\da-z]{10}|av\d+)(?:\/|$)/i.exec(url.pathname))) {
    return parseBilibiliListInput(match[1])
  }
  if (!type || !/^\d+$/.test(id ?? '')) return fail('input')
  return { type, id, mid, key: mid ? `${type}:${mid}:${id}` : `${type}:${id}` }
}

export const resolveBilibiliListId = async raw => {
  let input = parseBilibiliListInput(raw)
  for (let i = 0; input.type == 'short' && i < 5; i++) {
    const { statusCode, headers } = await httpFetch(input.url, {
      headers: BILIBILI_HEADERS,
      follow_max: 0,
      timeout: 15000,
    }).promise
    if (statusCode < 300 || statusCode >= 400 || !headers?.location) return fail('input')
    const url = new URL(headers.location, input.url)
    if (!isBilibiliHost(url.hostname) || !/^https?:$/.test(url.protocol) || url.username || url.password) return fail('input')
    input = parseBilibiliListInput(url.href)
  }
  if (input.type == 'short') return fail('input')
  return input.key
}

/**
 * @param {string} path
 * @param {Record<string, string | number | boolean>} params
 * @param {{ signal?: AbortSignal, headers?: Record<string, string>, timeout?: number }} options
 */
export const getBilibiliData = async(path, params = {}, { signal, headers, timeout = 15000 } = {}) => {
  if (signal?.aborted) throw new Error('bilibili__cancelled')
  const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
  const task = httpFetch(`https://api.bilibili.com${path}?${query}`, {
    headers: { ...BILIBILI_HEADERS, ...headers },
    timeout,
  })
  const abort = () => task.cancelHttp?.()
  signal?.addEventListener('abort', abort, { once: true })
  let response
  try {
    response = await task.promise
  } finally {
    signal?.removeEventListener('abort', abort)
  }
  if (signal?.aborted) throw new Error('bilibili__cancelled')
  const { statusCode, body } = response
  if (statusCode == 412 || statusCode == 429 || [-352, -412].includes(body?.code)) return fail('rate_limit')
  if ([-101, -111, -403, 72010017].includes(body?.code)) return fail('private')
  if (statusCode == 404 || body?.code == -404) return fail('missing')
  if (statusCode != 200 || body?.code !== 0 || !body.data) return fail('request')
  return body.data
}

export const getVideoInfo = async(id, options) => getBilibiliData('/x/web-interface/view', /^av/.test(id) ? { aid: id.slice(2) } : { bvid: id }, options)

export const parseMusicId = songmid => {
  const match = /^(BV[\da-z]{10})_(\d+)$/i.exec(String(songmid))
  if (!match || Number(match[2]) < 1) return fail('missing')
  return { bvid: match[1], page: Number(match[2]) }
}

export const normalizeImage = url => typeof url == 'string' ? url.replace(/^http:/, 'https:').replace(/^\/\//, 'https://') : ''
