import { ref, watch } from '@common/utils/vueTools'
import { isPlay, setting } from '@lyric/store/state'

export default () => {
  let unWatch: (() => void) | null = null
  let isHide = ref(false)
  let timeout: NodeJS.Timeout | null = null
  const clearIntv = () => {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = null
  }
  const applyHide = () => {
    clearIntv()
    // 未锁定时始终显示，否则暂停后窗口几乎看不见，开发时也很难确认歌词是否打开
    if (!setting['desktopLyric.pauseHide'] || !setting['desktopLyric.isLock'] || isPlay.value) {
      isHide.value = false
      return
    }
    timeout = setTimeout(() => {
      timeout = null
      isHide.value = true
    }, 200)
  }
  watch(() => setting['desktopLyric.pauseHide'], (enable) => {
    if (unWatch) {
      unWatch()
      unWatch = null
    }
    if (enable) {
      unWatch = watch([isPlay, () => setting['desktopLyric.isLock']], applyHide, {
        immediate: true,
      })
    } else {
      clearIntv()
      isHide.value = false
    }
  }, {
    immediate: true,
  })

  return isHide
}
