import type { AiRecommendSeed, RecommendationSource, RecommendationVariety } from '@common/types/aiRecommendation'

export interface TrackRecommendation {
  music: LX.Music.MusicInfoOnline
  reason: string
  origin: 'search' | 'daily' | 'popular'
}

export const normalize = (value: string) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
export const trackSignature = (song: AiRecommendSeed) => `${normalize(song.name)}|${normalize(song.singer)}`
export const durationSeconds = (value: string | null) => String(value ?? '').split(':').reduce((sum, part) => sum * 60 + (Number(part) || 0), 0)

export const isRecommendationTrack = (value: any, source: RecommendationSource): value is LX.Music.MusicInfoOnline => {
  if (!value || value.source != source || typeof value.name != 'string' || !value.name.trim() || typeof value.singer != 'string') return false
  const pattern = source == 'tx' ? /^tx_[\da-z]{1,80}$/i : source == 'wy' ? /^wy_\d{1,30}$/ : /^bili_BV[\da-z]{10}_[1-9]\d{0,2}$/i
  return typeof value.id == 'string' && pattern.test(value.id) && value.id == `${source}_${value.meta?.songId}` &&
    typeof value.meta?.albumName == 'string' && Array.isArray(value.meta.qualitys) && !!value.meta._qualitys
}

export interface SelectionOptions {
  source: RecommendationSource
  seeds?: AiRecommendSeed[]
  blocked?: Set<string>
  seen?: Set<string>
  hint?: string
  variety?: RecommendationVariety
  limit?: number
}

export const filterTracks = <T extends TrackRecommendation>(rows: T[], { source, blocked = new Set(), seen = new Set() }: SelectionOptions): T[] => {
  const ids = new Set<string>()
  const signatures = new Set<string>()
  return rows.filter(row => {
    const song = row.music
    if (!isRecommendationTrack(song, source)) return false
    const signature = trackSignature(song)
    const seconds = durationSeconds(song.interval)
    if (ids.has(song.id) || signatures.has(signature) || blocked.has(song.id) || blocked.has(signature) || seen.has(song.id) || seen.has(signature)) return false
    if (source == 'bili' && (seconds < 30 || seconds > 900 || /合集|歌单|串烧|分[Pp]|盘点|解说|教程|reaction/i.test(song.meta.bilibili?.rawTitle ?? song.name))) return false
    ids.add(song.id)
    signatures.add(signature)
    return true
  })
}

// Local relevance and diminishing artist returns still apply when model ranking fails.
export const selectTracks = (rows: TrackRecommendation[], { source, seeds = [], blocked = new Set(), seen = new Set(), hint = '', variety = 'balanced', limit = 20 }: SelectionOptions) => {
  const seedArtists = new Set(seeds.map(song => normalize(song.singer)).filter(Boolean))
  const terms = hint.split(/[\s,，、;；]+/).map(normalize).filter(term => term.length >= 2)
  const candidates = filterTracks(rows, { source, blocked, seen }).map((row, index) => {
    const artist = normalize(row.music.singer)
    const familiar = artist && seedArtists.has(artist)
    const text = normalize(`${row.music.name} ${row.music.singer} ${row.music.meta.albumName}`)
    const relevance = terms.filter(term => text.includes(term)).length * 8
    const taste = familiar ? (variety == 'familiar' ? 18 : variety == 'balanced' ? 6 : -8) : variety == 'explore' ? 8 : 0
    return { row, artist, score: 50 - index * 0.7 + relevance + taste }
  })
  const artistCounts = new Map<string, number>()
  const result: TrackRecommendation[] = []
  while (candidates.length && result.length < limit) {
    let best = 0
    let bestScore = -Infinity
    candidates.forEach((item, index) => {
      const count = item.artist ? artistCounts.get(item.artist) ?? 0 : 0
      const score = item.score - count * (variety == 'familiar' ? 10 : variety == 'explore' ? 35 : 23)
      if (score > bestScore) { best = index; bestScore = score }
    })
    const [item] = candidates.splice(best, 1)
    if (item.artist) artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 1)
    result.push(item.row)
  }
  return result
}

export const sampleSeeds = (recent: AiRecommendSeed[], selected: AiRecommendSeed[]) => {
  const result: AiRecommendSeed[] = []
  const seen = new Set<string>()
  const artists = new Map<string, number>()
  // Interleave the two sources so a long playlist cannot overwhelm recent listening.
  for (let index = 0; index < 40; index++) {
    for (const song of [index < 15 ? recent[index] : undefined, selected[index]]) {
      if (!song?.name?.trim()) continue
      const key = trackSignature(song)
      const artist = normalize(song.singer)
      if (seen.has(key) || (artist && (artists.get(artist) ?? 0) >= 4)) continue
      seen.add(key)
      if (artist) artists.set(artist, (artists.get(artist) ?? 0) + 1)
      result.push({ name: song.name.slice(0, 120), singer: String(song.singer ?? '').slice(0, 80) })
      if (result.length >= 40) return result
    }
  }
  return result
}
