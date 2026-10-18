import { filterTracks, normalize, trackSignature } from './ranking'
import { isOwnedTrack, knownArtist } from './softwareProfile'
import { metadataSimilarity } from './softwareMmr'
import type { TrackRecommendation, SelectionOptions } from './ranking'
import type { AiRecommendIntent, AiRecommendRank } from '@common/types/aiRecommendation'

export interface AiTrackRecommendation extends TrackRecommendation {
  ai?: { relevance: number, directions: string[] }
}

export interface AiSelectionOptions extends SelectionOptions {
  owned?: Set<string>
  allowed?: (music: LX.Music.MusicInfoOnline) => boolean
}

export const filterAiTracks = (rows: AiTrackRecommendation[], options: AiSelectionOptions) => {
  const owned = options.owned ?? new Set<string>()
  return filterTracks(rows, options).filter(row => !isOwnedTrack(row.music, owned) && (options.allowed?.(row.music) ?? true))
}

// Concrete song suggestions are retrieval targets, never playable model output.
// A failed exact match must not turn into an unrelated top search result.
export const matchesAiTarget = (music: LX.Music.MusicInfoOnline, intent: AiRecommendIntent) => !intent.target || (
  knownArtist(music.singer) && normalize(music.name) == normalize(intent.target.name) && normalize(music.singer) == normalize(intent.target.singer)
)

export interface AiRetrieval {
  intent: AiRecommendIntent
  key: string
  rows: TrackRecommendation[]
}

export const fuseAiCandidates = (branches: AiRetrieval[], options: AiSelectionOptions): AiTrackRecommendation[] => {
  const fused = new Map<string, { row: TrackRecommendation, score: number, directions: string[] }>()
  // Additional pages belong to one retrieval direction, not independent votes.
  const directions = new Map<string, AiRetrieval>()
  for (const branch of branches) {
    const previous = directions.get(branch.key)
    directions.set(branch.key, previous ? { ...previous, rows: [...previous.rows, ...branch.rows] } : branch)
  }
  for (const branch of directions.values()) {
    const rows = filterAiTracks(branch.rows.filter(row => matchesAiTarget(row.music, branch.intent)), options)
    rows.forEach((row, index) => {
      const key = trackSignature(row.music)
      const previous = fused.get(key)
      const weight = branch.intent.kind == 'track' ? 1.15 : 1
      // Reciprocal Rank Fusion (Cormack et al., 2009), k=60. Duplicate releases
      // within one branch cannot manufacture support from multiple directions.
      const score = weight / (60 + index + 1)
      if (previous) {
        previous.score += score
        if (!previous.directions.includes(branch.key)) previous.directions.push(branch.key)
      } else fused.set(key, { row, score, directions: [branch.key] })
    })
  }
  const maximum = Math.max(1 / 61, ...Array.from(fused.values(), item => item.score))
  const artists = new Set((options.seeds ?? []).map(seed => normalize(seed.singer)).filter(Boolean))
  const rows = Array.from(fused.values(), item => {
    const familiar = artists.has(normalize(item.row.music.singer))
    const taste = options.variety == 'familiar' ? (familiar ? 0.1 : 0) : options.variety == 'explore' ? (familiar ? 0 : 0.08) : familiar ? 0.03 : 0
    return { ...item.row, ai: { relevance: Math.min(1, item.score / maximum * 0.9 + taste), directions: item.directions } }
  })
  return selectAiBatch(rows, { ...options, limit: 40 })
}

export const applyAiRanks = (candidates: AiTrackRecommendation[], ranks: AiRecommendRank[]) => {
  const byId = new Map(candidates.map(row => [row.music.id, row]))
  const excluded = new Set(ranks.filter(rank => rank.exclude && byId.has(rank.id)).map(rank => rank.id))
  const used = new Set<string>()
  const ordered: AiTrackRecommendation[] = []
  const accepted = ranks.filter(rank => byId.has(rank.id) && !rank.exclude && !excluded.has(rank.id))
    .filter((rank, index, list) => list.findIndex(item => item.id == rank.id) == index)
  for (const rank of accepted) {
    if (used.has(rank.id)) continue
    used.add(rank.id)
    const row = byId.get(rank.id)!
    const rankScore = 1 - ordered.length / Math.max(accepted.length + 8, 16)
    const modelScore = typeof rank.score == 'number' && Number.isFinite(rank.score) ? Math.max(0, Math.min(1, rank.score)) : rankScore
    const relevance = 0.8 * modelScore + 0.1 * rankScore + 0.1 * (row.ai?.relevance ?? 0.5)
    ordered.push({ ...row, reason: typeof rank.reason == 'string' ? rank.reason.slice(0, 120) : '', ai: { relevance, directions: row.ai?.directions ?? [] } })
  }
  if (!ordered.length && !excluded.size) throw new Error('ai_recommend__error_response')
  // A successful model response is a shortlist. Omitted or rejected candidates
  // must not re-enter merely to fill a page, including after cache restoration.
  return ordered
}

// Keep model relevance as the primary score. MMR reduces redundant artists,
// albums and versions instead of running the old keyword selector over AI order.
export const selectAiBatch = (pool: AiTrackRecommendation[], options: AiSelectionOptions): AiTrackRecommendation[] => {
  const remaining = filterAiTracks(pool, options).map((row, index) => ({ row, relevance: row.ai?.relevance ?? 1 - index / Math.max(pool.length + 8, 16), redundancy: 0 }))
  const lambda = options.variety == 'familiar' ? 0.9 : options.variety == 'explore' ? 0.62 : 0.78
  const result: AiTrackRecommendation[] = []
  const counts = new Map<string, number>()
  const directions = new Map<string, number>()
  while (remaining.length && result.length < (options.limit ?? 20)) {
    let best = 0
    let score = -Infinity
    remaining.forEach((item, index) => {
      const artist = knownArtist(item.row.music.singer) ? normalize(item.row.music.singer) : ''
      const count = artist ? counts.get(artist) ?? 0 : 0
      const keys = item.row.ai?.directions ?? []
      const directionCount = keys.length ? Math.min(...keys.map(key => directions.get(key) ?? 0)) : 0
      const value = lambda * item.relevance - (1 - lambda) * item.redundancy - count * (options.variety == 'familiar' ? 0.025 : options.variety == 'explore' ? 0.12 : 0.075) - directionCount * 0.025
      if (value > score) { best = index; score = value }
    })
    const [selected] = remaining.splice(best, 1)
    result.push(selected.row)
    const artist = normalize(selected.row.music.singer)
    if (knownArtist(selected.row.music.singer)) counts.set(artist, (counts.get(artist) ?? 0) + 1)
    const direction = selected.row.ai?.directions.slice().sort((a, b) => (directions.get(a) ?? 0) - (directions.get(b) ?? 0))[0]
    if (direction) directions.set(direction, (directions.get(direction) ?? 0) + 1)
    for (const item of remaining) item.redundancy = Math.max(item.redundancy, metadataSimilarity({ row: item.row, relevance: item.relevance, contexts: [] }, { row: selected.row, relevance: selected.relevance, contexts: [] }))
  }
  return result
}
