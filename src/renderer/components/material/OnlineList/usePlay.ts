// import { useCommit } from '@common/utils/vueTools'
import { setTempList } from '@renderer/store/list/action'
import { addTempPlayList } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { playList } from '@renderer/core/player'
import { type Ref } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'

export default ({ selectedList, props, removeAllSelect, emit }: {
  selectedList: Ref<LX.Music.MusicInfoOnline[]>
  props: {
    list: LX.Music.MusicInfoOnline[]
  }
  removeAllSelect: () => void
  emit: (event: 'show-menu' | 'play-list' | 'togglePage', ...args: any[]) => void
}) => {
  let clickTime = 0
  let clickIndex = -1

  // 播放在线歌曲时以临时列表作为播放队列，不写入试听列表；
  // 歌曲真正播放后由 usePlayHistory 记录到试听列表顶部
  const handlePlayMusic = async(index: number, single: boolean) => {
    const targetSong = props.list[index]
    if (!targetSong) return
    let playIndex = index
    let playMusics: LX.Music.MusicInfoOnline[]
    if (selectedList.value.length && !single) {
      playMusics = [...selectedList.value]
      const targetIndex = playMusics.findIndex((s: LX.Music.MusicInfoOnline) => s.id == targetSong.id)
      if (targetIndex > -1) playIndex = targetIndex
      removeAllSelect()
    } else {
      playMusics = [...props.list]
    }
    await setTempList(`play__${Date.now()}`, playMusics)
    playList(LIST_IDS.TEMP, playIndex)
  }

  const handlePlayMusicLater = (index: number, single: boolean) => {
    if (selectedList.value.length && !single) {
      addTempPlayList(selectedList.value.map(s => ({ listId: LIST_IDS.PLAY_LATER, musicInfo: s })))
      removeAllSelect()
    } else {
      addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo: props.list[index] }])
    }
  }

  const doubleClickPlay = (index: number) => {
    if (
      window.performance.now() - clickTime > 400 ||
      clickIndex !== index
    ) {
      clickTime = window.performance.now()
      clickIndex = index
      return
    }
    if (appSetting['list.isClickPlayList']) {
      emit('play-list', index)
    } else {
      void handlePlayMusic(index, true)
    }
    clickTime = 0
    clickIndex = -1
  }

  return {
    handlePlayMusic,
    handlePlayMusicLater,
    doubleClickPlay,
  }
}
