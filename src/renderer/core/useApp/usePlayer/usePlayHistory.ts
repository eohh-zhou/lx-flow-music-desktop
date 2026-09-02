import { onBeforeUnmount } from '@common/utils/vueTools'

import { playMusicInfo } from '@renderer/store/player/state'
import { recordPlayMusic } from '@renderer/store/list/action'

// 仅在歌曲真正开始播放时记录一次，切歌后允许再次记录（重播同一首歌也会重新置顶）
let lastRecordedId: string | null = null

export default () => {
  const handleMusicToggled = () => {
    lastRecordedId = null
  }
  const handlePlaying = () => {
    const current = playMusicInfo.musicInfo
    if (!current) return
    const info = 'progress' in current ? current.metadata.musicInfo : current
    if (lastRecordedId == info.id) return
    lastRecordedId = info.id
    void recordPlayMusic(info)
  }

  window.app_event.on('musicToggled', handleMusicToggled)
  window.app_event.on('playerPlaying', handlePlaying)

  onBeforeUnmount(() => {
    window.app_event.off('musicToggled', handleMusicToggled)
    window.app_event.off('playerPlaying', handlePlaying)
  })
}
