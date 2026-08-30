import { ref, onMounted, onBeforeUnmount, watch, nextTick } from '@common/utils/vueTools'
import { scrollTo } from '@common/utils/renderer'
import { lyric } from '@lyric/store/lyric'
import { isPlay, setting } from '@lyric/store/state'
import { setWindowBounds, setWindowResizeable } from '@lyric/utils/ipc'
import { isWin } from '@common/utils'

const getOffsetTop = (contentHeight, lineHeight) => {
  switch (setting['desktopLyric.scrollAlign']) {
    case 'top': return 0
    default: return contentHeight * 0.5 - lineHeight / 2
  }
}

// getLineCount() > 0 时为网易云式“当前句”模式：仅渲染当前句（1 行）或当前句+下一句（2 行），
// 行切换时直接替换 DOM 并播放入场动画，不再整首平铺滚动；返回 0 时为原全量滚动模式
export default (isComputeHeight, getLineCount = () => 0) => {
  const dom_lyric = ref(null)
  const dom_lyric_text = ref(null)
  const isMsDown = ref(false)
  let isStopScroll = false

  const winEvent = {
    isMsDown: false,
    msDownX: 0,
    msDownY: 0,
    windowW: 0,
    windowH: 0,
  }

  let msDownY = 0
  let msDownScrollY = 0
  let timeout = null
  let cancelScrollFn
  let dom_lines
  let line_heights
  let isSetedLines = false
  let prevActiveLine = 0

  // 拖动窗口的 IPC 调用按帧合并，避免每个 mousemove 都触发一次 IPC 往返导致拖动卡顿
  let rafId = null
  let pendingBounds = null
  const sendBoundsRaf = (bounds) => {
    pendingBounds = bounds
    if (rafId != null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      if (pendingBounds) setWindowBounds(pendingBounds)
      pendingBounds = null
    })
  }

  const handleScrollLrc = (duration = 300) => {
    if (getLineCount() > 0) return
    if (!dom_lines?.length || !dom_lyric.value) return
    if (isStopScroll) return
    let dom_p = dom_lines[lyric.line]

    if (dom_p) {
      let offset = 0
      if (isComputeHeight.value) {
        let prevLineHeight = line_heights[prevActiveLine] ?? 0
        offset = prevActiveLine < lyric.line ? ((dom_lines[prevActiveLine]?.clientHeight ?? 0) - prevLineHeight) : 0
        // console.log(prevActiveLine, dom_lines[prevActiveLine]?.clientHeight ?? 0, prevLineHeight, offset)
      }
      cancelScrollFn = scrollTo(dom_lyric.value, dom_p ? (dom_p.offsetTop - offset - getOffsetTop(dom_lyric.value.clientHeight, dom_p.clientHeight)) : 0, duration)
    } else {
      cancelScrollFn = scrollTo(dom_lyric.value, 0, duration)
    }
  }
  const clearLyricScrollTimeout = () => {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = null
  }
  const startLyricScrollTimeout = () => {
    clearLyricScrollTimeout()
    timeout = setTimeout(() => {
      timeout = null
      isStopScroll = false
      if (!isPlay.value) return
      handleScrollLrc()
    }, 3000)
  }

  // 当前句模式：仅把当前句（含双行模式的下一句）放入容器
  const renderSingle = () => {
    if (!dom_lyric_text.value) return
    const lineCount = getLineCount()
    if (lineCount <= 0) return
    const frag = document.createDocumentFragment()
    for (let i = 0; i < lineCount; i++) {
      const line = lyric.lines[lyric.line + i]
      if (line?.dom_line) frag.appendChild(line.dom_line)
    }
    dom_lyric_text.value.textContent = ''
    dom_lyric_text.value.appendChild(frag)
    // 重新触发入场动画
    const first = dom_lyric_text.value.firstElementChild
    if (first) {
      first.style.animation = 'none'
      first.getBoundingClientRect()
      first.style.animation = ''
    }
  }

  const handleLyricDown = (target, x, y) => {
    if (target.classList.contains('font-lrc') ||
        target.parentNode.classList.contains('font-lrc') ||
        target.classList.contains('extended') ||
        target.parentNode.classList.contains('extended')
    ) {
      if (delayScrollTimeout) {
        clearTimeout(delayScrollTimeout)
        delayScrollTimeout = null
      }
      // 当前句模式不支持拖动滚动歌词，按下歌词也移动窗口
      if (getLineCount() > 0) {
        winEvent.isMsDown = true
        winEvent.msDownX = x
        winEvent.msDownY = y
        winEvent.windowW = window.innerWidth
        winEvent.windowH = window.innerHeight
        return
      }
      isMsDown.value = true
      msDownY = y
      msDownScrollY = dom_lyric.value.scrollTop
    } else {
      winEvent.isMsDown = true
      winEvent.msDownX = x
      winEvent.msDownY = y
      winEvent.windowW = window.innerWidth
      winEvent.windowH = window.innerHeight
      // https://github.com/lyswhut/lx-music-desktop/issues/2244
      if (isWin) setWindowResizeable(false)
    }
  }
  const handleLyricMouseDown = event => {
    handleLyricDown(event.target, event.clientX, event.clientY)
  }
  const handleLyricTouchStart = event => {
    if (event.changedTouches.length) {
      const touch = event.changedTouches[0]
      handleLyricDown(event.target, touch.clientX, touch.clientY)
    }
  }
  const handleMouseMsUp = () => {
    isMsDown.value = false
    winEvent.isMsDown = false
    if (isWin) setWindowResizeable(true)
  }

  const handleMove = (x, y) => {
    if (isMsDown.value) {
      isStopScroll ||= true
      if (cancelScrollFn) {
        cancelScrollFn()
        cancelScrollFn = null
      }
      dom_lyric.value.scrollTop = msDownScrollY + msDownY - y
      startLyricScrollTimeout()
    } else if (winEvent.isMsDown) {
      // https://github.com/lyswhut/lx-music-desktop/issues/2244
      if (isWin) {
        sendBoundsRaf({
          x: x - winEvent.msDownX,
          y: y - winEvent.msDownY,
          w: winEvent.windowW,
          h: winEvent.windowH,
        })
      } else {
        sendBoundsRaf({
          x: x - winEvent.msDownX,
          y: y - winEvent.msDownY,
          w: window.innerWidth,
          h: window.innerHeight,
        })
      }
    }
  }
  const handleMouseMsMove = event => {
    handleMove(event.clientX, event.clientY)
  }
  const handleTouchMove = (e) => {
    if (e.changedTouches.length) {
      const touch = e.changedTouches[0]
      handleMove(touch.clientX, touch.clientY)
    }
  }

  const handleWheel = (event) => {
    console.log(event.deltaY)
    if (getLineCount() > 0) return
    if (cancelScrollFn) {
      cancelScrollFn()
      cancelScrollFn = null
    }
    dom_lyric.value.scrollTop = dom_lyric.value.scrollTop + event.deltaY
    startLyricScrollTimeout()
  }

  const setLyric = (lines) => {
    if (getLineCount() > 0) {
      renderSingle()
      return
    }
    const dom_line_content = document.createDocumentFragment()
    for (const line of lines) {
      dom_line_content.appendChild(line.dom_line)
    }
    dom_lyric_text.value.textContent = ''
    dom_lyric_text.value.appendChild(dom_line_content)
    nextTick(() => {
      dom_lines = dom_lyric.value.querySelectorAll('.line-content')
      line_heights = Array.from(dom_lines).map(l => l.clientHeight)
      handleScrollLrc()
    })
  }

  const initLrc = (lines, oLines) => {
    prevActiveLine = 0
    isSetedLines = true
    if (oLines) {
      if (lines.length) {
        setLyric(lines)
      } else {
        cancelScrollFn = scrollTo(dom_lyric.value, 0, 300, () => {
          if (lyric.lines !== lines) return
          setLyric(lines)
        }, 50)
      }
    } else {
      setLyric(lines)
    }
  }

  let delayScrollTimeout
  const scrollLine = (line, oldLine) => {
    setImmediate(() => {
      prevActiveLine = line
    })
    if (line < 0 || !lyric.lines.length) return
    if (line == 0 && isSetedLines) return isSetedLines = false
    isSetedLines &&= false
    if (oldLine == null || line - oldLine != 1) return handleScrollLrc()

    if (setting['desktopLyric.isDelayScroll']) {
      delayScrollTimeout = setTimeout(() => {
        delayScrollTimeout = null
        handleScrollLrc(600)
      }, 600)
    } else {
      handleScrollLrc()
    }
  }

  watch(() => lyric.lines, initLrc)
  watch(() => lyric.line, (line, oldLine) => {
    if (getLineCount() > 0) {
      if (line < 0) return
      renderSingle()
      return
    }
    scrollLine(line, oldLine)
  })

  onMounted(() => {
    document.addEventListener('mousemove', handleMouseMsMove)
    document.addEventListener('mouseup', handleMouseMsUp)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleMouseMsUp)

    initLrc(lyric.lines, null)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleMouseMsMove)
    document.removeEventListener('mouseup', handleMouseMsUp)
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleMouseMsUp)
    if (rafId != null) window.cancelAnimationFrame(rafId)
  })

  return {
    dom_lyric,
    dom_lyric_text,
    isMsDown,
    handleLyricMouseDown,
    handleLyricTouchStart,
    handleWheel,
  }
}
