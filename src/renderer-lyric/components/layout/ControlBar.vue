<template>
  <div :class="$style.container">
    <div :class="$style.btns" @mousedown="handleBarMouseDown" @touchstart="handleBarTouchStart">
      <button :class="$style.btn" :title="$t('player__prev')" @click.stop="handlePrev">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-prev" />
        </svg>
      </button>
      <button :class="[$style.btn, $style.play]" :title="$t(isPlay ? 'player__pause' : 'player__play')" @click.stop="handleTogglePlay">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="22px" viewBox="0 0 24 24" space="preserve">
          <use :xlink:href="isPlay ? '#icon-pause' : '#icon-play'" />
        </svg>
      </button>
      <button :class="$style.btn" :title="$t('player__next')" @click.stop="handleNext">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-next" />
        </svg>
      </button>
      <span :class="$style.divider" />
      <button :class="$style.btn" :title="$t('desktop_lyric__font_decrease')" @click.stop="handleFontChange('decrease', 1)">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-font-decrease" />
        </svg>
      </button>
      <button :class="$style.btn" :title="$t('desktop_lyric__font_increase')" @click.stop="handleFontChange('increase', 1)">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-font-increase" />
        </svg>
      </button>
      <span :class="$style.divider" />
      <button :class="$style.btn" :title="$t('desktop_lyric__settings')" @click.stop="handleOpenMenu">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-setting" />
        </svg>
      </button>
      <button :class="$style.btn" :title="$t('desktop_lyric__' + (setting['desktopLyric.isLock'] ? 'unlock' : 'lock'))" @click.stop="handleLock">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use :xlink:href="setting['desktopLyric.isLock'] ? '#icon-unlock' : '#icon-lock'" />
        </svg>
      </button>
      <button :class="$style.btn" :title="$t('desktop_lyric__close')" @click.stop="handleClose">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="18px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </button>
    </div>
    <context-menu
      v-model:visible="menuVisible"
      :items="menuItems"
      :x="menuX"
      :y="menuY"
      @action="handleMenuAction"
    />
  </div>
</template>

<script>
import { ref, watch } from '@common/utils/vueTools'
import { isLyricBarBelow, isPlay, setting } from '@lyric/store/state'
import { updateSetting } from '@lyric/store/action'
import { sendDesktopLyricInfo } from '@lyric/core/mainWindowChannel'
import { useI18n } from '@lyric/plugins/i18n'
import useDrag from './useDrag'
import ContextMenu from './ContextMenu.vue'
import { hideLyricMenu, showLyricMenu, useLyricMenu } from './lyricMenu'

export default {
  components: {
    ContextMenu,
  },
  setup() {
    const t = useI18n()
    const { handleLyricMouseDown, handleLyricTouchStart } = useDrag()
    const menuVisible = ref(false)
    const menuX = ref(0)
    const menuY = ref(0)
    const { menuItems, handleMenuAction } = useLyricMenu(t)

    const isBarControl = (target) => {
      return target instanceof Element && !!target.closest('button')
    }
    const handleBarMouseDown = (event) => {
      if (isBarControl(event.target)) return
      handleLyricMouseDown(event)
    }
    const handleBarTouchStart = (event) => {
      if (isBarControl(event.target)) return
      handleLyricTouchStart(event)
    }

    const handleClose = () => {
      updateSetting({ 'desktopLyric.enable': false })
    }
    const handleLock = () => {
      updateSetting({ 'desktopLyric.isLock': true })
    }
    const handleOpenMenu = (event) => {
      const btn = event.currentTarget
      showLyricMenu(() => {
        const rect = btn.getBoundingClientRect()
        const menuH = Math.min(menuItems.value.length * 38 + 16, window.innerHeight - 16)
        menuX.value = Math.min(Math.max(8, rect.left - 24), window.innerWidth - 228)
        menuY.value = isLyricBarBelow.value
          ? Math.min(rect.bottom + 6, window.innerHeight - menuH - 8)
          : Math.max(8, Math.min(rect.top - menuH - 6, window.innerHeight - menuH - 8))
        menuVisible.value = true
      })
    }
    watch(menuVisible, (visible) => {
      if (!visible) hideLyricMenu()
    })
    const handleTogglePlay = () => {
      sendDesktopLyricInfo('toggle_play')
    }
    const handlePrev = () => {
      sendDesktopLyricInfo('play_prev')
    }
    const handleNext = () => {
      sendDesktopLyricInfo('play_next')
    }
    const handleFontChange = (action, step) => {
      let num
      switch (action) {
        case 'increase':
          num = Math.min(setting['desktopLyric.style.fontSize'] + step, 80)
          break
        case 'decrease':
          num = Math.max(setting['desktopLyric.style.fontSize'] - step, 10)
          break
      }
      if (setting['desktopLyric.style.fontSize'] == num) return
      updateSetting({ 'desktopLyric.style.fontSize': num })
    }
    return {
      setting,
      isPlay,
      menuVisible,
      menuX,
      menuY,
      menuItems,

      handleClose,
      handleLock,
      handleOpenMenu,
      handleMenuAction,
      handleTogglePlay,
      handlePrev,
      handleNext,
      handleFontChange,
      handleBarMouseDown,
      handleBarTouchStart,
    }
  },
}
</script>

<style lang="less" module>
@import '../../assets/styles/layout.less';

.container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: auto;
  padding: 0;
  pointer-events: none;
}

.btns {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  background-color: rgba(20, 20, 20, 0.72);
  border-radius: 22px;
  padding: 2px 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
}

.divider {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.28);
}

.btn {
  min-height: 34px;
  min-width: 34px;
  padding: 0 6px;
  cursor: pointer;
  border: none;
  outline: none;
  background: none;
  color: #fff;
  opacity: .88;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 17px;
  transition: opacity .15s ease, background-color .15s ease;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, .12);
  }

  &.play {
    min-width: 38px;
  }

  svg {
    display: block;
    fill: currentColor;
  }
}
</style>
