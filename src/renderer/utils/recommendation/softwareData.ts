import { getListMusics } from '@renderer/store/list/listManage'
import { userLists } from '@renderer/store/list/state'
import { getListening } from './listeningIpc'
import { buildOwnedTrackKeys, buildSoftwareProfile } from './softwareProfile'
import { checkCancelled } from './providers'

export const getSoftwareProfile = async(selected: string[] | null, signal: AbortSignal) => {
  const ids = userLists.map(list => list.id)
  const playlists: LX.Music.MusicInfo[][] = []
  const owned: LX.Music.MusicInfo[][] = []
  const history = await getListening()
  checkCancelled(signal)
  for (const id of ids) {
    const songs = await getListMusics(id)
    owned.push(songs)
    if (selected == null || selected.includes(id)) playlists.push(songs)
    checkCancelled(signal)
  }
  return buildSoftwareProfile(playlists, history, Date.now(), owned)
}

export const getOwnedLibraryKeys = async(signal: AbortSignal) => {
  const lists: LX.Music.MusicInfo[][] = []
  for (const id of userLists.map(list => list.id)) {
    lists.push(await getListMusics(id))
    checkCancelled(signal)
  }
  return buildOwnedTrackKeys(lists)
}
