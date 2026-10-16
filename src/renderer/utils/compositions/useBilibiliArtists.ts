import { onBeforeUnmount, onMounted, ref, watch, type Ref } from '@common/utils/vueTools'
import { getMetadataKey, parseTrackMetadata } from '@renderer/utils/musicSdk/bili/metadata'
import { requestBilibiliMetadata } from '@renderer/core/music/bilibiliMetadataQueue'

interface VisibleList {
  views: Array<{ item: LX.Music.MusicInfo, index: number }>
  dom_scrollContainer: HTMLElement
  itemHeight: number
}

export default (listRef: Ref<VisibleList | null>, onResolved: (musicInfo: LX.Music.MusicInfoOnline) => void) => {
  const artists = ref(new Map<string, string>())
  const finished = ref(new Set<string>())
  const requests = new Map<string, () => void>()
  const currentItems = new Map<string, string>()
  let visible = false
  let disposed = false
  let observer: IntersectionObserver | null = null
  const cancelAll = () => {
    for (const cancel of requests.values()) cancel()
    requests.clear()
  }

  const update = () => {
    if (disposed || !visible || document.hidden) { cancelAll(); return }
    const list = listRef.value
    const element = list?.dom_scrollContainer
    const items = list?.views?.filter(view => element &&
      (view.index + 1) * list.itemHeight > element.scrollTop &&
      view.index * list.itemHeight < element.scrollTop + element.clientHeight).map(view => view.item) ?? []
    const ids = new Set(items.map(item => item.id))
    const keys = new Map(items.map(item => [item.id, getMetadataKey(item)]))
    for (const [id, cancel] of requests) {
      if (!ids.has(id)) { cancel(); requests.delete(id) }
    }
    for (const [id, key] of currentItems) {
      if (keys.get(id) != key) {
        requests.get(id)?.()
        requests.delete(id)
        currentItems.delete(id)
        artists.value.delete(id)
        finished.value.delete(id)
      }
    }
    for (const item of items) {
      const key = getMetadataKey(item)
      currentItems.set(item.id, key)
      if (item.source != 'bili' || (item.meta.bilibili && item.singer) || finished.value.has(item.id) || requests.has(item.id)) continue
      requests.set(item.id, requestBilibiliMetadata(item, resolved => {
        requests.delete(item.id)
        if (disposed || currentItems.get(item.id) != key) return
        artists.value.set(item.id, resolved?.singer ?? '')
        finished.value.add(item.id)
        if (resolved) onResolved(resolved)
      }))
    }
  }

  watch(() => listRef.value?.views, update)
  watch(() => listRef.value?.dom_scrollContainer, element => {
    observer?.disconnect()
    visible = false
    cancelAll()
    if (!element) return
    observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting)
      update()
    })
    observer.observe(element)
  }, { immediate: true })
  onMounted(() => { document.addEventListener('visibilitychange', update); update() })
  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    document.removeEventListener('visibilitychange', update)
    cancelAll()
  })

  return (item: LX.Music.MusicInfo) => {
    if (item.source != 'bili') return item.singer
    const singer = artists.value.get(item.id) || (item.meta.bilibili ? item.singer : parseTrackMetadata(item.name, item.meta.albumName).singer)
    return singer || window.i18n.t(finished.value.has(item.id) ? 'unknown_singer' : 'bilibili__artist_loading')
  }
}
