import { getListMusicLibrary } from '@renderer/store/list/listManage'
import type { LibraryTrack } from '@common/types/library'
import { userLists } from '@renderer/store/list/state'
import { getListening } from './listeningIpc'
import { checkCancelled } from './providers'
import { buildOwnedTrackKeys, buildSoftwareProfile } from './softwareProfile'
import { normalize, trackSignature } from './ranking'
import type { AiRecommendSeed } from '@common/types/aiRecommendation'
import type { SoftwarePreference } from './softwareProfile'

const tasteSeeds = (preferences: SoftwarePreference[], limit: number, seen = new Set<string>(), artists = new Map<string, number>()) => {
  const result: AiRecommendSeed[] = []
  for (const item of preferences) {
    if (result.length >= limit) break
    const signature = trackSignature(item.track)
    const artist = normalize(item.track.singer)
    if (seen.has(signature) || (artist && (artists.get(artist) ?? 0) >= 2)) continue
    seen.add(signature)
    if (artist) artists.set(artist, (artists.get(artist) ?? 0) + 1)
    result.push({ name: item.track.name.slice(0, 120), singer: item.track.singer.slice(0, 80), ...(item.basis != 'context' && item.basis != 'related' ? { basis: item.basis, weight: Math.round(item.score * 100) / 100 } : {}) })
  }
  return result
}

export const getRecommendationProfile = async(useProfile: boolean, listId: string, avoidRecent: boolean, signal = new AbortController().signal) => {
  const playlists: LibraryTrack[][] = []
  const owned: LibraryTrack[][] = []
  // Library exclusion always stays local, including when personalisation is off.
  // Only visible user playlists contribute taste; the legacy love/default lists do not.
  const ids = userLists.map(list => list.id)
  const selected = ids.includes(listId) ? listId : ''
  const history = useProfile || avoidRecent ? await getListening() : []
  checkCancelled(signal)
  for (const id of ids) {
    const songs = await getListMusicLibrary(id)
    checkCancelled(signal)
    owned.push(songs)
    if (useProfile && (!selected || selected == id)) playlists.push(songs)
  }
  const profile = buildSoftwareProfile(playlists, history)
  const seen = new Set<string>()
  const artists = new Map<string, number>()
  const eligible = profile.seeds.filter(item => (profile.skips.get(trackSignature(item.track)) ?? 0) < 2)
  const libraryByKey = new Map(eligible.filter(item => item.basis == 'playlist').map(item => [trackSignature(item.track), item]))
  const groups = playlists.map(list => [...new Set(list.map(trackSignature))].flatMap(key => { const item = libraryByKey.get(key); return item ? [item] : [] }))
  const libraryOrder: SoftwarePreference[] = []
  for (let index = 0; index < Math.max(0, ...groups.map(group => group.length)); index++) {
    for (const group of groups) if (group[index]) libraryOrder.push(group[index])
  }
  const primary = useProfile ? tasteSeeds(eligible.filter(item => item.basis != 'playlist'), 18, seen, artists) : []
  const library = useProfile ? tasteSeeds(libraryOrder, 24 - primary.length, seen, artists) : []
  const extra = useProfile ? tasteSeeds(eligible, 24 - primary.length - library.length, seen, artists) : []
  const avoided = useProfile ? [...history].filter(item => item.skipped && (profile.skips.get(trackSignature(item.track)) ?? 0) >= 1)
    .sort((a, b) => (profile.skips.get(trackSignature(b.track)) ?? 0) - (profile.skips.get(trackSignature(a.track)) ?? 0)) : []
  return {
    seeds: [...primary, ...library, ...extra],
    recentSeeds: useProfile ? tasteSeeds(profile.context, 6) : [],
    avoidedSeeds: tasteSeeds(avoided.map(item => ({ track: item.track, score: 0, basis: 'context' })), 6),
    recent: avoidRecent ? profile.recent : new Set<string>(),
    owned: buildOwnedTrackKeys(owned),
    skipped: new Set(useProfile ? [...profile.skips].filter(([, score]) => score >= 2).map(([key]) => key) : []),
  }
}
