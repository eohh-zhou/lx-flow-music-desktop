import { normalize, trackSignature } from './ranking'
import { knownArtist } from './softwareProfile'
import type { SoftwarePreference, SoftwareProfile } from './softwareProfile'
import type { PlaylistContext } from './softwareCatalogue'

export interface SongAssociation {
  music: LX.Music.MusicInfoOnline
  score: number
  seed: SoftwarePreference
  contexts: string[]
  anchors: Array<{ seed: SoftwarePreference, score: number, contexts: string[] }>
}
export type SongAssociations = Map<string, SongAssociation>

export const sameRecording = (a: { name: string, singer: string }, b: { name: string, singer: string }) =>
  knownArtist(a.singer) && knownArtist(b.singer) && trackSignature(a) == trackSignature(b)

export const recommendationSeeds = (profile: SoftwareProfile, limit = 4, rotation = 0, requireArtist = false) => {
  const distinct: SoftwarePreference[] = []
  const seen = new Set<string>()
  const artists = new Set<string>()
  const current = profile.context.find(item => item.score >= 0.15 && (!requireArtist || knownArtist(item.track.singer)))
  const ordered = [current, ...profile.seeds].filter((item): item is SoftwarePreference => !!item && (!requireArtist || knownArtist(item.track.singer)))
  const artistKey = (item: SoftwarePreference) => knownArtist(item.track.singer) ? normalize(item.track.singer) : trackSignature(item.track)
  for (const item of ordered) {
    const key = artistKey(item)
    if (artists.has(key) || (profile.skips.get(trackSignature(item.track)) ?? 0) >= 1.5) continue
    artists.add(key); distinct.push(item)
  }
  const behavior = distinct.filter(item => item.basis != 'playlist').slice(0, 12)
  const library = distinct.filter(item => item.basis == 'playlist')
  const candidates = behavior.slice(0, 8)
  const count = Math.min(12 - candidates.length, library.length)
  for (let index = 0; index < count; index++) {
    const position = index % 2 ? count - 1 - Math.floor(index / 2) : Math.floor(index / 2)
    candidates.push(library[Math.round(position * (library.length - 1) / Math.max(1, count - 1))])
  }
  for (const item of behavior.slice(8)) if (candidates.length < 12) candidates.push(item)
  // Keep one current listening anchor; rotate the remaining slots through a
  // bounded set of genuine preferences rather than querying the same top four.
  const result = current && candidates.includes(current) ? [current] : []
  const others = candidates.filter(item => !result.includes(item))
  const offset = others.length ? Math.max(0, Math.floor(rotation)) % others.length : 0
  for (let index = 0; index < others.length && result.length < limit; index++) result.push(others[(index + offset) % others.length])
  for (const item of result) seen.add(trackSignature(item.track))
  const counts = new Map<string, number>()
  for (const item of result) counts.set(artistKey(item), (counts.get(artistKey(item)) ?? 0) + 1)
  // Small libraries may have several songs but only one or two artists.
  for (const item of ordered) {
    if (result.length >= limit) break
    const key = artistKey(item)
    const signature = trackSignature(item.track)
    if (seen.has(signature) || (counts.get(key) ?? 0) >= 2 || (profile.skips.get(signature) ?? 0) >= 1.5) continue
    seen.add(signature); counts.set(key, (counts.get(key) ?? 0) + 1); result.push(item)
  }
  return result
}

export const associationSeeds = (profile: SoftwareProfile, limit = 4, rotation = 0) => recommendationSeeds(profile, limit, rotation, true)

