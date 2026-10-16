import { getBilibiliData, getVideoInfo, normalizeImage } from './utils'

export const discoveryCategories = [
  { id: '', label: 'all', keyword: '音乐 合集 分P' },
  { id: 'chinese', label: 'chinese', keyword: '华语 歌曲 合集 分P' },
  { id: 'japanese', label: 'japanese', keyword: '日语 歌曲 合集 分P' },
  { id: 'western', label: 'western', keyword: '欧美 歌曲 合集 分P' },
  { id: 'ancient', label: 'ancient', keyword: '古风 歌曲 合集 分P' },
  { id: 'instrumental', label: 'instrumental', keyword: '纯音乐 合集 分P' },
  { id: 'study', label: 'study', keyword: '学习 纯音乐 合集' },
  { id: 'sleep', label: 'sleep', keyword: '睡前 音乐 合集' },
]

const pageSize = 20
const cacheTtl = 10 * 60 * 1000
const cacheLimit = 12
const cache = new Map()
const videoCache = new Map()
const videoCacheLimit = 128
const detailTimeout = 5000
const detailBudget = 20000
let visitor
let visitorPromise

const checkCancelled = signal => {
  if (signal?.aborted) throw new Error('bilibili__cancelled')
}

export const getVisitorHeaders = async() => {
  if (visitor && visitor.expires > Date.now()) return visitor.headers
  // A guest identity is kept only in memory. No account Cookie is read or required.
  visitorPromise ??= getBilibiliData('/x/frontend/finger/spi', {}, { timeout: 5000 }).then(data => {
    const cookies = [['buvid3', data.b_3], ['buvid4', data.b_4]]
      .filter(([, value]) => typeof value == 'string' && /^[\w-]+$/.test(value))
      .map(([key, value]) => `${key}=${value}`)
    const headers = cookies.length ? { Cookie: cookies.join('; ') } : {}
    visitor = { headers, expires: Date.now() + 24 * 60 * 60 * 1000 }
    return headers
  }).finally(() => { visitorPromise = null })
  return visitorPromise
}

export const toDiscoveryPlaylist = video => {
  if (!/^BV[\da-z]{10}$/i.test(video?.bvid ?? '') || !Array.isArray(video.pages)) return null
  const season = video.ugc_season
  const count = video.pages.length
  const seasonCount = Math.max((season?.sections ?? []).reduce((sum, section) => sum + (section.episodes?.length ?? 0), 0), Number(season?.ep_count) || 0)
  const mid = season?.mid ?? video.owner?.mid
  const isSeason = count <= 1 && seasonCount > 1 && /^\d+$/.test(String(season?.id)) && /^\d+$/.test(String(mid))
  if (count < 2 && !isSeason) return null
  return {
    id: isSeason ? `season:${mid}:${season.id}` : `video:${video.bvid}`,
    source: 'bili',
    name: String(isSeason ? season.title || video.title : video.title),
    author: String(video.owner?.name ?? ''),
    img: normalizeImage(isSeason ? season.cover || video.pic : video.pic),
    desc: String(isSeason ? season.intro ?? '' : video.desc ?? ''),
    play_count: String(isSeason ? season.stat?.view ?? video.stat?.view ?? '' : video.stat?.view ?? ''),
    trackCount: isSeason ? seasonCount : count,
  }
}

/** @param {{ keyword?: string, category?: string, sort?: string, page?: number, refresh?: boolean, signal?: AbortSignal, onProgress?: (result: { list: any[], checked: number, candidates: number }) => void }} options */
export const discoverPlaylists = async({ keyword, category = '', sort = 'hot', page = 1, refresh = false, signal, onProgress } = {}) => {
  const selected = discoveryCategories.find(item => item.id == category) ?? discoveryCategories[0]
  const query = String(keyword ?? selected.keyword).trim().slice(0, 100)
  if (!query || !Number.isInteger(page) || page < 1 || page > 50) throw new Error('bilibili__error_input')
  const key = `${sort == 'new' ? 'new' : 'hot'}:${query}:${page}`
  for (const [key, entry] of cache) {
    if (entry.expires <= Date.now()) cache.delete(key)
  }
  checkCancelled(signal)
  if (!refresh && cache.has(key)) return cache.get(key).result
  const headers = await getVisitorHeaders()
  checkCancelled(signal)
  const data = await getBilibiliData('/x/web-interface/search/type', {
    search_type: 'video', keyword: query, order: sort == 'new' ? 'pubdate' : 'click', page, page_size: pageSize,
  }, { signal, headers, timeout: 8000 })
  if (!Array.isArray(data.result)) throw new Error('bilibili__error_request')
  const ids = [...new Set(data.result.slice(0, pageSize).map(item => item.bvid).filter(id => /^BV[\da-z]{10}$/i.test(id ?? '')))]
  const resolved = new Array(ids.length)
  let index = 0
  let checked = 0
  let timedOut = false
  const errors = []
  const fatalErrors = []
  const detailsController = new AbortController()
  const abort = () => detailsController.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const budgetTimer = setTimeout(() => { timedOut = true; abort() }, detailBudget)
  const getList = () => [...new Map(resolved.filter(Boolean).map(item => [item.id, item])).values()]
  const publish = () => { if (!signal?.aborted) onProgress?.({ list: getList(), checked, candidates: ids.length }) }
  const rememberVideo = (id, playlist) => {
    videoCache.delete(id)
    videoCache.set(id, { playlist, expires: Date.now() + cacheTtl })
    if (videoCache.size > videoCacheLimit) videoCache.delete(videoCache.keys().next().value)
  }
  const worker = async() => {
    while (index < ids.length && !fatalErrors.length) {
      if (timedOut) break
      checkCancelled(signal)
      const current = index++
      try {
        const cached = videoCache.get(ids[current])
        if (!refresh && cached && cached.expires > Date.now()) resolved[current] = cached.playlist
        else {
          const playlist = toDiscoveryPlaylist(await getVideoInfo(ids[current], { signal: detailsController.signal, timeout: detailTimeout }))
          checkCancelled(signal)
          if (timedOut) break
          resolved[current] = playlist
          rememberVideo(ids[current], playlist)
        }
      } catch (error) {
        if (signal?.aborted) throw error
        if (timedOut) break
        if (['bilibili__error_missing', 'bilibili__error_private'].includes(error.message)) rememberVideo(ids[current], null)
        else if (error.message == 'bilibili__error_rate_limit') { fatalErrors.push(error); abort() } else errors.push(error)
      } finally {
        checked++
        publish()
      }
    }
  }
  try {
    await Promise.all([worker(), worker()])
  } finally {
    clearTimeout(budgetTimer)
    signal?.removeEventListener('abort', abort)
  }
  checkCancelled(signal)
  const list = getList()
  if (!list.length && fatalErrors.length) throw fatalErrors[0]
  if (!list.length && errors.length) throw errors[0]
  if (!list.length && timedOut) throw new Error('bilibili__error_request')
  const warning = fatalErrors.length ? 'bilibili__error_rate_limit' : errors.length || timedOut ? 'bilibili__partial_results' : ''
  const result = {
    list,
    page,
    limit: pageSize,
    total: list.length,
    source: 'bili',
    warning,
    hasMore: page < Math.min(50, Number(data.numPages) || Math.ceil((Number(data.numResults) || 0) / pageSize)),
  }
  cache.delete(key)
  if (!warning) cache.set(key, { result, expires: Date.now() + cacheTtl })
  if (cache.size > cacheLimit) cache.delete(cache.keys().next().value)
  return result
}
