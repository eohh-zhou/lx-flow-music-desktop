import { reactive, shallowReactive, markRaw } from '@common/utils/vueTools'
import { isRecommendationTrack, trackSignature } from './ranking'
import type { TrackRecommendation } from './ranking'
import type { AiTrackRecommendation } from './aiRanking'
import type { RecommendationSource, RecommendationVariety } from '@common/types/aiRecommendation'

const storageKey = 'lx__track_recommendations_v1'
export const recommendationSources: RecommendationSource[] = ['tx', 'wy', 'bili']

interface Feed {
  pool: AiTrackRecommendation[]
  ids: string[]
  seen: string[]
  updatedAt: number
  mode: 'ai' | 'platform'
  notice: string
}

const emptyFeed = (): Feed => ({ pool: [], ids: [], seen: [], updatedAt: 0, mode: 'ai', notice: '' })
export const recommendationPreferences = reactive({
  source: 'tx' as RecommendationSource,
  hint: '',
  useProfile: false,
  listId: '',
  variety: 'balanced' as RecommendationVariety,
  avoidRecent: true,
})
export const recommendationFeeds = shallowReactive<Record<RecommendationSource, Feed>>({ tx: shallowReactive(emptyFeed()), wy: shallowReactive(emptyFeed()), bili: shallowReactive(emptyFeed()) })
export const recommendationBlocked = reactive<Array<{ id: string, signature: string }>>([])
export const getBlockedKeys = () => new Set(recommendationBlocked.flatMap(item => [item.id, item.signature]))

// Store only song metadata needed for playback; audio URLs, model credentials and cookies never enter this cache.
export const compactRow = (row: TrackRecommendation): TrackRecommendation => {
  const { music } = row
  const meta = music.meta
  const compact = {
    id: music.id,
    source: music.source,
    name: music.name,
    singer: music.singer,
    interval: music.interval,
    meta: {
      songId: meta.songId,
      albumName: meta.albumName,
      picUrl: meta.picUrl,
      albumId: meta.albumId,
      qualitys: meta.qualitys,
      _qualitys: meta._qualitys,
      ...(music.source == 'tx' ? { id: music.meta.id, strMediaMid: music.meta.strMediaMid, albumMid: music.meta.albumMid } : {}),
      ...(meta.bilibili ? { bilibili: { rawTitle: meta.bilibili.rawTitle, uploader: meta.bilibili.uploader } } : {}),
    },
  }
  if (!isRecommendationTrack(compact, music.source as RecommendationSource)) throw new Error('Invalid recommendation metadata')
  return { music: compact, origin: row.origin, reason: row.reason.slice(0, 120) }
}

const compactAiRow = (row: AiTrackRecommendation): AiTrackRecommendation => ({
  ...compactRow(row),
  ...(row.ai && Number.isFinite(row.ai.relevance) ? {
    ai: {
      relevance: Math.max(0, Math.min(1, row.ai.relevance)),
      directions: (Array.isArray(row.ai.directions) ? row.ai.directions : []).filter(key => /^q[0-5]$/.test(key)).slice(0, 6),
    },
  } : {}),
})

export const saveRecommendations = () => {
  try {
    const feeds = Object.fromEntries(recommendationSources.map(source => {
      const feed = recommendationFeeds[source]
      return [source, { ...feed, pool: feed.pool.slice(0, 40).map(compactAiRow), ids: feed.ids.slice(0, 20), seen: feed.seen.slice(-160) }]
    }))
    localStorage.setItem(storageKey, JSON.stringify({ algorithmVersion: 2, preferences: recommendationPreferences, feeds, blocked: recommendationBlocked.slice(-200) }))
    return true
  } catch { return false }
}

export const blockRecommendation = (row: TrackRecommendation) => {
  const signature = trackSignature(row.music)
  if (!recommendationBlocked.some(item => item.id == row.music.id)) recommendationBlocked.push({ id: row.music.id, signature })
  if (recommendationBlocked.length > 200) recommendationBlocked.splice(0, recommendationBlocked.length - 200)
  return saveRecommendations()
}

try {
  const raw = localStorage.getItem(storageKey)
  const saved = raw && raw.length <= 1200000 ? JSON.parse(raw) : null
  if (saved?.preferences) {
    const pref = saved.preferences
    if (recommendationSources.includes(pref.source)) recommendationPreferences.source = pref.source
    recommendationPreferences.hint = typeof pref.hint == 'string' ? pref.hint.slice(0, 500) : ''
    recommendationPreferences.listId = typeof pref.listId == 'string' && !['love', 'default'].includes(pref.listId) ? pref.listId.slice(0, 200) : ''
    recommendationPreferences.useProfile = pref.useProfile === true
    recommendationPreferences.avoidRecent = pref.avoidRecent !== false
    if (['familiar', 'balanced', 'explore'].includes(pref.variety)) recommendationPreferences.variety = pref.variety
  }
  for (const source of recommendationSources) {
    const value = saved?.feeds?.[source]
    if (saved?.algorithmVersion != 2 || !value || !Array.isArray(value.pool)) continue
    const pool: AiTrackRecommendation[] = value.pool.slice(0, 40).flatMap((row: any) => {
      if (!isRecommendationTrack(row?.music, source)) return []
      const restored: TrackRecommendation = { music: row.music, origin: ['search', 'daily', 'popular'].includes(row.origin) ? row.origin : 'search', reason: String(row.reason ?? '').slice(0, 120) }
      return [compactAiRow({ ...restored, ai: row.ai })]
    })
    const ids = new Set(pool.map(row => row.music.id))
    Object.assign(recommendationFeeds[source], {
      pool: markRaw(pool),
      ids: Array.isArray(value.ids) ? value.ids.filter((id: unknown) => ids.has(id as string)).slice(0, 20) : [],
      seen: Array.isArray(value.seen) ? value.seen.filter((key: unknown) => typeof key == 'string' && key.length < 400).slice(-160) : [],
      updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
      mode: value.mode == 'platform' ? 'platform' : 'ai',
      notice: typeof value.notice == 'string' && /^recommend__/.test(value.notice) ? value.notice : '',
    })
  }
  if (Array.isArray(saved?.blocked)) {
    recommendationBlocked.push(...saved.blocked.slice(-200).filter((item: any) => typeof item?.id == 'string' && item.id.length < 100 && typeof item.signature == 'string' && item.signature.length < 400))
  }
} catch { /* An unreadable recommendation cache leaves the music library untouched. */ }
