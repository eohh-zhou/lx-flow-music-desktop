import { computed, nextTick } from '@common/utils/vueTools'
import { setting, isDoubleLine, isLyricMenuOpen } from '@lyric/store/state'
import { updateSetting } from '@lyric/store/action'
import { sendDesktopLyricInfo } from '@lyric/core/mainWindowChannel'
import { setIgnoreMouseEvents, setWinOverlay } from '@lyric/utils/ipc'
import { syncLyricBarSide } from '@lyric/utils/lyricBarSide'
import { COLOR_PRESETS } from './lyricColors'

export const showLyricMenu = (place) => {
  isLyricMenuOpen.value = true
  setWinOverlay(true)
  setIgnoreMouseEvents(false, true)
  window.setTimeout(() => {
    nextTick().then(place, () => {})
  }, 80)
}

export const hideLyricMenu = () => {
  if (!isLyricMenuOpen.value) return
  isLyricMenuOpen.value = false
  setWinOverlay(false)
  syncLyricBarSide()
}

export const useLyricMenu = (t) => {
  const isCurrentPreset = (preset) => {
    return setting['desktopLyric.style.lyricPlayedColor'] == preset.played &&
      setting['desktopLyric.style.lyricUnplayColor'] == preset.unplay &&
      setting['desktopLyric.style.lyricShadowColor'] == preset.shadow
  }

  const menuItems = computed(() => {
    const isVertical = setting['desktopLyric.direction'] == 'vertical'
    return [
      {
        key: 'always_on_top',
        icon: 'pin',
        label: t('lyric_menu__always_on_top'),
        checked: setting['desktopLyric.isAlwaysOnTop'],
      },
      {
        key: 'toggle_double',
        icon: 'double',
        label: t('lyric_menu__toggle_double'),
        checked: isDoubleLine.value,
        disabled: isVertical,
      },
      {
        key: 'foreign',
        icon: 'translate',
        label: t('lyric_menu__foreign'),
        children: [
          { key: 'translation', label: t('setting__play_lyric_transition'), checked: setting['player.isShowLyricTranslation'] },
          { key: 'roma', label: t('setting__play_lyric_roma'), checked: setting['player.isShowLyricRoma'] },
        ],
      },
      {
        key: 'toggle_vertical',
        icon: 'vertical',
        label: t('lyric_menu__toggle_vertical'),
        checked: isVertical,
        disabled: true,
      },
      {
        key: 'align',
        icon: 'align',
        label: t('lyric_menu__align_mode'),
        children: [
          { key: 'align_left', label: t('setting__desktop_lyric_align_left'), checked: setting['desktopLyric.style.align'] == 'left' },
          { key: 'align_center', label: t('setting__desktop_lyric_align_center'), checked: setting['desktopLyric.style.align'] == 'center' },
          { key: 'align_right', label: t('setting__desktop_lyric_align_right'), checked: setting['desktopLyric.style.align'] == 'right' },
        ],
      },
      {
        key: 'colors',
        icon: 'color',
        label: t('lyric_menu__change_color'),
        children: [
          ...COLOR_PRESETS.map(preset => ({
            key: 'color_' + preset.key,
            label: t(preset.labelKey),
            checked: isCurrentPreset(preset),
          })),
          { key: 'color_custom', label: t('lyric_menu__color_custom'), checked: !COLOR_PRESETS.some(isCurrentPreset) },
        ],
      },
      {
        key: 'more',
        icon: 'more',
        label: t('lyric_menu__more_settings'),
      },
    ]
  })

  const handleMenuAction = (item) => {
    switch (item.key) {
      case 'always_on_top':
        updateSetting({ 'desktopLyric.isAlwaysOnTop': !setting['desktopLyric.isAlwaysOnTop'] })
        break
      case 'toggle_double':
        isDoubleLine.value = !isDoubleLine.value
        break
      case 'translation':
        updateSetting({ 'player.isShowLyricTranslation': !setting['player.isShowLyricTranslation'] })
        break
      case 'roma':
        updateSetting({ 'player.isShowLyricRoma': !setting['player.isShowLyricRoma'] })
        break
      case 'toggle_vertical':
        break
      case 'align_left':
      case 'align_center':
      case 'align_right':
        updateSetting({ 'desktopLyric.style.align': item.key.split('_')[1] })
        break
      case 'color_custom':
      case 'more':
        sendDesktopLyricInfo('open_settings')
        break
      default:
        if (item.key.startsWith('color_')) {
          const preset = COLOR_PRESETS.find(p => 'color_' + p.key == item.key)
          if (preset) {
            updateSetting({
              'desktopLyric.style.lyricPlayedColor': preset.played,
              'desktopLyric.style.lyricUnplayColor': preset.unplay,
              'desktopLyric.style.lyricShadowColor': preset.shadow,
            })
          }
        }
    }
  }

  return {
    menuItems,
    handleMenuAction,
  }
}
