<template>
  <div id="container" :class="[{ lock: setting['desktopLyric.isLock'] }, { hide: isHide || isHoverHide }]">
    <div id="main" :class="{ 'bar-below': isLyricBarBelow }">
      <div class="lyric-stack" data-lyric-hit>
        <div class="control-bar" :class="{ visible: !setting['desktopLyric.isLock'] || isLyricMenuOpen, 'menu-open': isLyricMenuOpen, below: isLyricBarBelow }">
          <layout-control-bar />
        </div>
        <layout-lyric-horizontal />
      </div>
      <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
        <common-audio-visualizer v-if="setting['desktopLyric.audioVisualization']" />
      </transition>
    </div>
    <template v-if="isShowResize">
      <div class="resize resize-left" @mousedown.self="handleMouseDown('left', $event)" @touchstart.self="handleTouchDown('left', $event)" />
      <div class="resize resize-top" @mousedown.self="handleMouseDown('top', $event)" @touchstart.self="handleTouchDown('top', $event)" />
      <div class="resize resize-right" @mousedown.self="handleMouseDown('right', $event)" @touchstart.self="handleTouchDown('right', $event)" />
      <div class="resize resize-bottom" @mousedown.self="handleMouseDown('bottom', $event)" @touchstart.self="handleTouchDown('bottom', $event)" />
      <div class="resize resize-top-left" @mousedown.self="handleMouseDown('top-left', $event)" @touchstart.self="handleTouchDown('top-left', $event)" />
      <div class="resize resize-top-right" @mousedown.self="handleMouseDown('top-right', $event)" @touchstart.self="handleTouchDown('top-right', $event)" />
      <div class="resize resize-bottom-left" @mousedown.self="handleMouseDown('bottom-left', $event)" @touchstart.self="handleTouchDown('bottom-left', $event)" />
      <div class="resize resize-bottom-right" @mousedown.self="handleMouseDown('bottom-right', $event)" @touchstart.self="handleTouchDown('bottom-right', $event)" />
    </template>
    <layout-icons />
  </div>
</template>

<script setup>
import useWindowSize from '@lyric/useApp/useWindowSize'
import useHoverHide from '@lyric/useApp/useHoverHide'
import { onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { isLyricBarBelow, isLyricMenuOpen, setting } from '@lyric/store/state'
import { sendConnectMainWindowEvent, updateSetting, setIgnoreMouseEvents } from '@lyric/utils/ipc'
import { syncLyricBarSide } from '@lyric/utils/lyricBarSide'
import useCommon from '@lyric/useApp/useCommon'
import useLyric from '@lyric/useApp/useLyric'
import useTheme from '@lyric/useApp/useTheme'
import { init as initLyricPlayer } from '@lyric/core/lyric'
import usePauseHide from '@lyric/useApp/usePauseHide'

const isShowResize = false
useCommon()
const { handleMouseDown, handleTouchDown } = useWindowSize()
const isHoverHide = useHoverHide()
useLyric()
useTheme()
const isHide = usePauseHide()

let lastIgnore = null
const isInteractiveTarget = (target) => {
  if (!(target instanceof Element)) return false
  return !!target.closest('[data-lyric-hit]')
}
const syncMouseIgnore = (event) => {
  if (setting['desktopLyric.isLock']) return
  if (isLyricMenuOpen.value) {
    if (lastIgnore !== false) {
      lastIgnore = false
      setIgnoreMouseEvents(false, true)
    }
    return
  }
  const ignore = !isInteractiveTarget(event.target)
  if (lastIgnore === ignore) return
  lastIgnore = ignore
  setIgnoreMouseEvents(ignore, true)
}
const handleWindowMouseLeave = () => {
  if (setting['desktopLyric.isLock'] || isLyricMenuOpen.value) return
  lastIgnore = true
  setIgnoreMouseEvents(true, true)
}

onMounted(() => {
  initLyricPlayer()
  sendConnectMainWindowEvent()
  syncLyricBarSide()
  window.requestAnimationFrame(() => { syncLyricBarSide() })
  window.setTimeout(() => { syncLyricBarSide() }, 80)
  document.addEventListener('mousemove', syncMouseIgnore)
  document.addEventListener('mousemove', syncLyricBarSide)
  document.addEventListener('mouseup', syncLyricBarSide)
  document.addEventListener('touchend', syncLyricBarSide)
  document.addEventListener('mouseleave', handleWindowMouseLeave)
  lastIgnore = true
  setIgnoreMouseEvents(true, true)
  const nextLyricShape = {}
  if (setting['desktopLyric.height'] > 140 || setting['desktopLyric.height'] < 110 || setting['desktopLyric.width'] != 860) {
    nextLyricShape['desktopLyric.width'] = 860
    nextLyricShape['desktopLyric.height'] = 120
  }
  if (setting['desktopLyric.direction'] != 'horizontal') {
    nextLyricShape['desktopLyric.direction'] = 'horizontal'
  }
  if (!setting['desktopLyric.isAlwaysOnTop'] || !setting['desktopLyric.isAlwaysOnTopLoop']) {
    nextLyricShape['desktopLyric.isAlwaysOnTop'] = true
    nextLyricShape['desktopLyric.isAlwaysOnTopLoop'] = true
  }
  if (Object.keys(nextLyricShape).length) updateSetting(nextLyricShape).catch(() => {})
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', syncMouseIgnore)
  document.removeEventListener('mousemove', syncLyricBarSide)
  document.removeEventListener('mouseup', syncLyricBarSide)
  document.removeEventListener('touchend', syncLyricBarSide)
  document.removeEventListener('mouseleave', handleWindowMouseLeave)
})

</script>

<style lang="less">
@import './assets/styles/index.less';
@import './assets/styles/layout.less';

body {
  user-select: none;
  height: 100vh;
  box-sizing: border-box;
  color: #fff;
  opacity: 1;
}

body {
  user-select: none;
  height: 100vh;
  box-sizing: border-box;
}
#root {
  height: 100%;
}

