<template lang="pug">
div(:class="$style.header")
  div(ref="dom_btns" :class="$style.controBtn")
    button(ref="dom_hide_btn" type="button" :class="$style.hide" :aria-label="$t('player__hide_detail_tip')" ignore-tip :title="$t('player__hide_detail_tip')" @click="hide")
      svg(:class="$style.controBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="35%" viewBox="0 0 30.727 30.727" space="preserve")
        use(xlink:href="#icon-window-hide")
    button(ref="dom_fullscreen_btn" type="button" :class="$style.fullscreenExit" :aria-label="$t('fullscreen_exit')" ignore-tip :title="$t('fullscreen_exit')" @click="fullscreenExit")
      svg(:class="$style.controBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%")
        use(xlink:href="#icon-fullscreen-exit")
    button(type="button" :class="$style.min" :aria-label="$t('min')" ignore-tip :title="$t('min')" @click="minWindow")
      svg(:class="$style.controBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve")
        use(xlink:href="#icon-window-minimize-2")

    //- button(type="button" :class="$style.max" @click="max")
    button(type="button" :class="$style.close" :aria-label="$t('close')" ignore-tip :title="$t('close')" @click="closeWindow")
      svg(:class="$style.controBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve")
        use(xlink:href="#icon-window-close-2")
</template>


<script setup>
import { onMounted, onBeforeUnmount, ref, useCssModule } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import { closeWindow, minWindow, setFullScreen } from '@renderer/utils/ipc'

const dom_btns = ref()
const cssModule = useCssModule()

const handle_focus = () => {
  if (!dom_btns.value) return
  for (const node of dom_btns.value.childNodes) {
    if (node.tagName != 'BUTTON') continue
    node.classList.remove(cssModule.hover)
  }
}
const getBtnEl = (el) => el.tagName == 'BUTTON' || !el ? el : getBtnEl(el.parentNode)
const handle_mouseover = (event) => {
  const btn = getBtnEl(event.target)
  if (!btn) return
  btn.classList.add(cssModule.hover)
}
const handle_mouseout = (event) => {
  const btn = getBtnEl(event.target)
  if (!btn) return
  btn.classList.remove(cssModule.hover)
}


onMounted(() => {
  window.app_event.on('focus', handle_focus)
  dom_btns.value.addEventListener('mouseover', handle_mouseover)
  dom_btns.value.addEventListener('mouseout', handle_mouseout)
})
onBeforeUnmount(() => {
  window.app_event.off('focus', handle_focus)
  dom_btns.value.removeEventListener('mouseover', handle_mouseover)
  dom_btns.value.removeEventListener('mouseout', handle_mouseout)
})

const dom_hide_btn = ref()
const hide = () => {
  dom_hide_btn.value?.classList.remove(cssModule.hover)
  setShowPlayerDetail(false)
}
const dom_fullscreen_btn = ref()
const fullscreenExit = () => {
  dom_fullscreen_btn.value?.classList.remove(cssModule.hover)
  void setFullScreen(false).then((fullscreen) => {
    isFullscreen.value = fullscreen
  })
}

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@control-btn-width: @height-toolbar * .26;

:global(.fullscreen) {
  .header {
    -webkit-app-region: no-drag;
    align-self: flex-start;
    .controBtn {
      .close, .min {
        display: none;
      }
      .fullscreenExit {
        display: flex;
      }
    }
  }
}
.header {
  position: relative;
  flex: 0 0 @height-toolbar;
  -webkit-app-region: drag;
  width: 100%;
  align-self: flex-start;

  .controBtn {
    position: absolute;
    top: 50%;
    right: 15px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    -webkit-app-region: no-drag;

    button {
      display: flex;
      position: relative;
      width: 28px;
      height: 26px;
      background: none;
      border: none;
      outline: none;
      padding: 0;
      cursor: pointer;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      color: var(--color-650);
      transition: @transition-fast;
      transition-property: background-color, color, transform;

      svg {
        fill: currentColor;
      }

      &.hover {
        color: var(--color-primary);
        background-color: var(--color-primary-alpha-900);

        &.close {
          color: #fff;
          background-color: var(--color-btn-close);
        }
      }
      &:active {
        transform: scale(.92);
      }
    }

    .fullscreenExit {
      display: none;
    }
  }
}

</style>
