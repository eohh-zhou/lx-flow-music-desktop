import { onBeforeUnmount, reactive, ref, watch } from '@common/utils/vueTools'
import type { Ref } from '@common/utils/vueTools'
import { getListMusicHead } from '@renderer/store/list/listManage'
import { getPicPath } from '@renderer/core/music'

export default (ids: Ref<string[]>, enabled: Ref<boolean>) => {
  const playlistCovers = reactive<Record<string, string>>({})
  const visible = ref(!document.hidden)
  const revisions = new Map<string, number>()
  const resolved = new Map<string, { trackId: string, cover: string }>()
  const queued = new Set<string>()
  const pending = new Set<string>()
  let revision = 0
  let disposed = false
  const active = () => !disposed && enabled.value && visible.value

  const load = async(id: string, version: number) => {
    try {
      const song = await getListMusicHead(id)
      if (disposed || revisions.get(id) !== version) return
      if (!active()) { queued.add(id); return }
      const previous = resolved.get(id)
      const trackId = song ? `${song.source}:${song.id}` : ''
      const cover = song
        ? song.meta.picUrl || (previous?.trackId === trackId ? previous.cover : await getPicPath({ musicInfo: song, listId: id }))
        : ''
      if (disposed || revisions.get(id) !== version) return
      resolved.set(id, { trackId, cover })
      playlistCovers[id] = cover
    } catch {
      if (!disposed && revisions.get(id) === version) playlistCovers[id] = ''
    } finally {
      pending.delete(id)
      pump()
    }
  }
  const pump = () => {
    if (!active()) return
    for (const id of queued) {
      if (pending.size >= 2) break
      if (pending.has(id)) continue
      queued.delete(id)
      pending.add(id)
      void load(id, revisions.get(id)!)
    }
  }
  const invalidate = (changed: string[]) => {
    for (const id of changed) {
      if (!revisions.has(id)) continue
      revisions.set(id, ++revision)
      queued.add(id)
    }
    pump()
  }
  watch(ids, (current) => {
    const retained = new Set(current)
    for (const id of revisions.keys()) {
      if (retained.has(id)) continue
      revisions.delete(id)
      resolved.delete(id)
      queued.delete(id)
      Reflect.deleteProperty(playlistCovers, id)
    }
    for (const id of current) {
      if (revisions.has(id)) continue
      revisions.set(id, ++revision)
      queued.add(id)
    }
    pump()
  }, { immediate: true })
  watch([enabled, visible], pump)
  const handleVisibility = () => { visible.value = !document.hidden }
  const handleCoverError = (id?: string) => {
    if (id) playlistCovers[id] = ''
  }
  document.addEventListener('visibilitychange', handleVisibility)
  window.app_event.on('myListUpdate', invalidate)
  onBeforeUnmount(() => {
    disposed = true
    queued.clear()
    resolved.clear()
    revisions.clear()
    document.removeEventListener('visibilitychange', handleVisibility)
    window.app_event.off('myListUpdate', invalidate)
  })
  return { playlistCovers, handleCoverError }
}
