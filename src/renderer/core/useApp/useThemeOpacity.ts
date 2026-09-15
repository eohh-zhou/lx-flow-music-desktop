import { watch } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { applyTheme, getThemes } from '@renderer/store/utils'
import { applyThemeOpacityColors, getLastRawThemeColors, setLastRawThemeColors } from '@renderer/utils/themeOpacity'

export default () => {
  const rawSetTheme = window.setTheme.bind(window)
  const applyOverlay = (colors?: Record<string, string>) => {
    const rawColors = colors ?? getLastRawThemeColors()
    if (!rawColors || !Object.keys(rawColors).length) return
    setLastRawThemeColors(rawColors)
    rawSetTheme(applyThemeOpacityColors(rawColors, {
      navOpacity: appSetting['theme.navOpacity'],
      mainOpacity: appSetting['theme.mainOpacity'],
      glassBlur: appSetting['theme.glassBlur'],
      navGlassBlur: appSetting['theme.navGlassBlur'],
      mainGlassBlur: appSetting['theme.mainGlassBlur'],
    }))
  }

  window.setTheme = (colors) => {
    applyOverlay(colors)
  }

  const reloadTheme = () => {
    getThemes(({ dataPath }) => {
      applyTheme(appSetting['theme.id'], appSetting['theme.lightId'], appSetting['theme.darkId'], dataPath)
    })
  }

  reloadTheme()

  watch(() => [
    appSetting['theme.navOpacity'],
    appSetting['theme.mainOpacity'],
    appSetting['theme.glassBlur'],
    appSetting['theme.navGlassBlur'],
    appSetting['theme.mainGlassBlur'],
  ], () => {
    applyOverlay()
  })
}
