import { isQualifiedListen } from '@common/types/listening'
import type { ListeningCheckpoint, ListeningTrack } from '@common/types/listening'
import { toLibraryTrack, type LibraryTrack } from '@common/types/library'
import { normalize, trackSignature } from './ranking'

export type PreferenceBasis = 'complete' | 'repeat' | 'time' | 'playlist' | 'context' | 'related'
export interface SoftwarePreference {
  track: ListeningTrack
  score: number
  basis: PreferenceBasis
}
export interface SoftwareProfile {
  seeds: SoftwarePreference[]
  artists: Map<string, { name: string, score: number, basis: PreferenceBasis }>
  library: LibraryTrack[]
  owned: Set<string>
  recent: Set<string>
  skips: Map<string, number>
  qualified: number
  recentWeight: number
  context: SoftwarePreference[]
  contextArtists: Map<string, number>
}

const day = 86400000
export const knownArtist = (name: string) => !!normalize(name) && !/^(未知歌手|未知艺术家|unknown(artist|singer)?)$/i.test(normalize(name))

export const buildListeningContext = (history: ListeningCheckpoint[], now: number) => {
  const ordered = history.filter(entry => entry?.track?.name && entry.updatedAt <= now && now - entry.updatedAt < day && isQualifiedListen(entry) && !entry.skipped)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId))
  const sessions = new Set<string>()
  const tracks = new Map<string, SoftwarePreference & { count: number }>()
  let previous = now
  let position = 0
  for (const entry of ordered) {
    if (sessions.has(entry.sessionId)) continue
    if (position && previous - entry.updatedAt > 45 * 60000) break
    if (position >= 12) break
    sessions.add(entry.sessionId)
    previous = entry.updatedAt
    const key = trackSignature(entry.track)
    const current = tracks.get(key)
    // Position and wall-clock age both matter; a loop contributes at most twice.
    const score = Math.exp(-position++ / 4) * Math.pow(0.5, (now - entry.updatedAt) / (4 * 3600000)) * (entry.completed ? 1 : 0.65)
    if (current) { if (current.count++ < 2) current.score += score * 0.5 } else tracks.set(key, { track: entry.track, score, basis: 'context', count: 1 })
  }
  return [...tracks.values()].map(({ count, ...item }) => item).sort((a, b) => b.score - a.score)
}

export const buildOwnedTrackKeys = (playlists: Array<Array<LibraryTrack | LX.Music.MusicInfo>>) => {
  const keys = new Set<string>()
  for (const list of playlists) {
    for (const track of list) {
      for (const song of [track, toLibraryTrack(track).matched]) {
        if (!song) continue
        keys.add(song.id)
        keys.add(trackSignature(song))
        keys.add(`name:${normalize(song.name)}`)
        if (!knownArtist(song.singer)) keys.add(`unknown:${normalize(song.name)}`)
      }
    }
  }
  return keys
}
export const isOwnedTrack = (track: Pick<ListeningTrack, 'id' | 'name' | 'singer'>, keys: Set<string>) => keys.has(track.id) || keys.has(trackSignature(track)) || keys.has(`unknown:${normalize(track.name)}`) || (!knownArtist(track.singer) && keys.has(`name:${normalize(track.name)}`))

