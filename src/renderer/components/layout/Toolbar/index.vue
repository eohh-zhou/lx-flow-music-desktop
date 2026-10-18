<template>
  <div :class="[$style.toolbar, { [$style.fullscreen]: isFullscreen }]">
    <LeftControlBtns v-if="appSetting['common.sidebarCollapsed'] && appSetting['common.controlBtnPosition'] == 'left'" :class="$style.collapsedControls" />
    <div :class="$style.navBtns">
      <button type="button" :class="[$style.navBtn, $style.sidebarToggle]" :aria-expanded="!appSetting['common.sidebarCollapsed']" aria-controls="left" :aria-label="$t(appSetting['common.sidebarCollapsed'] ? 'toolbar__expand_sidebar' : 'toolbar__collapse_sidebar')" :title="$t(appSetting['common.sidebarCollapsed'] ? 'toolbar__expand_sidebar' : 'toolbar__collapse_sidebar')" ignore-tip @click="toggleSidebar">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path :d="appSetting['common.sidebarCollapsed'] ? 'm13 9 3 3-3 3' : 'm17 9-3 3 3 3'" /></svg>
      </button>
      <button :class="$style.navBtn" :disabled="!canBack" :aria-label="$t('toolbar__back')" @click="handleBack">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="55%" viewBox="0 0 451.847 451.847" space="preserve">
          <use xlink:href="#icon-left" />
        </svg>
      </button>
      <button :class="$style.navBtn" :disabled="!canForward" :aria-label="$t('toolbar__forward')" @click="handleForward">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="55%" viewBox="0 0 451.846 451.847" space="preserve">
          <use xlink:href="#icon-right" />
        </svg>
      </button>
    </div>
    <div v-if="appSetting['common.controlBtnPosition'] == 'left'" :class="$style.logo">LX MUSIC</div>
    <div :class="$style.searchWrap">
      <SearchInput />
    </div>
    <div v-if="appSetting['common.controlBtnPosition'] != 'left' || appSetting['common.sidebarCollapsed']" :class="$style.rightBtns">
      <button :class="$style.toolBtn" :aria-label="$t('skin')" :title="$t('skin')" ignore-tip @click="openThemeSelector">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="14px" height="14px" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-skin" />
        </svg>
      </button>
      <button :class="$style.toolBtn" :aria-label="$t('setting')" :title="$t('setting')" ignore-tip @click="goSetting">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="14px" height="14px" viewBox="0 0 493.23 436.47" space="preserve">
          <use xlink:href="#icon-setting" />
        </svg>
      </button>
      <i v-if="appSetting['common.controlBtnPosition'] != 'left'" :class="$style.divider" />
      <ControlBtns v-if="appSetting['common.controlBtnPosition'] != 'left'" />
    </div>
    <ThemeSelectorModal v-model="isShowThemeSelector" teleport="#root" immediate />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { isFullscreen } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import ControlBtns from './ControlBtns.vue'
import LeftControlBtns from '../Aside/ControlBtns.vue'
import SearchInput from './SearchInput.vue'
import ThemeSelectorModal from '@renderer/views/Setting/components/ThemeSelectorModal.vue'

const router = useRouter()
const route = useRoute()

const canBack = ref(false)
const canForward = ref(false)

const isShowThemeSelector = ref(false)
const toggleSidebar = () => { updateSetting({ 'common.sidebarCollapsed': !appSetting['common.sidebarCollapsed'] }) }

const updateNavState = () => {
  const state = window.history.state
  canBack.value = !!state && state.back != null
  canForward.value = !!state && state.forward != null
}

const handleBack = () => {
  router.go(-1)
}
const handleForward = () => {
  router.go(1)
}

const openThemeSelector = () => {
  isShowThemeSelector.value = true
}

const goSetting = () => {
  void router.push('/setting').catch(_ => _)
}

watch(() => route.fullPath, () => {
  // 路由更新后 vue-router 才会写入新的 history state
  setTimeout(updateNavState, 0)
})

onMounted(updateNavState)

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.toolbar {
  display: flex;
  height: @height-toolbar;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  -webkit-app-region: drag;
  z-index: 2;
  background-color: transparent;

  &.fullscreen {
    -webkit-app-region: no-drag;
    .logo {
      display: none;
    }
  }
}

.navBtns {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.toolbar .collapsedControls { flex: none; width: auto; height: 100%; padding: 0; }
.sidebarToggle {
  margin-right: 6px;
  svg { fill: none !important; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
}

.navBtn {
  flex: none;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: @radius-round;
  background-color: transparent;
  color: var(--color-650);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: @transition-fast;
  transition-property: background-color, color;

  svg {
    fill: currentColor;
  }

  &:hover:not(:disabled) {
    color: var(--color-font);
    background-color: var(--color-100);
  }
  &:active:not(:disabled) {
    transform: scale(.92);
  }
  &:disabled {
    color: var(--color-200);
    cursor: default;
  }
}

.searchWrap {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 360px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
}

.rightBtns {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.toolBtn {
  flex: none;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: @radius-round;
  background-color: transparent;
  color: var(--color-650);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: @transition-fast;
  transition-property: background-color, color, transform;

  &:hover {
    color: var(--color-font);
    background-color: var(--color-100);
  }
  &:active {
    transform: scale(.92);
  }
}

.divider {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: var(--color-150);
}

.logo {
  box-sizing: border-box;
  padding: 0 @height-toolbar * .4;
  height: @height-toolbar;
  color: var(--color-font);
  flex: none;
  display: flex;
  align-items: center;
  font-weight: bold;
  font-size: 15px;
  letter-spacing: .5px;
}

</style>
