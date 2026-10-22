<template>
  <section :class="$style.main" :aria-label="$t('setting')" ignore-tip @keydown.esc="handleEscape">
    <header :class="[$style.header, { [$style.fullscreen]: isFullscreen }]">
      <LeftControlBtns v-if="appSetting['common.controlBtnPosition'] == 'left'" :class="$style.leftControls" />
      <div :class="$style.heading">
        <button ref="dom_back_ref" type="button" :class="$style.back" :aria-label="$t('settings_back')" :title="$t('settings_back')" ignore-tip @click="closeSettings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
        </button>
        <h1>{{ $t('setting') }}</h1>
      </div>
      <div :class="$style.searchWrap">
        <SettingsSearch @select="handleSearchSelect" @close="closeSettings" />
      </div>
      <div :class="$style.headerActions">
        <button type="button" :class="$style.done" @click="closeSettings">{{ $t('settings_done') }}</button>
        <ControlBtns v-if="appSetting['common.controlBtnPosition'] != 'left'" />
      </div>
    </header>
    <div :class="$style.body">
      <nav class="scroll" :class="$style.toc" :aria-label="$t('settings_categories')" ignore-tip>
        <ul :class="$style.tocList" role="tablist" aria-orientation="vertical">
          <li v-for="(h2, index) in tocList" :key="h2.id" :class="$style.tocListItem" role="presentation">
            <button
              :id="`settings-tab-${h2.id}`" type="button"
              :class="[$style.tocH2, {[$style.active]: avtiveComponentName == h2.id }]"
              role="tab" :aria-selected="avtiveComponentName == h2.id"
              :tabindex="avtiveComponentName == h2.id ? 0 : -1" aria-controls="settings-panel"
              :aria-label="h2.title" ignore-tip @click="toggleTab(h2.id)"
              @keydown.down.prevent="focusTab(index + 1)" @keydown.up.prevent="focusTab(index - 1)"
              @keydown.home.prevent="focusTab(0)" @keydown.end.prevent="focusTab(tocList.length - 1)"
            >
              {{ h2.title }}
            </button>
          </li>
        </ul>
      </nav>
      <div id="settings-panel" ref="dom_content_ref" class="scroll" :class="$style.setting" role="tabpanel" :aria-labelledby="`settings-tab-${avtiveComponentName}`">
        <dl>
          <component :is="avtiveComponentName" />
        </dl>
      </div>
    </div>
  </section>
</template>

<script>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, useCssModule } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { useRoute } from '@common/utils/vueRouter'
import { settingCategories } from './searchIndex'
import SettingsSearch from './components/SettingsSearch.vue'
import { closeSettings } from '@renderer/router'
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import ControlBtns from '@renderer/components/layout/Toolbar/ControlBtns.vue'
import LeftControlBtns from '@renderer/components/layout/Aside/ControlBtns.vue'

import SettingBasic from './components/SettingBasic.vue'
import SettingPlay from './components/SettingPlay.vue'
import SettingPlayDetail from './components/SettingPlayDetail.vue'
import SettingDesktopLyric from './components/SettingDesktopLyric.vue'
import SettingSearch from './components/SettingSearch.vue'
import SettingList from './components/SettingList.vue'
import SettingDownload from './components/SettingDownload.vue'
import SettingSync from './components/SettingSync/index.vue'
import SettingOpenAPI from './components/SettingOpenAPI.vue'
import SettingHotKey from './components/SettingHotKey.vue'
import SettingNetwork from './components/SettingNetwork.vue'
import SettingOdc from './components/SettingOdc.vue'
import SettingBackup from './components/SettingBackup.vue'
import SettingOther from './components/SettingOther.vue'
import SettingQQMusic from './components/SettingQQMusic.vue'
import SettingNeteaseMusic from './components/SettingNeteaseMusic.vue'
import SettingUpdate from './components/SettingUpdate.vue'
import SettingAbout from './components/SettingAbout.vue'

