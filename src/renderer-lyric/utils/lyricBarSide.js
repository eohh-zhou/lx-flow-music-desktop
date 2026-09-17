import { isLyricBarBelow, isLyricMenuOpen } from '@lyric/store/state'

export const TOP_BAR_ON_Y = 36
export const TOP_BAR_OFF_Y = 64

export const syncLyricBarSide = (y = window.screenY) => {
  if (isLyricMenuOpen.value) return
  if (y <= TOP_BAR_ON_Y) isLyricBarBelow.value = true
  else if (y >= TOP_BAR_OFF_Y) isLyricBarBelow.value = false
}
