import { durationSeconds, normalize, selectTracks, trackSignature } from './ranking'
import { searchTracks, checkCancelled } from './providers'
import { SoftwareBudgetExhausted, SoftwareRequestBudget } from './softwareRequests'
import { getPlaylistContext, searchPlaylistContexts } from './softwareCatalogue'
import { associationSeeds, recommendationSeeds, buildSongAssociations, relatedCandidates, sameRecording } from './softwareAssociations'
import { rerankSoftwareMmr } from './softwareMmr'
import type { TrackRecommendation } from './ranking'
import type { PreferenceBasis, SoftwareProfile } from './softwareProfile'
import { isOwnedTrack } from './softwareProfile'
import type { PlaylistContext } from './softwareCatalogue'
import type { SongAssociations } from './softwareAssociations'
import type { MmrCandidate, SoftwareRecommendation } from './softwareMmr'
import type { RecommendationSource, RecommendationVariety } from '@common/types/aiRecommendation'

export type SoftwareSource = RecommendationSource | 'all'
export const softwareSources: RecommendationSource[] = ['tx', 'wy', 'bili']

interface SoftwareRankingOptions {
  source: SoftwareSource
  blocked: Set<string>
  avoidRecent: boolean
  variety: RecommendationVariety
  reason: (basis: PreferenceBasis, name: string) => string
  limit?: number
  seen?: Set<string>
  associations?: SongAssociations
  rotation?: number
}

const relevance = (row: TrackRecommendation, profile: SoftwareProfile, options: SoftwareRankingOptions) => {
  const music = row.music
  const signature = trackSignature(music)
  const artist = normalize(music.singer)
  const association = options.associations?.get(music.id) ?? options.associations?.get(signature)
  const preference = profile.artists.get(artist)
  const context = profile.contextArtists.get(artist) ?? 0
  const skip = Math.max(profile.skips.get(music.id) ?? 0, profile.skips.get(signature) ?? 0)
  const taste = (preference?.score ?? 0) * (options.variety == 'familiar' ? 0.52 : options.variety == 'explore' ? 0.24 : 0.38)
  // A single co-curated playlist is useful evidence, not near-certain affinity.
  const confidence = association ? association.score / (association.score + 0.25) : 0
  const relation = association ? confidence * (options.variety == 'familiar' ? 0.24 : options.variety == 'explore' ? 0.6 : 0.48) + association.score * 0.15 : 0
  return { association, preference, context, skip, score: Math.max(0, Math.min(1, 0.15 + taste + relation + context * 0.22 - skip * 0.16 - (profile.recent.has(signature) ? 0.08 : 0))) }
}

export const rankSoftwareTracks = (rows: SoftwareRecommendation[], profile: SoftwareProfile, options: SoftwareRankingOptions) => {
  const candidates: MmrCandidate[] = []
  const ids = new Set<string>()
  const signatures = new Set<string>()
  const directArtists = new Map(rows.filter(row => row.direction == `artist:${normalize(row.music.singer)}`).map(row => [trackSignature(row.music), row.reference]))
  for (const source of softwareSources) {
    if (options.source != 'all' && options.source != source) continue
    const ordered = rows.filter(row => row.music.source == source && !isOwnedTrack(row.music, profile.owned)).sort((a, b) => relevance(b, profile, options).score - relevance(a, profile, options).score)
    const valid = selectTracks(ordered, { source, blocked: options.blocked, seen: options.avoidRecent ? profile.recent : new Set(), limit: 120 })
    for (const row of valid) {
      const music = row.music
      const signature = trackSignature(music)
      if (ids.has(music.id) || signatures.has(signature) || options.seen?.has(music.id) === true || options.seen?.has(signature) === true) continue
      ids.add(music.id); signatures.add(signature)
      const { association, preference, context, skip, score } = relevance(row, profile, options)
      if (skip >= 1.5) continue
      const direct = directArtists.has(signature) && !!preference && preference.score > 0
      const related = direct ? undefined : association
      const reason = related ? options.reason('related', related.seed.track.name)
        : context >= 0.15 ? options.reason('context', music.singer)
          : preference ? options.reason(preference.basis, preference.name) : row.reason
      candidates.push({
        row: { ...row, reason, ...(direct && directArtists.get(signature) ? { reference: directArtists.get(signature) } : {}) },
        relevance: score,
        contexts: related ? related.contexts : [],
        directions: related ? related.anchors.map(anchor => ({ key: `seed:${trackSignature(anchor.seed.track)}`, weight: anchor.score / Math.max(...related.anchors.map(item => item.score)), reason: options.reason('related', anchor.seed.track.name) }))
          : [{ key: direct ? `artist:${normalize(music.singer)}` : (row as SoftwareRecommendation).direction ?? `artist:${normalize(music.singer)}`, weight: 1, reason }],
      })
    }
  }
  return rerankSoftwareMmr(candidates, options.variety, options.limit ?? 60)
}