export default {
  name: 'Setting',
  components: {
    SettingsSearch,
    ControlBtns,
    LeftControlBtns,
    SettingBasic,
    SettingPlay,
    SettingPlayDetail,
    SettingDesktopLyric,
    SettingSearch,
    SettingList,
    SettingDownload,
    SettingSync,
    SettingOpenAPI,
    SettingHotKey,
    SettingNetwork,
    SettingOdc,
    SettingBackup,
    SettingOther,
    SettingQQMusic,
    SettingNeteaseMusic,
    SettingUpdate,
    SettingAbout,
  },
  setup() {
    const t = useI18n()
    const route = useRoute()
    const css = useCssModule()
    const dom_content_ref = ref(null)
    const dom_back_ref = ref(null)
    const tocList = computed(() => settingCategories.map(item => ({ id: item.id, title: t(item.titleKey) })))
    const avtiveComponentName = ref(route.query.name && tocList.value.some(t => t.id == route.query.name)
      ? route.query.name
      : tocList.value[0].id)

    let navigationId = 0
    let highlightTimer
    let highlightedElement
    let previousTabIndex
    const clearHighlight = () => {
      clearTimeout(highlightTimer)
      if (!highlightedElement) return
      highlightedElement.classList.remove(css.searchHighlight)
      if (previousTabIndex == null) highlightedElement.removeAttribute('tabindex')
      else highlightedElement.setAttribute('tabindex', previousTabIndex)
      highlightedElement = null
    }
    const toggleTab = id => {
      const requestId = ++navigationId
      clearHighlight()
      avtiveComponentName.value = id
      void nextTick(() => {
        if (requestId != navigationId) return
        dom_content_ref.value?.scrollTo({ top: 0 })
      })
    }
    const focusTab = index => {
      const item = tocList.value[(index + tocList.value.length) % tocList.value.length]
      toggleTab(item.id)
      document.getElementById(`settings-tab-${item.id}`)?.focus()
    }
    const handleEscape = event => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('#root.show-modal, #view.show-modal')) return
      event.preventDefault()
      event.stopPropagation()
      closeSettings()
    }
    const handleSearchSelect = async(item) => {
      const requestId = ++navigationId
      clearHighlight()
      avtiveComponentName.value = item.category
      await nextTick()
      if (requestId != navigationId) return
      const panel = dom_content_ref.value
      const anchor = panel?.querySelector(`[id="${item.targetId}"]`)
      if (!anchor) return
      // Checkbox IDs belong to visually hidden inputs. Highlight the visible row
      // and focus its container without toggling the setting.
      const target = anchor.matches('input') ? anchor.parentElement
        : anchor.matches('h3') ? anchor.closest('dd') : anchor
      if (!target) return
      highlightedElement = target
      document.getElementById(`settings-tab-${item.category}`)?.scrollIntoView({ block: 'nearest' })
      previousTabIndex = target.getAttribute('tabindex')
      target.classList.add(css.searchHighlight)
      target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
      panel.scrollTo({
        top: Math.max(0, panel.scrollTop + target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
      highlightTimer = setTimeout(clearHighlight, 2400)
    }
    onBeforeUnmount(() => {
      navigationId++
      clearHighlight()
    })
    onMounted(() => { dom_back_ref.value?.focus({ preventScroll: true }) })

    return { tocList, avtiveComponentName, dom_content_ref, dom_back_ref, toggleTab, focusTab, handleSearchSelect, handleEscape, closeSettings, isFullscreen, appSetting }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  display: flex;
  flex-flow: column nowrap;
  height: 100%;
  min-width: 0;
  background: var(--color-app-background);
}

.header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 20px;
  flex: none;
  min-height: 64px;
  box-sizing: border-box;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-100);
  -webkit-app-region: drag;
  &.fullscreen { -webkit-app-region: no-drag; }
}
.heading {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 160px;
  h1 { font-size: 20px; font-weight: 600; }
}
.back, .done {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: none;
  border-radius: 8px;
  color: var(--color-font);
  cursor: pointer;
  -webkit-app-region: no-drag;
  &:hover { background: var(--color-primary-alpha-900); }
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
}
.back {
  width: 34px;
  padding: 6px;
  background: transparent;
  svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
}
.done { padding: 0 16px; background: var(--color-100); font-size: 13px; }
.searchWrap { flex: 1; min-width: 0; max-width: 520px; -webkit-app-region: no-drag; }
.headerActions { display: flex; align-items: center; gap: 20px; margin-left: auto; }
.header .leftControls { flex: none; width: auto; height: 26px; padding: 0; }
@media (max-width: 800px) {
  .header { gap: 12px; padding-inline: 12px; }
  .heading { flex-basis: auto; }
  .headerActions { gap: 10px; }
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.searchHighlight {
  outline: 2px solid var(--color-primary);
  outline-offset: 4px;
  border-radius: 3px;
  background-color: var(--color-primary-alpha-900);
}
.toc {
  flex: 0 0 200px;
  box-sizing: border-box;
  padding: 16px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--color-100);
}
.tocList { display: flex; flex-direction: column; gap: 3px; }
.tocListItem { min-width: 0; }
.tocH2 {
  display: block;
  width: 100%;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
  line-height: 1.5;
  .mixin-ellipsis-1();
  font-size: 13px;
  color: var(--color-font);
  padding: 9px 12px;
  transition: @transition-fast;
  transition-property: background-color, color;

  &:not(.active) {
    cursor: pointer;
    &:hover {
      background-color: var(--color-button-background-hover);
    }
  }
  &.active {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
    font-weight: 600;
  }
}
// .tocH3 {
//   font-size: 13px;
//   opacity: .8;
// }

// .tocList {
//   .tocList {
//     // padding-left: 15px;
//   }
// }
// .tocSubListItem {
//   padding-top: 10px;
// }

.setting {
  padding: 12px 32px 32px;
  font-size: 14px;
  box-sizing: border-box;
  overflow-y: auto;
  height: 100%;
  position: relative;
  width: 100%;
  min-width: 0;
  > dl { max-width: 960px; }

  :global {
    dt {
      border-left: 3px solid var(--color-primary);
      border-radius: 2px;
      padding: 3px 7px;
      margin: 15px 0;

      + dd h3 {
        margin-top: 0;
      }
    }

    dd {
      // margin-left: 15px;
      // font-size: 13px;
      > div {
        padding: 0 15px;
      }

    }
    h3 {
      font-size: 12px;
      margin: 25px 0 15px;
    }
    .p {
      padding: 3px 0;
      line-height: 1.3;
      .btn {
        + .btn {
          margin-left: 10px;
        }
      }
    }

    .help-btn {
      padding: 0;
      margin: 0 0.4em;
      border: none;
      background: none;
      color: var(--color-button-font);
      cursor: pointer;
      transition: opacity 0.2s ease;
      &:hover {
        opacity: 0.7;
      }
    }
    .help-icon {
      margin: 0 0.4em;
    }
  }
}

// .btn-content {
//   display: inline-block;
//   transition: @transition-theme;
//   transition-property: opacity, transform;
//   opacity: 1;
//   transform: scale(1);

//   &.hide {
//     opacity: 0;
//     transform: scale(0);
//   }
// }


// :global(dt):target, :global(h3):target {
//   animation: highlight 1s ease;
// }

// @keyframes highlight {
//   from { background: yellow; }
//   to { background: transparent; }
// }

</style>