// Sparse item-to-item cosine over verified public playlist contexts, with size weighting
// and low-support shrinkage. Contexts represent co-curation, not user listening logs.
export const buildSongAssociations = (raw: PlaylistContext[], profile: SoftwareProfile, representatives = associationSeeds(profile)): SongAssociations => {
  const seeds = new Map(profile.seeds.slice(0, 80).map(seed => [trackSignature(seed.track), seed]))
  // Every queried representative must remain eligible even beyond the scoring sample.
  for (const seed of representatives) seeds.set(trackSignature(seed.track), seed)
  for (const item of profile.context) {
    if (item.score < 0.15) continue
    const key = trackSignature(item.track)
    seeds.set(key, { ...item, score: Math.max(item.score, seeds.get(key)?.score ?? 0) })
  }
  const contexts: Array<{ id: string, keys: Set<string>, tracks: LX.Music.MusicInfoOnline[], anchors: SoftwarePreference[], weight: number }> = []
  for (const list of raw.slice(0, 4).sort((a, b) => a.id.localeCompare(b.id))) {
    const tracks = [...new Map(list.tracks.map(track => [trackSignature(track), track])).values()]
    const keys = new Set(tracks.map(trackSignature))
    if (contexts.some(context => {
      if (context.id == list.id) return true
      const shared = [...keys].filter(key => context.keys.has(key)).length
      return shared / Math.max(1, keys.size + context.keys.size - shared) >= 0.85
    })) continue
    const anchors = tracks.flatMap(track => {
      const seed = seeds.get(trackSignature(track))
      return seed && sameRecording(track, seed.track) ? [seed] : []
    })
    if (!anchors.length) continue
    const negative = tracks.reduce((sum, track) => sum + Math.min(1, profile.skips.get(trackSignature(track)) ?? 0), 0)
    const weight = Math.sqrt(40 / Math.max(40, list.total, tracks.length)) / (1 + Math.min(0.6, negative * 0.15))
    contexts.push({ id: list.id, keys, tracks, anchors, weight })
  }
  const frequency = new Map<string, number>()
  for (const context of contexts) {
    for (const key of context.keys) frequency.set(key, (frequency.get(key) ?? 0) + context.weight)
  }
  const edges = new Map<string, { music: LX.Music.MusicInfoOnline, bySeed: Map<string, { seed: SoftwarePreference, weight: number, contexts: string[] }>, contexts: Set<string> }>()
  for (const context of contexts) {
    for (const music of context.tracks) {
      const key = trackSignature(music)
      let edge = edges.get(key)
      if (!edge) edges.set(key, edge = { music, bySeed: new Map(), contexts: new Set() })
      edge.contexts.add(context.id)
      for (const seed of context.anchors) {
        const seedKey = trackSignature(seed.track)
        if (seedKey == key) continue
        const value = edge.bySeed.get(seedKey)
        edge.bySeed.set(seedKey, { seed, weight: (value?.weight ?? 0) + context.weight, contexts: [...(value?.contexts ?? []), context.id] })
      }
    }
  }
  const associations: SongAssociations = new Map()
  for (const [key, edge] of edges) {
    const strengths = [...edge.bySeed.entries()].map(([seedKey, value]) => {
      const cosine = value.weight / Math.sqrt((frequency.get(key) ?? 1) * (frequency.get(seedKey) ?? 1))
      const confidence = value.weight / (value.contexts.length + 2)
      // Absolute time decay is retained for a context from yesterday.
      const preference = value.seed.basis == 'context' ? Math.min(1, value.seed.score) : 0.35 + 0.65 * Math.min(1, value.seed.score)
      return { seed: value.seed, score: cosine * confidence * preference, contexts: value.contexts }
    }).sort((a, b) => b.score - a.score)
    if (!strengths.length || strengths[0].score <= 0) continue
    const score = Math.min(1, strengths[0].score + strengths.slice(1).reduce((sum, value) => sum + value.score * 0.2, 0))
    const association = { music: edge.music, score, seed: strengths[0].seed, contexts: [...edge.contexts], anchors: strengths.filter(item => item.score >= strengths[0].score * 0.4).slice(0, 4) }
    associations.set(key, association)
    associations.set(edge.music.id, association)
  }
  return associations
}

export const relatedCandidates = (associations: SongAssociations, allowed: (music: LX.Music.MusicInfoOnline) => boolean, limit: number) => {
  const remaining = [...new Map([...associations.values()].map(item => [trackSignature(item.music), item])).values()].filter(item => item.score >= 0.02 && allowed(item.music))
  const result: SongAssociation[] = []
  const artists = new Map<string, number>()
  const directions = new Map<string, number>()
  const availableDirections = new Set(remaining.flatMap(item => item.anchors.map(anchor => trackSignature(anchor.seed.track))))
  const chooseAnchor = (item: SongAssociation, fresh = false) => item.anchors.filter(anchor => !fresh || !directions.has(trackSignature(anchor.seed.track))).sort((a, b) =>
    b.score / (1 + (directions.get(trackSignature(b.seed.track)) ?? 0)) - a.score / (1 + (directions.get(trackSignature(a.seed.track)) ?? 0)))[0]
  const priority = (item: SongAssociation, fresh: boolean) => {
    const anchor = chooseAnchor(item, fresh)
    if (!anchor) return -Infinity
    return anchor.score / (1 + (directions.get(trackSignature(anchor.seed.track)) ?? 0)) / (1 + (artists.get(normalize(item.music.singer)) ?? 0) * 0.5)
  }
  while (remaining.length && result.length < limit) {
    const fresh = result.length < Math.min(limit, 4, availableDirections.size) && remaining.some(item => chooseAnchor(item, true))
    remaining.sort((a, b) => priority(b, fresh) - priority(a, fresh))
    const next = remaining.shift()!
    const anchor = chooseAnchor(next, fresh)
    result.push({ ...next, seed: anchor.seed, contexts: anchor.contexts })
    const direction = trackSignature(anchor.seed.track)
    directions.set(direction, (directions.get(direction) ?? 0) + 1)
    const artist = normalize(next.music.singer)
    artists.set(artist, (artists.get(artist) ?? 0) + 1)
  }
  return result
}
