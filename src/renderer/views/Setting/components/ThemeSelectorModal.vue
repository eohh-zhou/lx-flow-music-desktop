<template>
  <material-modal :show="modelValue" bg-close="bg-close" :teleport="teleport" @close="$emit('update:modelValue', false)">
    <main :class="$style.main">
      <h2>{{ $t(immediate ? 'theme_selector_modal__skin_title' : 'theme_selector_modal__title') }}</h2>
      <div class="scroll" :class="$style.content">
        <div>
          <h3>{{ $t('theme_selector_modal__light_title') }}</h3>
          <ul :class="$style.theme">
            <li
              v-for="theme in themeInfo.themeLights" :key="theme.id"
              :style="theme.styles" :aria-label="theme.name"
              :class="[{[$style.active]: isLightActive(theme.id)}]" @click="setLightId(theme.id)"
            >
              <span :class="$style.bg" />
              <label>{{ theme.name }}</label>
            </li>
          </ul>
        </div>
        <div>
          <h3>{{ $t('theme_selector_modal__dark_title') }}</h3>
          <ul :class="$style.theme">
            <li
              v-for="theme in themeInfo.themeDarks" :key="theme.id"
              :style="theme.styles" :aria-label="theme.name"
              :class="[{[$style.active]: isDarkActive(theme.id)}]" @click="setDarkId(theme.id)"
            >
              <span :class="$style.bg" />
              <label>{{ theme.name }}</label>
            </li>
          </ul>
        </div>
        <div :class="$style.opacitySettings">
          <div :class="$style.opacityItem">
            <span :class="$style.opacityLabel">{{ $t('theme_selector_modal__nav_opacity') }}</span>
            <base-slider-bar :class="$style.opacitySlider" :value="navOpacityValue" :min="0" :max="100" :step="1" @change="setNavOpacity" />
            <span :class="$style.opacityValue">{{ navOpacityValue }}%</span>
          </div>
          <div :class="$style.opacityItem">
            <span :class="$style.opacityLabel">{{ $t('theme_selector_modal__main_opacity') }}</span>
            <base-slider-bar :class="$style.opacitySlider" :value="mainOpacityValue" :min="0" :max="100" :step="1" @change="setMainOpacity" />
            <span :class="$style.opacityValue">{{ mainOpacityValue }}%</span>
          </div>
          <div :class="$style.opacityItem">
            <span :class="$style.opacityLabel">{{ $t('theme_selector_modal__glass_blur') }}</span>
            <base-slider-bar :class="$style.opacitySlider" :value="glassBlurValue" :min="0" :max="20" :step="1" @change="setGlassBlur" />
            <span :class="$style.opacityValue">{{ glassBlurValue }}px</span>
          </div>
        </div>
      </div>
      <div :class="$style.note">
        <p>{{ $t(immediate ? 'theme_selector_modal__skin_tip' : 'theme_selector_modal__title_tip') }}</p>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { computed, markRaw, reactive, watch } from '@common/utils/vueTools'
import { appSetting, mergeSetting, updateSetting } from '@renderer/store/setting'
import { themeId, themeShouldUseDarkColors } from '@renderer/store'
import { applyTheme, getThemes, buildBgUrl } from '@renderer/store/utils'
import { alphaPercent, getLastRawThemeColors, parseBlurPx } from '@renderer/utils/themeOpacity'

