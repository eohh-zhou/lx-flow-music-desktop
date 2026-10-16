import { markRaw, reactive, shallowReactive } from '@common/utils/vueTools'
import { compactRow } from './session'
import { isRecommendationTrack } from './ranking'
import type { TrackRecommendation } from './ranking'
import type { SoftwareRecommendation } from './softwareMmr'
import type { SoftwareSource } from './softwareEngine'
import type { RecommendationSource, RecommendationVariety } from '@common/types/aiRecommendation'

const key = 'lx__software_recommendations_v5'
const sources: SoftwareSource[] = ['all', 'tx', 'wy', 'bili']
interface SoftwareFeed { pool: SoftwareRecommendation[], ids: string[], seen: string[], updatedAt: number, generation: number }
const empty = (): SoftwareFeed => ({ pool: [], ids: [], seen: [], updatedAt: 0, generation: 0 })
export const softwarePreferences = reactive({ source: 'all' as SoftwareSource, lists: null as string[] | null, avoidRecent: true, variety: 'balanced' as RecommendationVariety })
export const softwareFeeds = shallowReactive<Record<SoftwareSource, SoftwareFeed>>({ all: shallowReactive(empty()), tx: shallowReactive(empty()), wy: shallowReactive(empty()), bili: shallowReactive(empty()) })
const compactSoftwareRow = (row: SoftwareRecommendation): SoftwareRecommendation => ({
  ...compactRow(row),
  ...(typeof row.direction == 'string' && /^(seed|artist):.{1,360}$/.test(row.direction) ? { direction: row.direction } : {}),
  ...(typeof row.reference == 'string' && /^seed:.{1,360}$/.test(row.reference) ? { reference: row.reference } : {}),
  ...(Array.isArray(row.contexts) ? { contexts: [...new Set(row.contexts.filter(id => typeof id == 'string' && /^wy:\d{1,20}$/.test(id)))].slice(0, 4) } : {}),
})
export const saveSoftwareRecommendations = () => {
  try {
    const feeds = Object.fromEntries(sources.map(source => [source, { ...softwareFeeds[source], pool: softwareFeeds[source].pool.slice(0, 60).map(compactSoftwareRow), ids: softwareFeeds[source].ids.slice(0, 20), seen: softwareFeeds[source].seen.slice(-160) }]))
    localStorage.setItem(key, JSON.stringify({ preferences: softwarePreferences, feeds }))
    return true
  } catch { return false }
}
try {
  const current = localStorage.getItem(key)
  const raw = current ?? localStorage.getItem('lx__software_recommendations_v4') ?? localStorage.getItem('lx__software_recommendations_v3') ?? localStorage.getItem('lx__software_recommendations_v2') ?? localStorage.getItem('lx__software_recommendations_v1')
  const saved = raw && raw.length < 1800000 ? JSON.parse(raw) : null
  const prefs = saved?.preferences
  if (prefs) {
    if (sources.includes(prefs.source)) softwarePreferences.source = prefs.source
    softwarePreferences.lists = Array.isArray(prefs.lists) ? prefs.lists.filter((id: unknown) => typeof id == 'string' && id.length < 200).slice(0, 200) : null
    softwarePreferences.avoidRecent = prefs.avoidRecent !== false
    if (['familiar', 'balanced', 'explore'].includes(prefs.variety)) softwarePreferences.variety = prefs.variety
  }
  for (const source of sources) {
    if (!current) continue
    const value = saved?.feeds?.[source]
    if (!Array.isArray(value?.pool)) continue
    const pool = value.pool.slice(0, 60).filter((row: any) => (source == 'all' || row?.music?.source == source) && ['tx', 'wy', 'bili'].some(platform => isRecommendationTrack(row?.music, platform as RecommendationSource)))
      .map((row: any) => compactSoftwareRow({ music: row.music, origin: 'search', reason: typeof row.reason == 'string' ? row.reason.slice(0, 120) : '', direction: row.direction, reference: row.reference, contexts: row.contexts }))
    const ids = new Set(pool.map((row: TrackRecommendation) => row.music.id))
    Object.assign(softwareFeeds[source], { pool: markRaw(pool), ids: Array.isArray(value.ids) ? value.ids.filter((id: unknown) => ids.has(id as string)).slice(0, 20) : [], seen: Array.isArray(value.seen) ? value.seen.filter((id: unknown) => typeof id == 'string' && id.length < 400).slice(-160) : [], updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0, generation: Number.isInteger(value.generation) && value.generation >= 0 && value.generation < 1000000 ? value.generation : 0 })
  }
} catch { /* Start with an empty software feed if its cache cannot be read. */ }