html, body, #root, #container, #main {
  pointer-events: none;
}

#container {
  box-sizing: border-box;
  height: 100%;
  transition: opacity .3s ease;
  opacity: 1;
  &.lock {
    #main {
      background-color: transparent;
    }
  }
  &.hide {
    opacity: .18;

    &:not(.lock):hover {
      opacity: 1;
    }
  }
}

@resize-width: 6px;
.resize {
  z-index: 2;
}
.resize-left {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: @resize-width;
  cursor: ew-resize;
  // background-color: rgba(0, 0, 0, 1);
}
.resize-right {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: @resize-width;
  cursor: ew-resize;
}
.resize-top {
  position: absolute;
  left: 0;
  top: 0;
  height: 4px;
  width: 100%;
  cursor: ns-resize;
}
.resize-bottom {
  position: absolute;
  left: 0;
  bottom: 0;
  height: @resize-width;
  width: 100%;
  cursor: ns-resize;
}
.resize-top-left {
  position: absolute;
  left: 0;
  top: 0;
  width: @resize-width;
  height: @resize-width;
  cursor: nwse-resize;
  // background-color: rgba(0, 0, 0, 1);
}
.resize-top-right {
  position: absolute;
  right: 0;
  top: 0;
  width: @resize-width;
  height: @resize-width;
  cursor: nesw-resize;
  // background-color: rgba(0, 0, 0, 1);
}
.resize-bottom-left {
  position: absolute;
  left: 0;
  bottom: 0;
  width: @resize-width;
  height: @resize-width;
  cursor: nesw-resize;
  // background-color: rgba(0, 0, 0, 1);
}
.resize-bottom-right {
  position: absolute;
  right: 0;
  bottom: 0;
  width: @resize-width;
  height: @resize-width;
  cursor: nwse-resize;
  // background-color: rgba(0, 0, 0, 1);
}

#main {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  border-radius: @radius-border;
  overflow: visible;
  background-color: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 12px 10px;

  &.bar-below {
    align-items: flex-start;
    padding: 10px 12px 0;
  }
}

.lyric-stack {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  max-width: min(100%, 720px);
  height: auto;
  pointer-events: auto;
  padding: 4px 14px;
  border-radius: 16px;
  border: 1px solid transparent;
  box-sizing: border-box;
  transition: background-color .18s ease, border-color .18s ease;

  &:hover {
    background-color: rgba(0, 0, 0, .32);
    border-color: rgba(255, 255, 255, .55);
  }

  &:hover .control-bar.visible,
  .control-bar.menu-open {
    opacity: 1;
    pointer-events: auto;
  }
}

#container.lock .lyric-stack {
  pointer-events: none;
  background: none;
  border-color: transparent;
}

.control-bar {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  opacity: 0;
  pointer-events: none;
  transition: opacity @transition-theme;
  z-index: 2;

  &.below {
    bottom: auto;
    top: calc(100% + 8px);
  }
}
</style>
