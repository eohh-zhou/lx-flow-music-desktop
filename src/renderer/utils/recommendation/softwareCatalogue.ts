import { formatPlayTime } from '@renderer/utils'
import { checkCancelled, fetchBody } from './providers'
import type { SoftwareRequestBudget } from './softwareRequests'

export interface PlaylistContext {
  id: string
  total: number
  tracks: LX.Music.MusicInfoOnline[]
}

// Metadata only, in memory: at most 1,600 songs and 32 small search results.
class CatalogueCache<T> {
  private readonly values = new Map<string, { value: T, expires: number }>()
  constructor(private readonly capacity: number) {}
  get(key: string) {
    const entry = this.values.get(key)
    if (!entry) return
    this.values.delete(key)
    if (entry.expires <= Date.now()) return
    this.values.set(key, entry)
    return entry.value
  }

  set(key: string, value: T) {
    this.values.delete(key)
    this.values.set(key, { value, expires: Date.now() + 6 * 3600000 })
    while (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!)
  }
}
const searches = new CatalogueCache<string[]>(32)
const playlists = new CatalogueCache<PlaylistContext>(16)
const headers = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' }
const validId = (value: unknown) => /^\d{1,20}$/.test(String(value))
const read = async(path: string, query: Record<string, string>, budget: SoftwareRequestBudget, signal: AbortSignal) => budget.run(async() => {
  const body = await fetchBody(`https://music.163.com/api/${path}?${new URLSearchParams(query).toString()}`, { headers }, signal, 8000)
  if (body?.code != 200) throw new Error('recommend__error_search')
  return body
})

// Both /playlist/detail's modern shape and /song/detail's older shape are public.
export const catalogueTrack = (raw: any): LX.Music.MusicInfoOnline | null => {
  if (!validId(raw?.id) || typeof raw?.name != 'string' || !raw.name.trim()) return null
  const artists = raw.ar ?? raw.artists
  if (!Array.isArray(artists)) return null
  const singer = artists.filter(item => typeof item?.name == 'string').map(item => item.name.trim()).filter(Boolean).join('、')
  if (!singer) return null
  const album = raw.al ?? raw.album
  const levels: Array<[LX.Quality, any]> = [['128k', raw.l ?? raw.lMusic ?? raw.bMusic], ['320k', raw.h ?? raw.hMusic], ['flac', raw.sq], ['flac24bit', raw.hr]]
  const qualitys: LX.Music.MusicQualityType[] = levels.filter(([, value]) => value && Number(value.br ?? value.bitrate) > 0).map(([type]) => ({ type, size: null }))
  return {
    id: `wy_${raw.id}`,
    source: 'wy',
    name: raw.name.trim(),
    singer,
    interval: formatPlayTime(Math.max(0, Number(raw.dt ?? raw.duration) || 0) / 1000),
    meta: { songId: raw.id, albumName: typeof album?.name == 'string' ? album.name : '', albumId: album?.id, picUrl: album?.picUrl, qualitys, _qualitys: Object.fromEntries(qualitys.map(item => [item.type, { size: null }])) },
  }
}

export const searchPlaylistContexts = async(keyword: string, budget: SoftwareRequestBudget, signal: AbortSignal) => {
  checkCancelled(signal)
  const key = keyword.trim().slice(0, 160)
  const cached = searches.get(key)
  if (cached) return cached
  const body = await read('search/get/web', { s: key, type: '1000', offset: '0', limit: '2' }, budget, signal)
  const ids: string[] = Array.isArray(body.result?.playlists) ? [...new Set<string>(body.result.playlists.filter((item: any) => validId(item?.id)).slice(0, 2).map((item: any) => String(item.id)))] : []
  checkCancelled(signal)
  searches.set(key, ids)
  return ids
}

export const getPlaylistContext = async(id: string, budget: SoftwareRequestBudget, signal: AbortSignal): Promise<PlaylistContext> => {
  checkCancelled(signal)
  if (!validId(id)) throw new Error('recommend__error_search')
  const cached = playlists.get(id)
  if (cached) return cached
  const body = await read('v6/playlist/detail', { id, n: '100', s: '0' }, budget, signal)
  const list = body.playlist
  if (!Array.isArray(list?.tracks)) throw new Error('recommend__error_search')
  const ids = Array.isArray(list.trackIds) ? list.trackIds.filter((track: any) => validId(track?.id)).slice(0, 100).map((track: any) => track.id) : []
  let rawTracks = list.tracks.slice(0, 100)
  // Anonymous detail responses sometimes include just ten tracks. Expand at most 100 IDs once, without retries.
  if (ids.length > rawTracks.length) {
    const details = await read('song/detail', { ids: JSON.stringify(ids) }, budget, signal)
    if (!Array.isArray(details.songs)) throw new Error('recommend__error_search')
    const wanted = new Set(ids.map(String))
    rawTracks = details.songs.filter((track: any) => wanted.has(String(track?.id))).slice(0, 100)
  }
  const tracks = rawTracks.map(catalogueTrack).filter((track: LX.Music.MusicInfoOnline | null): track is LX.Music.MusicInfoOnline => !!track)
  const context = { id: `wy:${id}`, total: Math.max(tracks.length, Math.min(100000, Number(list.trackCount) || 0)), tracks }
  checkCancelled(signal)
  playlists.set(id, context)
  return context
}
