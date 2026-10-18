import { getListMusicLibrary } from '@renderer/store/list/listManage'
import type { LibraryTrack } from '@common/types/library'
import { userLists } from '@renderer/store/list/state'
import { getListening } from './listeningIpc'
import { buildOwnedTrackKeys, buildSoftwareProfile } from './softwareProfile'
import { checkCancelled } from './providers'

export const getSoftwareProfile = async(selected: string[] | null, signal: AbortSignal) => {
  const ids = userLists.map(list => list.id)
  const playlists: LibraryTrack[][] = []
  const owned: LibraryTrack[][] = []
  const history = await getListening()
  checkCancelled(signal)
  for (const id of ids) {
    const songs = await getListMusicLibrary(id)
    owned.push(songs)
    if (selected == null || selected.includes(id)) playlists.push(songs)
    checkCancelled(signal)
  }
  return buildSoftwareProfile(playlists, history, Date.now(), owned)
}

export const getOwnedLibraryKeys = async(signal: AbortSignal) => {
  const lists: LibraryTrack[][] = []
  for (const id of userLists.map(list => list.id)) {
    lists.push(await getListMusicLibrary(id))
    checkCancelled(signal)
  }
  return buildOwnedTrackKeys(lists)
}
