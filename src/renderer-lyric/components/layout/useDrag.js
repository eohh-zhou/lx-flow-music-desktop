import { onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { setWindowBounds, setWindowResizeable } from '@lyric/utils/ipc'
import { isWin } from '@common/utils'

export default () => {
  const winEvent = {
    isMsDown: false,
    lastX: 0,
    lastY: 0,
  }
  let rafId = null
  let pendingBounds = null
  const sendBoundsRaf = (bounds) => {
    if (pendingBounds) {
      pendingBounds.x += bounds.x
      pendingBounds.y += bounds.y
      pendingBounds.w = bounds.w
      pendingBounds.h = bounds.h
    } else {
      pendingBounds = bounds
    }
    if (rafId != null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      if (pendingBounds) setWindowBounds(pendingBounds)
      pendingBounds = null
    })
  }

  const handleLyricDown = (x, y) => {
    winEvent.isMsDown = true
    winEvent.lastX = x
    winEvent.lastY = y
    if (isWin) setWindowResizeable(false)
  }
  const handleLyricMouseDown = event => {
    handleLyricDown(event.screenX, event.screenY)
  }
  const handleLyricTouchStart = event => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      if (touch.target !== event.currentTarget) return
      handleLyricDown(touch.screenX, touch.screenY)
    }
  }
  const flushBounds = () => {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    if (pendingBounds) {
      setWindowBounds(pendingBounds)
      pendingBounds = null
    }
  }
  const handleMouseMsUp = () => {
    winEvent.isMsDown = false
    flushBounds()
    if (isWin) setWindowResizeable(true)
  }

  const handleMove = (x, y) => {
    if (!winEvent.isMsDown) return
    const dx = x - winEvent.lastX
    const dy = y - winEvent.lastY
    winEvent.lastX = x
    winEvent.lastY = y
    if (!dx && !dy) return
    sendBoundsRaf({
      x: dx,
      y: dy,
      w: window.innerWidth,
      h: window.innerHeight,
    })
  }
  const handleMouseMsMove = event => {
    handleMove(event.screenX, event.screenY)
  }
  const handleTouchMove = (e) => {
    if (e.changedTouches.length) {
      const touch = e.changedTouches[0]
      handleMove(touch.screenX, touch.screenY)
    }
  }

  onMounted(() => {
    document.addEventListener('mousemove', handleMouseMsMove)
    document.addEventListener('mouseup', handleMouseMsUp)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleMouseMsUp)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleMouseMsMove)
    document.removeEventListener('mouseup', handleMouseMsUp)
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleMouseMsUp)
    if (rafId != null) window.cancelAnimationFrame(rafId)
  })

  return {
    handleLyricMouseDown,
    handleLyricTouchStart,
  }
}
