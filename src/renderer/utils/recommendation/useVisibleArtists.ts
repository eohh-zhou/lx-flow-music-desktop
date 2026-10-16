import { nextTick, onBeforeUnmount, onMounted, watch, type Ref, type ComputedRef } from '@common/utils/vueTools'
import { requestBilibiliMetadata } from '@renderer/core/music/bilibiliMetadataQueue'
import type { TrackRecommendation } from './ranking'

export default (container: Ref<HTMLElement | null>, rows: ComputedRef<TrackRecommendation[]>, onResolved: (music: LX.Music.MusicInfoOnline) => void) => {
  const visible = new Set<string>()
  const finished = new Set<string>()
  const pending = new Map<string, () => void>()
  let observer: IntersectionObserver | null = null
  let disposed = false
  const cancelAll = () => { for (const cancel of pending.values()) cancel(); pending.clear() }
  const update = () => {
    if (disposed || document.hidden) { cancelAll(); return }
    const byId = new Map(rows.value.map(row => [row.music.id, row.music]))
    for (const [id, cancel] of pending) if (!visible.has(id) || !byId.has(id)) { cancel(); pending.delete(id) }
    for (const id of visible) {
      const music = byId.get(id)
      if (!music || music.source != 'bili' || music.singer || finished.has(id) || pending.has(id)) continue
      pending.set(id, requestBilibiliMetadata(music, resolved => {
        pending.delete(id)
        if (disposed || !visible.has(id) || document.hidden) return
        finished.add(id)
        if (resolved) onResolved(resolved)
      }))
    }
  }
  const observe = async() => {
    observer?.disconnect()
    visible.clear()
    cancelAll()
    const ids = new Set(rows.value.map(row => row.music.id))
    for (const id of finished) if (!ids.has(id)) finished.delete(id)
    await nextTick()
    if (disposed || !container.value) return
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.recommendationId
        if (!id) continue
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      update()
    }, { root: container.value })
    for (const element of container.value.querySelectorAll('[data-recommendation-id]')) observer.observe(element)
  }
  watch(() => rows.value.map(row => row.music.id).join('|'), () => { void observe() })
  onMounted(() => { void observe(); document.addEventListener('visibilitychange', update) })
  onBeforeUnmount(() => { disposed = true; observer?.disconnect(); cancelAll(); document.removeEventListener('visibilitychange', update) })
}
