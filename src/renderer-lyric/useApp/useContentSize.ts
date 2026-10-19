import { onBeforeUnmount, onMounted, watch, type Ref } from '@common/utils/vueTools'
import { isLyricMenuOpen } from '@lyric/store/state'
import { setContentHeight } from '@lyric/utils/ipc'

export default (stack: Ref<HTMLElement | null>, bar: Ref<HTMLElement | null>) => {
  let observer: ResizeObserver | undefined
  let frame: number | undefined
  let previousHeight = 0
  const measure = () => {
    frame = undefined
    if (!stack.value || !bar.value || isLyricMenuOpen.value) return
    // Reserve the toolbar even while it is hidden, so hovering never changes size.
    // Use layout dimensions: the lyric entrance animation must not resize the window.
    const height = Math.max(120, Math.ceil(stack.value.offsetHeight + bar.value.offsetHeight + 8 + 20))
    if (height == previousHeight) return
    previousHeight = height
    setContentHeight(height)
  }
  const schedule = () => {
    if (frame == null) frame = window.requestAnimationFrame(measure)
  }
  const stopMenu = watch(isLyricMenuOpen, schedule)
  onMounted(() => {
    observer = new ResizeObserver(schedule)
    if (stack.value) observer.observe(stack.value)
    if (bar.value) observer.observe(bar.value)
    schedule()
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    stopMenu()
    if (frame != null) window.cancelAnimationFrame(frame)
  })
}
