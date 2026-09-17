import { ref, shallowReactive } from '@common/utils/vueTools'

export const setting = shallowReactive<LX.DesktopLyric.Config>({
  'desktopLyric.enable': false,
  'desktopLyric.isLock': false,
  'desktopLyric.isAlwaysOnTop': true,
  'desktopLyric.isAlwaysOnTopLoop': true,
  'desktopLyric.isShowTaskbar': false,
  'desktopLyric.pauseHide': false,
  'desktopLyric.audioVisualization': false,
  'desktopLyric.width': 860,
  'desktopLyric.height': 120,
  'desktopLyric.x': null,
  'desktopLyric.y': null,
  'desktopLyric.isLockScreen': true,
  'desktopLyric.isDelayScroll': true,
  'desktopLyric.scrollAlign': 'center',
  'desktopLyric.isHoverHide': false,
  'desktopLyric.direction': 'horizontal',
  'desktopLyric.style.align': 'center',
  'desktopLyric.style.lyricUnplayColor': 'rgba(255, 255, 255, 1)',
  'desktopLyric.style.lyricPlayedColor': 'rgba(236, 65, 65, 1)',
  'desktopLyric.style.lyricShadowColor': 'rgba(0, 0, 0, 0.35)',
  'desktopLyric.style.font': '',
  'desktopLyric.style.fontSize': 26,
  'desktopLyric.style.lineGap': 10,
  // 'desktopLyric.style.fontWeight': true,
  'desktopLyric.style.opacity': 100,
  'desktopLyric.style.ellipsis': true,
  'desktopLyric.style.isFontWeightFont': true,
  'desktopLyric.style.isFontWeightLine': true,
  'desktopLyric.style.isFontWeightExtended': true,
  'desktopLyric.style.isZoomActiveLrc': true,
  'common.langId': 'zh-cn',
  'player.isShowLyricTranslation': false,
  'player.isShowLyricRoma': false,
  'player.isSwapLyricTranslationAndRoma': false,
  'player.isPlayLxlrc': false,
  'player.playbackRate': 1,
})

// export const themeList = markRaw([
//   {
//     id: 0,
//     className: 'green',
//   },
//   {
//     id: 1,
//     className: 'yellow',
//   },
//   {
//     id: 2,
//     className: 'blue',
//   },
//   {
//     id: 3,
//     className: 'red',
//   },
//   {
//     id: 4,
//     className: 'pink',
//   },
//   {
//     id: 5,
//     className: 'purple',
//   },
//   {
//     id: 6,
//     className: 'orange',
//   },
//   {
//     id: 7,
//     className: 'grey',
//   },
//   {
//     id: 8,
//     className: 'ming',
//   },
//   {
//     id: 9,
//     className: 'blue2',
//   },
// ])

// export type Status = 'playing' | 'paused' | 'stopped'

// export const status = ref<Status>('stopped')
export const isPlay = ref(false)
export const isDoubleLine = ref(false)
export const isLyricMenuOpen = ref(false)
export const isLyricBarBelow = ref(window.screenY <= 36)

export const musicInfo = shallowReactive<{
  id: string | null
  name: string
  singer: string
  album: string | null
}>({
  id: null,
  name: '^',
  singer: '^',
  album: null,
})
