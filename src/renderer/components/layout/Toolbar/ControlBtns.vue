<template>
  <div v-show="!isFullscreen" ref="dom_btns" :class="$style.control">
    <button type="button" :class="[$style.btn, $style.min]" :aria-label="$t('min')" ignore-tip :title="$t('min')" @click="minWindow">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-minimize-2" />
      </svg>
    </button>
    <button type="button" :class="[$style.btn, $style.max]" :aria-label="isMaximized ? $t('restore') : $t('max')" ignore-tip :title="isMaximized ? $t('restore') : $t('max')" @click="handleToggleMaximize">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use :xlink:href="isMaximized ? '#icon-window-restore' : '#icon-window-maximize'" />
      </svg>
    </button>
    <button type="button" :class="[$style.btn, $style.close]" :aria-label="$t('close')" ignore-tip :title="$t('close')" @click="closeWindow">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="60%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-window-close-2" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, useCssModule } from '@common/utils/vueTools'
import { minWindow, closeWindow, maxWindowToggle, onMaximizeChange } from '@renderer/utils/ipc'
// import { getRandom } from '../../utils'
import { isFullscreen } from '@renderer/store'

const dom_btns = ref()
const isMaximized = ref(false)
let removeMaximizeListener = null

const cssModule = useCssModule()

const handleToggleMaximize = () => {
  maxWindowToggle()
}

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
  removeMaximizeListener = onMaximizeChange(maximized => { isMaximized.value = maximized })
})
onBeforeUnmount(() => {
  window.app_event.off('focus', handle_focus)
  dom_btns.value.removeEventListener('mouseover', handle_mouseover)
  dom_btns.value.removeEventListener('mouseout', handle_mouseout)
  removeMaximizeListener?.()
})

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.control {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 4px;
  -webkit-app-region: no-drag;
  height: 26px;

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 28px;
    height: 26px;
    background: none;
    border: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    border-radius: 8px;
    color: var(--color-650);
    transition: @transition-fast;
    transition-property: background-color, color, transform;

    svg {
      fill: currentColor;
    }

    &.hover {
      &.min, &.max {
        color: var(--color-primary);
        background-color: var(--color-primary-alpha-900);
      }
      &.close {
        color: #fff;
        background-color: var(--color-btn-close);
      }
    }
    &:active {
      transform: scale(.92);
    }
  }
}

</style>
