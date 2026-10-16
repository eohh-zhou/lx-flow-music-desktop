import { normalize, trackSignature } from './ranking'
import { knownArtist } from './softwareProfile'
import type { TrackRecommendation } from './ranking'
import type { RecommendationVariety } from '@common/types/aiRecommendation'

export interface MmrCandidate {
  row: SoftwareRecommendation
  relevance: number
  contexts: string[]
  directions?: Array<{ key: string, weight: number, reason: string }>
}

export interface SoftwareRecommendation extends TrackRecommendation {
  direction?: string
  reference?: string
  contexts?: string[]
}

export const recommendationDirection = (row: SoftwareRecommendation) => row.direction ?? `artist:${normalize(row.music.singer) || trackSignature(row.music)}`
const referenceLimit = 2

export const selectSoftwareBatch = (pool: SoftwareRecommendation[], options: {
  variety: RecommendationVariety
  seen?: Set<string>
  allowed?: (row: SoftwareRecommendation) => boolean
  limit?: number
}) => {
  const limit = options.limit ?? 20
  const counts = new Map<string, number>()
  const references = new Map<string, number>()
  const contexts = new Map<string, number>()
  const ids = new Set<string>()
  const signatures = new Set<string>()
  const result: SoftwareRecommendation[] = []
  const seen = options.seen ?? new Set<string>()
  for (const row of pool) {
    if (!(options.allowed?.(row) ?? true)) continue
    const signature = trackSignature(row.music)
    if (seen.has(row.music.id) || seen.has(signature) || ids.has(row.music.id) || signatures.has(signature)) continue
    const direction = recommendationDirection(row)
    const count = counts.get(direction) ?? 0
    const cap = direction.startsWith('seed:') ? referenceLimit
      : options.variety == 'familiar' ? 8 : options.variety == 'explore' ? 4 : 5
    if (count >= cap) continue
    const reference = row.reference ?? (direction.startsWith('seed:') ? direction : undefined)
    if (reference && (references.get(reference) ?? 0) >= referenceLimit) continue
    const evidence = [...new Set(row.contexts ?? [])]
    const contextCap = options.variety == 'familiar' ? 6 : options.variety == 'explore' ? 4 : 5
    if (evidence.some(id => (contexts.get(id) ?? 0) >= contextCap)) continue
    for (const id of evidence) contexts.set(id, (contexts.get(id) ?? 0) + 1)
    if (reference) references.set(reference, (references.get(reference) ?? 0) + 1)
    ids.add(row.music.id); signatures.add(signature)
    counts.set(direction, count + 1); result.push(row)
    if (result.length >= limit) break
  }
  return result
}

const versionlessName = (name: string) => normalize(name.replace(/[（([【][^）)\]】]*(?:live|remaster|acoustic|instrumental|伴奏|现场|重制|翻唱|cover)[^）)\]】]*[）)\]】]/gi, ''))
export const metadataSimilarity = (a: MmrCandidate, b: MmrCandidate) => {
  const first = a.row.music
  const second = b.row.music
  const artist = knownArtist(first.singer) && knownArtist(second.singer) && normalize(first.singer) == normalize(second.singer)
  const firstAlbum = String(first.meta.albumId ?? '').trim()
  const secondAlbum = String(second.meta.albumId ?? '').trim()
  const album = first.source == second.source && firstAlbum && firstAlbum != '0' && firstAlbum == secondAlbum
  const name = normalize(first.meta.albumName)
  const albumName = artist && name && !/^(unknown(album)?|未知专辑|未知專輯)$/.test(name) && name == normalize(second.meta.albumName)
  const version = artist && versionlessName(first.name) == versionlessName(second.name)
  const shared = a.contexts.filter(id => b.contexts.includes(id)).length
  const relation = shared / Math.max(1, new Set([...a.contexts, ...b.contexts]).size)
  return Math.max(version ? 0.98 : 0, album || albumName ? 0.92 : 0, artist ? 0.8 : 0, relation * 0.4)
}

// MMR: Carbonell & Goldstein (1998). Similarity here uses metadata and verified
// co-curation only; no audio embeddings or trained sequence model are implied.
export const rerankSoftwareMmr = (rows: MmrCandidate[], variety: RecommendationVariety, limit: number) => {
  const lambda = variety == 'familiar' ? 0.86 : variety == 'explore' ? 0.5 : 0.68
  const remaining = rows.map(item => ({ ...item, redundancy: 0 }))
  const result: SoftwareRecommendation[] = []
  const directions = new Map<string, number>()
  const distinctDirections = new Set(rows.flatMap(item => item.directions?.map(direction => direction.key) ?? []))
  const strongest = Math.max(0, ...rows.map(item => item.relevance))
  const minimum = variety == 'familiar' ? strongest * 0.4 : Math.min(0.15, strongest * 0.25)
  const selectDirection = (item: MmrCandidate, fresh = false) => item.directions?.filter(direction => !fresh || !directions.has(direction.key)).sort((a, b) =>
    (b.weight - (directions.get(b.key) ?? 0) * 0.55) - (a.weight - (directions.get(a.key) ?? 0) * 0.55))[0]
  while (remaining.length && result.length < limit) {
    if (result.length && result.length % 20 == 0) directions.clear()
    let best = 0
    let maximum = -Infinity
    const freshAvailable = result.length % 20 < Math.min(4, distinctDirections.size) && remaining.some(item => {
      return selectDirection(item, true) && item.relevance >= minimum
    })
    remaining.forEach((item, index) => {
      const direction = selectDirection(item, freshAvailable)
      const count = direction ? directions.get(direction.key) ?? 0 : 0
      if (freshAvailable && (!direction || item.relevance < minimum)) return
      const directionPenalty = count * (variety == 'familiar' ? 0.035 : variety == 'explore' ? 0.1 : 0.075)
      const value = lambda * item.relevance - (1 - lambda) * item.redundancy - directionPenalty - (direction ? (1 - direction.weight) * 0.06 : 0)
      if (value > maximum) { maximum = value; best = index }
    })
    const [selected] = remaining.splice(best, 1)
    const direction = selectDirection(selected, freshAvailable)
    result.push(direction ? { ...selected.row, direction: direction.key, reason: direction.reason, ...(direction.key.startsWith('seed:') ? { reference: direction.key } : {}), ...(selected.contexts.length ? { contexts: selected.contexts } : {}) } : selected.row)
    if (direction) directions.set(direction.key, (directions.get(direction.key) ?? 0) + 1)
    for (const item of remaining) item.redundancy = Math.max(item.redundancy, metadataSimilarity(item, selected))
  }
  return result
}