export const softwareQueries = (profile: SoftwareProfile, source: SoftwareSource, variety: RecommendationVariety = 'balanced', rotation = 0) => {
  const seeds = recommendationSeeds(profile, 4, rotation)
  const sources = source == 'all' ? softwareSources : [source]
  return sources.flatMap((platform, index) => {
    const count = source == 'all' ? (variety == 'explore' ? 1 : 2) : variety == 'explore' ? 2 : 4
    const selected = Array.from({ length: Math.min(count, seeds.length) }, (_, offset) => seeds[(index + offset) % seeds.length])
    const used = new Set<string>()
    return selected.flatMap(seed => {
      const keyword = profile.artists.has(normalize(seed.track.singer)) ? seed.track.singer.trim() : seed.track.name.trim()
      const key = normalize(keyword)
      if (used.has(key)) return []
      used.add(key)
      return [{ source: platform, seed, keyword }]
    })
  }).slice(0, 6)
}

export const generateSoftwareTracks = async(profile: SoftwareProfile, options: Parameters<typeof rankSoftwareTracks>[2] & { signal: AbortSignal, allowed: (music: LX.Music.MusicInfoOnline) => boolean, onResults?: (rows: TrackRecommendation[]) => void }) => {
  const rows: SoftwareRecommendation[] = []
  let associations: SongAssociations = new Map()
  const contexts: PlaylistContext[] = []
  const budget = new SoftwareRequestBudget(options.signal)
  const tasks = softwareQueries(profile, options.source, options.variety, options.rotation)
  const sources = options.source == 'all' ? softwareSources : [options.source]
  const failedSources = new Set<RecommendationSource>()
  let failures = 0
  const ranked = () => rankSoftwareTracks(rows.filter(row => options.allowed(row.music)), profile, { ...options, associations })
  const publish = () => {
    if (!options.onResults) return
    const pool = ranked()
    if (pool.length) options.onResults(pool)
  }
  const failed = (error: unknown) => { checkCancelled(options.signal); if (!(error instanceof SoftwareBudgetExhausted)) failures++ }
  const search = async(source: RecommendationSource, keyword: string, page = 1) => {
    if (failedSources.has(source)) return []
    try { return await budget.run(async() => searchTracks(source, keyword, options.signal, page)) } catch (error) {
      failed(error)
      if (!(error instanceof SoftwareBudgetExhausted)) failedSources.add(source)
      return []
    }
  }
  const consider = (music: LX.Music.MusicInfoOnline) => !isOwnedTrack(music, profile.owned) && !options.blocked.has(music.id) && !options.blocked.has(trackSignature(music)) &&
    !(options.seen?.has(music.id) === true || options.seen?.has(trackSignature(music)) === true) &&
    !(options.avoidRecent && (profile.recent.has(music.id) || profile.recent.has(trackSignature(music)))) &&
    Math.max(profile.skips.get(music.id) ?? 0, profile.skips.get(trackSignature(music)) ?? 0) < 1.5 && options.allowed(music)

  const retrieveArtists = async() => Promise.all(sources.map(async source => {
    const planned = tasks.filter(task => task.source == source)
    if (!planned.length) return
    let hadNew = false
    const slots = planned.length == 1 || options.source == 'all' || options.variety == 'explore' ? 2 : 4
    for (let index = 0; index < slots; index++) {
      checkCancelled(options.signal)
      const page = index < planned.length ? 1 : 2
      const task = planned[index] ?? (!hadNew ? planned[(index - planned.length) % planned.length] : undefined)
      if (!task || failedSources.has(source)) break
      const result = await search(task.source, task.keyword, page)
      checkCancelled(options.signal)
      if (rankSoftwareTracks(result.filter(row => options.allowed(row.music)), profile, { ...options, limit: 1 }).length) hadNew = true
      rows.push(...result.map(row => ({ ...row, direction: profile.artists.has(normalize(task.keyword)) ? `artist:${normalize(task.keyword)}` : `seed:${trackSignature(task.seed.track)}`, reference: `seed:${trackSignature(task.seed.track)}`, reason: options.reason(task.seed.basis, task.seed.track.singer || task.seed.track.name) })))
      publish()
    }
  }))

  const retrieveRelations = async() => {
    const requested = new Map<string, Promise<PlaylistContext>>()
    const representatives = associationSeeds(profile, options.variety == 'familiar' ? 3 : 4, options.rotation)
    const plans = await Promise.all(representatives.map(async seed => {
      try {
        // Song titles find mixed-artist contexts; exact overlap is checked locally.
        const keyword = options.variety == 'familiar' ? `${seed.track.name} ${seed.track.singer}` : seed.track.name
        const ids = await searchPlaylistContexts(keyword, budget, options.signal)
        return { seed, ids }
      } catch (error) { failed(error); return { seed, ids: [] } }
    }))
    const contextLimit = options.variety == 'familiar' ? Math.min(3, representatives.length) : 4
    const covered = (plan: typeof plans[number]) => contexts.some(list => list.tracks.some(track => sameRecording(track, plan.seed.track)))
    const readContexts = async(selected: typeof plans, page: number) => {
      await Promise.all(selected.map(async plan => {
        const id = plan.ids[page]
        if (!id || contexts.length >= contextLimit) return
        try {
          let pending = requested.get(id)
          if (!pending) {
            pending = getPlaylistContext(id, budget, options.signal)
            requested.set(id, pending)
          }
          const list = await pending
          checkCancelled(options.signal)
          if (contexts.length < contextLimit && !contexts.some(context => context.id == list.id) && list.tracks.some(track => sameRecording(track, plan.seed.track))) contexts.push(list)
        } catch (error) { failed(error) }
      }))
    }
    // A search for seed B must not quietly strengthen seed A. Give missing
    // representatives their second result before expanding an already found one.
    await readContexts(plans, 0)
    await readContexts(plans.filter(plan => !covered(plan)), 1)
    await readContexts(plans.filter(covered), 1)
    checkCancelled(options.signal)
    associations = buildSongAssociations(contexts, profile, representatives)
    if (sources.includes('wy')) {
      const direct = relatedCandidates(associations, consider, 80)
      rows.push(...direct.map(item => ({ music: item.music, reason: options.reason('related', item.seed.track.name), origin: 'search' as const })))
      publish()
    }
    const targets = sources.filter(source => source != 'wy')
    if (!targets.length) return
    const related = relatedCandidates(associations, consider, options.variety == 'familiar' ? 2 : options.variety == 'explore' ? 8 : 6)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(2, related.length) }, async() => {
      while (cursor < related.length) {
        checkCancelled(options.signal)
        const index = cursor++
        const item = related[index]
        const source = targets[index % targets.length]
        const result = await search(source, `${item.music.name} ${item.music.singer}`)
        checkCancelled(options.signal)
        const duration = durationSeconds(item.music.interval)
        const match = result.find(row => {
          const seconds = durationSeconds(row.music.interval)
          return sameRecording(row.music, item.music) && (duration < 60 || !seconds || (seconds >= duration * 0.65 && seconds <= duration * 1.4)) && consider(row.music)
        })
        if (!match) continue
        const evidence = { ...item, music: match.music }
        associations.set(match.music.id, evidence)
        associations.set(trackSignature(match.music), evidence)
        rows.push({ ...match, reason: options.reason('related', item.seed.track.name) })
        publish()
      }
    }))
  }

  try {
    await Promise.all([retrieveArtists(), retrieveRelations()])
    checkCancelled(options.signal)
    return { pool: ranked(), partial: failures > 0, requests: budget.requests }
  } finally { budget.close() }
}
