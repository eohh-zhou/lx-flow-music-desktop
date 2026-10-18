// Recommendation inputs are identities, not playable music objects. Keep URLs,
// covers, quality metadata and local file metadata out of these snapshots.
export interface LibraryTrack {
  id: string
  name: string
  singer: string
  source: string
  matched?: { id: string, name: string, singer: string }
}

export const toLibraryTrack = (track: LX.Music.MusicInfo | LibraryTrack): LibraryTrack => {
  const matched = 'meta' in track
    ? track.source != 'local' ? track.meta.bilibili?.matchedMusic : undefined
    : track.matched
  return {
    id: track.id,
    name: track.name,
    singer: track.singer,
    source: track.source,
    ...(matched ? { matched: { id: matched.id, name: matched.name, singer: matched.singer } } : {}),
  }
}