export const buildSoftwareProfile = (playlists: Array<Array<LibraryTrack | LX.Music.MusicInfo>>, history: ListeningCheckpoint[], now = Date.now(), ownedPlaylists = playlists): SoftwareProfile => {
  const library = new Map<string, LibraryTrack>()
  for (const list of playlists) {
    // Spread the sample across a playlist rather than always taking its first songs.
    const step = Math.max(1, list.length / 120)
    for (let index = 0; index < list.length && index / step < 120; index += step) {
      const track = list[Math.floor(index)]
      if (track?.name?.trim()) library.set(trackSignature(track), toLibraryTrack(track))
    }
  }
  const groups = new Map<string, { track: ListeningTrack, days: Map<number, { completed: number, qualified: number, listened: number, skipped: number, decay: number }> }>()
  const recent = new Set<string>()
  const sessionIds = new Set<string>()
  for (const entry of history) {
    if (!entry?.track?.name || sessionIds.has(entry.sessionId) || !Number.isFinite(entry.updatedAt) || entry.updatedAt > now || now - entry.updatedAt > 30 * day) continue
    sessionIds.add(entry.sessionId)
    const key = trackSignature(entry.track)
    if (now - entry.updatedAt < day && isQualifiedListen(entry)) { recent.add(entry.track.id); recent.add(key) }
    let group = groups.get(key)
    if (!group) groups.set(key, group = { track: entry.track, days: new Map() })
    const date = Math.floor(entry.updatedAt / day)
    let daily = group.days.get(date)
    const decay = Math.pow(0.5, (now - entry.updatedAt) / (7 * day))
    if (!daily) group.days.set(date, daily = { completed: 0, qualified: 0, listened: 0, skipped: 0, decay })
    daily.decay = Math.max(daily.decay, decay)
    const qualified = isQualifiedListen(entry)
    if (entry.completed && qualified) daily.completed++
    if (qualified) {
      daily.qualified++
      daily.listened += Math.min(entry.listened, 600)
    }
    if (entry.skipped) daily.skipped++
  }
  const behavior: SoftwarePreference[] = []
  const skips = new Map<string, number>()
  const artistSkips = new Map<string, number>()
  let qualified = 0
  for (const [key, group] of groups) {
    let score = 0
    let completed = 0
    let plays = 0
    let skipScore = 0
    let decayedPlays = 0
    for (const [, value] of [...group.days.entries()].sort((a, b) => a[0] - b[0])) {
      const valid = Math.min(value.qualified, 3)
      qualified += valid
      plays += valid
      completed += Math.min(value.completed, 2)
      const repeat = Math.min(valid, Math.max(0, decayedPlays + valid - 1), 2)
      score += value.decay * (6 * Math.min(value.completed, 2) + 5 * repeat + Math.min(3, Math.log2(1 + Math.min(value.listened, 600) / 60)))
      decayedPlays += valid
      skipScore += Math.min(value.skipped, 3) * value.decay
    }
    if (skipScore) { skips.set(key, skipScore); skips.set(group.track.id, skipScore) }
    if (skipScore && knownArtist(group.track.singer)) {
      const artist = normalize(group.track.singer)
      artistSkips.set(artist, (artistSkips.get(artist) ?? 0) + skipScore)
    }
    score -= skipScore * 3
    if (score > 0) behavior.push({ track: group.track, score, basis: plays >= 2 ? 'repeat' : completed ? 'complete' : 'time' })
  }
  behavior.sort((a, b) => b.score - a.score)
  const recentWeight = qualified ? 0.65 + 0.2 * Math.min(1, qualified / 6) : 0
  const artistBehavior = new Map<string, { name: string, score: number, basis: PreferenceBasis }>()
  for (const preference of behavior) {
    if (!knownArtist(preference.track.singer)) continue
    const key = normalize(preference.track.singer)
    const previous = artistBehavior.get(key)
    if (previous) previous.score += Math.min(24, preference.score)
    else artistBehavior.set(key, { name: preference.track.singer, score: Math.min(24, preference.score), basis: preference.basis })
  }
  const artistLibrary = new Map<string, { name: string, count: number }>()
  for (const track of library.values()) {
    if (!knownArtist(track.singer)) continue
    const key = normalize(track.singer)
    const previous = artistLibrary.get(key)
    artistLibrary.set(key, { name: track.singer, count: Math.min(4, (previous?.count ?? 0) + 1) })
  }
  const maxBehavior = Math.max(1, ...Array.from(artistBehavior.values(), item => item.score))
  const maxLibrary = Math.max(1, ...Array.from(artistLibrary.values(), item => item.count))
  const artists: SoftwareProfile['artists'] = new Map()
  for (const key of new Set([...artistBehavior.keys(), ...artistLibrary.keys()])) {
    const current = artistBehavior.get(key)
    const saved = artistLibrary.get(key)
    artists.set(key, {
      name: current?.name ?? saved!.name,
      score: Math.max(0, recentWeight * (current?.score ?? 0) / maxBehavior + (1 - recentWeight) * (saved?.count ?? 0) / maxLibrary - Math.min(0.18, (artistSkips.get(key) ?? 0) * 0.06)),
      basis: current ? current.basis : 'playlist',
    })
  }
  const maxTrack = Math.max(1, ...behavior.map(item => item.score))
  const seeds = behavior.map(item => ({ ...item, score: recentWeight * item.score / maxTrack }))
  const existing = new Set(seeds.map(item => trackSignature(item.track)))
  for (const [key, track] of library) {
    if (!existing.has(key)) seeds.push({ track: { id: track.id, name: track.name, singer: track.singer, source: track.source }, score: (1 - recentWeight) * 0.3, basis: 'playlist' })
  }
  seeds.sort((a, b) => b.score - a.score)
  const context = buildListeningContext(history, now)
  const contextArtists = new Map<string, number>()
  for (const item of context) {
    if (!knownArtist(item.track.singer)) continue
    const artist = normalize(item.track.singer)
    contextArtists.set(artist, Math.min(1, (contextArtists.get(artist) ?? 0) + item.score))
  }
  return { seeds, artists, library: [...library.values()], owned: buildOwnedTrackKeys(ownedPlaylists), recent, skips, qualified, recentWeight, context, contextArtists }
}