export default {
  name: 'ThemeSelectorModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    // 从侧边栏等 view 层之外的入口打开时需传 '#root'，避免被播放详情页(z-index 更高)遮挡
    teleport: {
      type: String,
      default: '#view',
    },
    // 换肤模式：点击主题立即应用（而非仅作为跟随系统的亮/暗预设）
    immediate: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props) {
    const themeInfo = reactive({
      themeLights: [],
      themeDarks: [],
    })
    const themeDefaults = reactive({
      navOpacity: 94,
      mainOpacity: 94,
      glassBlur: 8,
    })
    let dataPath = ''

    const readThemeDefaults = () => {
      const colors = getLastRawThemeColors()
      const styles = getComputedStyle(document.documentElement)
      themeDefaults.navOpacity = alphaPercent(colors['--color-nav-background'] || styles.getPropertyValue('--color-nav-background'))
      themeDefaults.mainOpacity = alphaPercent(colors['--color-main-background'] || styles.getPropertyValue('--color-main-background'))
      themeDefaults.glassBlur = parseBlurPx(colors['--blur-glass'] || styles.getPropertyValue('--blur-glass'))
    }

    watch(() => props.modelValue, (val) => {
      if (!val) return
      readThemeDefaults()
      getThemes((info) => {
      // console.log(info)
        const themes = [...info.themes, ...info.userThemes]
        const lights = []
        const darks = themes.filter(t => {
          if (t.isDark) return true
          lights.push(t)
          return false
        })
        dataPath = info.dataPath
        themeInfo.themeLights = lights.map(t => {
          return {
            id: t.id,
            // @ts-expect-error
            name: t.isCustom ? t.name : window.i18n.t('theme_' + t.id),
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.isCustom
                ? t.config.extInfo['--background-image'] == 'none'
                  ? 'none'
                  : buildBgUrl(t.config.extInfo['--background-image'], info.dataPath)
                : t.config.extInfo['--background-image'],
            },
          }
        })
        themeInfo.themeDarks = markRaw(darks.map(t => {
          return {
            id: t.id,
            // @ts-expect-error
            name: t.isCustom ? t.name : window.i18n.t('theme_' + t.id),
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.isCustom
                ? t.config.extInfo['--background-image'] == 'none'
                  ? 'none'
                  : buildBgUrl(t.config.extInfo['--background-image'], info.dataPath)
                : t.config.extInfo['--background-image'],
            },
          }
        }))
      })
    })

    const currentThemeId = () => {
      if (appSetting['theme.id'] != 'auto') return appSetting['theme.id']
      return themeShouldUseDarkColors.value ? appSetting['theme.darkId'] : appSetting['theme.lightId']
    }
    const isLightActive = (id) => {
      if (props.immediate) return currentThemeId() == id
      return appSetting['theme.lightId'] == id
    }
    const isDarkActive = (id) => {
      if (props.immediate) return currentThemeId() == id
      return appSetting['theme.darkId'] == id
    }
    const setLightId = (id) => {
      if (props.immediate) {
        if (appSetting['theme.id'] == id) return
        themeId.value = id
        applyTheme(id, id, appSetting['theme.darkId'], dataPath)
        updateSetting({ 'theme.id': id, 'theme.lightId': id })
        window.setTimeout(readThemeDefaults, 0)
        return
      }
      if (appSetting['theme.lightId'] == id) return
      updateSetting({ 'theme.lightId': id })
      if (appSetting['theme.id'] == 'auto') {
        applyTheme('auto', id, appSetting['theme.darkId'], dataPath)
        window.setTimeout(readThemeDefaults, 0)
      }
    }
    const setDarkId = (id) => {
      if (props.immediate) {
        if (appSetting['theme.id'] == id) return
        themeId.value = id
        applyTheme(id, appSetting['theme.lightId'], id, dataPath)
        updateSetting({ 'theme.id': id, 'theme.darkId': id })
        window.setTimeout(readThemeDefaults, 0)
        return
      }
      if (appSetting['theme.darkId'] == id) return
      updateSetting({ 'theme.darkId': id })
      if (appSetting['theme.id'] == 'auto') {
        applyTheme('auto', appSetting['theme.lightId'], id, dataPath)
        window.setTimeout(readThemeDefaults, 0)
      }
    }
    const navOpacityValue = computed(() => {
      return appSetting['theme.navOpacity'] >= 0 ? appSetting['theme.navOpacity'] : themeDefaults.navOpacity
    })
    const mainOpacityValue = computed(() => {
      return appSetting['theme.mainOpacity'] >= 0 ? appSetting['theme.mainOpacity'] : themeDefaults.mainOpacity
    })
    const glassBlurValue = computed(() => {
      return appSetting['theme.glassBlur'] >= 0 ? appSetting['theme.glassBlur'] : themeDefaults.glassBlur
    })
    const persistOpacity = (setting) => {
      mergeSetting(setting)
      updateSetting(setting)
    }
    const setNavOpacity = (value) => persistOpacity({ 'theme.navOpacity': value })
    const setMainOpacity = (value) => persistOpacity({ 'theme.mainOpacity': value })
    const setGlassBlur = (value) => persistOpacity({ 'theme.glassBlur': value })
    return {
      appSetting,
      themeInfo,
      isLightActive,
      isDarkActive,
      setLightId,
      setDarkId,
      navOpacityValue,
      mainOpacityValue,
      glassBlurValue,
      setNavOpacity,
      setMainOpacity,
      setGlassBlur,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.main {
  // padding: 15px;
  // max-width: 400px;
  min-width: 300px;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  min-height: 0;
  h2 {
    flex: none;
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    padding: 15px;
  }
  h3 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    padding-bottom: 15px;
    font-size: 15px;
  }
}
.content {
  flex: auto;
  padding: 15px;
  display: flex;
  flex-flow: column nowrap;
  gap: 15px;
}
.theme {
  display: flex;
  flex-flow: row wrap;
  // padding: 0 15px;

  li {
    display: flex;
    flex-flow: column nowrap;
    align-items: center;
    cursor: pointer;
    // color: var(--color-primary);
    margin-right: 4px;
    transition: color .3s ease;
    margin-bottom: 15px;
    width: 86px;

    &:last-child {
      margin-right: 0;
    }

    &.active {
      color: var(--color-primary-theme);
      .bg {
        border-color: var(--color-primary-theme);
      }
    }

    .bg {
      display: block;
      width: 36px;
      height: 36px;
      margin-bottom: 5px;
      border: 2px solid transparent;
      padding: 2px;
      transition: border-color .3s ease;
      border-radius: 5px;
      &:after {
        display: block;
        content: ' ';
        width: 100%;
        height: 100%;
        border-radius: @radius-border;
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        background-color: var(--color-primary-theme);
        background-image: var(--background-image-theme);
      }
    }

    label {
      width: 100%;
      text-align: center;
      height: 1.2em;
      font-size: 14px;
    }
  }
}

.opacitySettings {
  display: flex;
  flex-flow: column nowrap;
  gap: 12px;
  padding-top: 4px;
}
.opacityItem {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 12px;
  color: var(--color-font);
}
.opacityLabel {
  flex: none;
  width: 7.5em;
  font-size: 13px;
  line-height: 1.3;
}
.opacitySlider {
  flex: auto !important;
  width: auto !important;
}
.opacityValue {
  flex: none;
  width: 3.2em;
  text-align: right;
  font-size: 13px;
  opacity: .7;
}

.note {
  padding: 8px 15px;
  font-size: 13px;
  line-height: 1.25;
  color: var(--color-font);
  // p {
  //   + p {
  //     margin-top: 5px;
  //   }
  // }
}

</style>
